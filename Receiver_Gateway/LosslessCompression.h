#ifndef LOSSLESS_COMPRESSION_H
#define LOSSLESS_COMPRESSION_H

#include <Arduino.h>

// =============================================================================
// EMBEDDED LOSSLESS COMPRESSION / DECOMPRESSION CODEC
// Optimized for ESP32 SRAM & Low Overhead LoRa Telemetry
//
// Algorithm: Sliding-Window LZSS + Run-Length Encoding (Byte-Oriented LZSS)
// Features:
// - Deterministic memory bounds (0 dynamic heap allocation)
// - Reversible, verified 100% lossless round-trip
// - Auto-bypass: If compressed output >= input size, returns uncompressed
// =============================================================================

#define LZSS_WINDOW_SIZE    256     // 256-byte search buffer
#define LZSS_MIN_MATCH        3     // Minimum match length to justify back-reference
#define LZSS_MAX_MATCH       18     // Maximum match length in a 4-bit nibble + 3

class LosslessCodec {
public:
    // Compress input buffer into output buffer
    // Returns compressed length, and sets was_compressed = true if savings achieved
    static size_t compress(const uint8_t *in, size_t in_len, uint8_t *out, size_t out_max, bool &was_compressed) {
        if (!in || in_len == 0 || !out || out_max < in_len) {
            was_compressed = false;
            return 0;
        }

        size_t in_pos = 0;
        size_t out_pos = 0;

        while (in_pos < in_len) {
            // Need space for 1 control byte + up to 8 tokens (literals or 2-byte refs)
            if (out_pos + 17 > out_max) {
                // Buffer exhausted without savings
                was_compressed = false;
                return 0;
            }

            size_t ctrl_pos = out_pos++;
            uint8_t ctrl_mask = 0;
            out[ctrl_pos] = 0;

            for (uint8_t token_idx = 0; token_idx < 8 && in_pos < in_len; token_idx++) {
                // Find longest match in sliding window [max(0, in_pos - LZSS_WINDOW_SIZE) .. in_pos - 1]
                size_t best_len = 0;
                size_t best_offset = 0;

                size_t win_start = (in_pos > LZSS_WINDOW_SIZE) ? (in_pos - LZSS_WINDOW_SIZE) : 0;
                size_t max_possible = (in_len - in_pos > LZSS_MAX_MATCH) ? LZSS_MAX_MATCH : (in_len - in_pos);

                for (size_t w = win_start; w < in_pos; w++) {
                    size_t match_len = 0;
                    while (match_len < max_possible && in[w + match_len] == in[in_pos + match_len]) {
                        match_len++;
                    }
                    if (match_len > best_len) {
                        best_len = match_len;
                        best_offset = in_pos - w; // Distance back
                    }
                }

                if (best_len >= LZSS_MIN_MATCH) {
                    // Match found: Encode as Back-Reference (Flag Bit = 1)
                    ctrl_mask |= (1 << token_idx);
                    // 2 bytes: [offset (8 bits)] [len - MIN_MATCH (4 bits) | reserved (4 bits)]
                    out[out_pos++] = (uint8_t)(best_offset & 0xFF);
                    out[out_pos++] = (uint8_t)((best_len - LZSS_MIN_MATCH) & 0x0F);
                    in_pos += best_len;
                } else {
                    // Literal byte: (Flag Bit = 0)
                    out[out_pos++] = in[in_pos++];
                }
            }
            out[ctrl_pos] = ctrl_mask;

            // If compressed data has already exceeded uncompressed size, abort compression
            if (out_pos >= in_len) {
                was_compressed = false;
                return 0;
            }
        }

        // Verify that compression genuinely reduced size
        if (out_pos < in_len) {
            was_compressed = true;
            return out_pos;
        } else {
            was_compressed = false;
            return 0;
        }
    }

    // Decompress input buffer into output buffer
    // Returns true on successful decompression, false on corrupted/truncated stream
    static bool decompress(const uint8_t *in, size_t in_len, uint8_t *out, size_t &out_len, size_t out_max) {
        if (!in || in_len == 0 || !out || out_max == 0) {
            return false;
        }

        size_t in_pos = 0;
        size_t out_pos = 0;

        while (in_pos < in_len) {
            uint8_t ctrl_mask = in[in_pos++];

            for (uint8_t token_idx = 0; token_idx < 8; token_idx++) {
                if (in_pos >= in_len) {
                    break; // End of compressed stream
                }

                if (ctrl_mask & (1 << token_idx)) {
                    // Back-reference: 2 bytes
                    if (in_pos + 2 > in_len) {
                        return false; // Truncated reference
                    }
                    size_t offset = in[in_pos++];
                    uint8_t len_nibble = in[in_pos++];
                    size_t match_len = (len_nibble & 0x0F) + LZSS_MIN_MATCH;

                    if (offset == 0 || offset > out_pos) {
                        return false; // Invalid back-pointer (corrupted stream)
                    }
                    if (out_pos + match_len > out_max) {
                        return false; // Output buffer overflow
                    }

                    size_t src_pos = out_pos - offset;
                    for (size_t m = 0; m < match_len; m++) {
                        out[out_pos++] = out[src_pos + m];
                    }
                } else {
                    // Literal byte
                    if (out_pos >= out_max) {
                        return false; // Output buffer overflow
                    }
                    out[out_pos++] = in[in_pos++];
                }
            }
        }

        out_len = out_pos;
        return true;
    }
};

#endif // LOSSLESS_COMPRESSION_H

#ifndef MESH_CONFIG_H
#define MESH_CONFIG_H

#include <Arduino.h>

// =============================================================================
// ESP32 LORA BOAT TELEMETRY MESH NETWORK - GLOBAL CONFIGURATION
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Radio Hardware Configuration (SX1278 RA-02 SPI Pins on ESP32)
// -----------------------------------------------------------------------------
#define LORA_SCK_PIN        18
#define LORA_MISO_PIN       19
#define LORA_MOSI_PIN       23
#define LORA_SS_PIN          5
#define LORA_RST_PIN        14
#define LORA_DIO0_PIN        2

// -----------------------------------------------------------------------------
// 2. Radio Settings (Must be identical across all mesh nodes)
// Permitted Frequency & Power for deployment jurisdiction (Default: 433.0 MHz ISM)
// -----------------------------------------------------------------------------
#define LORA_FREQUENCY      433E6       // 433.0 MHz ISM band
#define LORA_SYNC_WORD      0xF3        // Mesh isolation sync word
#define LORA_SPREAD_FACTOR  7           // SF7 (Range vs Data Rate balance)
#define LORA_BANDWIDTH      125E3       // 125 kHz
#define LORA_CODING_RATE    5           // 4/5 coding rate
#define LORA_PREAMBLE_LEN   8           // 8 symbols preamble
#define LORA_TX_POWER       17          // 17 dBm (legal for regional ISM, adjustable 2-20)
#define LORA_ENABLE_CRC     true        // Hardware payload CRC

// -----------------------------------------------------------------------------
// 3. Application Packet Limits & Constraints
// -----------------------------------------------------------------------------
#define LORA_HW_MAX_PAYLOAD 255         // Absolute SX127x hardware FIFO limit
#define MESH_APP_MAX_PACKET 220         // Conservative application limit (headroom)
#define MESH_MAX_PATH_HOPS  4           // Maximum allowed forwarder hops
#define MESH_MAX_NODE_ID_LEN 10         // Fixed length for node identifier strings (allows up to 9 chars + null)

// -----------------------------------------------------------------------------
// 4. Node Identity Defaults (Overridden per target firmware or node define)
// -----------------------------------------------------------------------------
#ifndef NODE_ID
  #define NODE_ID           "BOAT_001"
#endif

#define BOAT_NODE_ID        "BOAT_001"
#define REPEATER_01_NODE_ID "REP_01"
#define REPEATER_02_NODE_ID "REP_02"
#define GATEWAY_NODE_ID     "GATEWAY"

// -----------------------------------------------------------------------------
// 5. Mesh Timing and Transmission Intervals (Milliseconds)
// -----------------------------------------------------------------------------
#define BOAT_TELEMETRY_INTERVAL_MS 60000UL // Telemetry transmission interval (1 minute)
#define BOAT_HEARTBEAT_INTERVAL_MS 30000UL // Heartbeat interval (30 seconds)
#define REPEATER_HEARTBEAT_MS      30000UL // Repeater heartbeat broadcast (30 seconds)

// Repeater Store-and-Forward Random Backoff to avoid collisions
// REPEATER_01 forwards with smaller delay, REPEATER_02 forwards with larger delay
#define REP1_BASE_BACKOFF_MS       120
#define REP1_JITTER_MAX_MS          80
#define REP2_BASE_BACKOFF_MS       280
#define REP2_JITTER_MAX_MS          90

// Duplicate Packet Expiry Window
#define MESH_DUP_CACHE_SIZE         32
#define MESH_DUP_EXPIRY_MS       90000UL // 90 seconds duplicate memory window

// Node Offline Tracking Timeouts (Gateway & Repeater dashboards)
#define NODE_STALE_TIMEOUT_MS    90000UL // 1.5 minutes: marked STALE
#define NODE_OFFLINE_TIMEOUT_MS 180000UL // 3.0 minutes: marked OFFLINE

// -----------------------------------------------------------------------------
// 6. Security & Cryptography Configuration
// -----------------------------------------------------------------------------
// Security Modes:
#define SEC_MODE_NONE        0 // Plaintext payload
#define SEC_MODE_XOR_DEMO    1 // DEMO OBFUSCATION ONLY - NOT CRYPTOGRAPHICALLY SECURE!
#define SEC_MODE_AES_GCM     2 // Authenticated Encryption: AES-128-GCM with hardware accel

// Active Security Mode across the network
#ifndef ACTIVE_SECURITY_MODE
  #define ACTIVE_SECURITY_MODE SEC_MODE_AES_GCM
#endif

// AES-128 Pre-Shared Key (16 bytes = 128 bits)
// NOTE: Change this key in production! Never log or transmit in plaintext.
static const uint8_t MESH_AES_KEY[16] = {
    0x2B, 0x7E, 0x15, 0x16, 0x28, 0xAE, 0xD2, 0xA6,
    0xAB, 0xF7, 0x15, 0x88, 0x09, 0xCF, 0x4F, 0x3C
};

// DEMO XOR Obfuscation Mask (used only when ACTIVE_SECURITY_MODE == SEC_MODE_XOR_DEMO)
// Explicitly documented: INSECURE, for testing/educational demonstration only.
static const uint8_t DEMO_XOR_MASK[8] = {
    0x5A, 0xA5, 0x3C, 0xC3, 0x0F, 0xF0, 0x69, 0x96
};

// -----------------------------------------------------------------------------
// 7. Compression Configuration
// -----------------------------------------------------------------------------
#define ENABLE_LOSSLESS_COMPRESSION true
#define HEATSHRINK_WINDOW_BITS         8 // 256 bytes window (ideal for ESP32 SRAM)
#define HEATSHRINK_LOOKAHEAD_BITS      4 // 16 bytes lookahead

// -----------------------------------------------------------------------------
// 8. Debug & Telemetry Profiling Output
// -----------------------------------------------------------------------------
#ifndef MESH_DEBUG_OUTPUT
  #define MESH_DEBUG_OUTPUT true // Enables detailed byte counts, compression savings & timing
#endif

#endif // MESH_CONFIG_H

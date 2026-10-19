#ifndef PACKET_CODEC_H
#define PACKET_CODEC_H

#include <Arduino.h>
#include "MeshConfig.h"
#include "MeshProtocol.h"
#include "LosslessCompression.h"
#include "MeshCrypto.h"

// =============================================================================
// PACKET PROFILING METRICS (Used for Debug Mode Benchmarking)
// =============================================================================
struct CodecMetrics {
    size_t json_bytes = 0;          // Unencoded JSON string size
    size_t binary_bytes = 0;        // Compact binary struct size (39 bytes)
    size_t compressed_bytes = 0;    // Post-Heatshrink/LZSS size
    size_t encrypted_bytes = 0;     // Post-AES/XOR ciphertext size
    size_t header_overhead = 0;     // Mesh header + routing + crypto tags
    size_t total_packet_bytes = 0;  // Final transmitted LoRa packet size
    float  compression_ratio = 1.0f;// original / compressed
    float  savings_percent = 0.0f;  // (1 - total/json) * 100
    unsigned long duration_us = 0;  // Execution time in microseconds
};

// Reasons for packet rejection
enum PacketDropReason {
    DROP_NONE = 0,
    DROP_INVALID_LENGTH,
    DROP_BAD_MAGIC,
    DROP_CRC_FAILED,
    DROP_AUTH_FAILED,
    DROP_DECOMPRESS_FAILED,
    DROP_DUPLICATE,
    DROP_HOP_LIMIT_EXCEEDED,
    DROP_ROUTING_LOOP,
    DROP_BUFFER_OVERFLOW
};

class PacketCodec {
public:
    // -------------------------------------------------------------------------
    // 1. Populate BinaryTelemetry Struct from Raw Sensor Inputs
    // -------------------------------------------------------------------------
    static void buildBinaryTelemetry(
        BinaryTelemetry &bin,
        bool dhtValid, float airTemp, float airHum,
        bool ds18b20Valid, float waterTemp,
        bool turbValid, float turbPct,
        bool tdsValid, float tdsPpm,
        bool phValid, float phVal,
        bool gpsValid, double lat, double lon, float alt, float spd, int sat,
        bool mpuValid, float roll, float pitch, float ax, float ay, float az, float gx, float gy, float gz)
    {
        memset(&bin, 0, sizeof(BinaryTelemetry));
        bin.schema_version = MESH_PROTOCOL_VERSION;
        bin.validity_bitmap = 0;

        // Environmental: DHT11
        if (dhtValid && !isnan(airTemp) && !isinf(airTemp)) {
            bin.validity_bitmap |= MESH_VALID_DHT_TEMP;
            bin.air_temp_c10 = (int16_t)round(airTemp * 10.0f);
        } else {
            bin.air_temp_c10 = MESH_NULL_INT16;
        }

        if (dhtValid && !isnan(airHum) && !isinf(airHum)) {
            bin.validity_bitmap |= MESH_VALID_DHT_HUM;
            bin.air_hum_pct10 = (uint16_t)round(airHum * 10.0f);
        } else {
            bin.air_hum_pct10 = MESH_NULL_UINT16;
        }

        // Water Temperature: DS18B20
        if (ds18b20Valid && !isnan(waterTemp) && !isinf(waterTemp)) {
            bin.validity_bitmap |= MESH_VALID_DS18B20;
            bin.water_temp_c100 = (int16_t)round(waterTemp * 100.0f);
        } else {
            bin.water_temp_c100 = MESH_NULL_INT16;
        }

        // Turbidity
        if (turbValid && !isnan(turbPct) && !isinf(turbPct)) {
            bin.validity_bitmap |= MESH_VALID_TURBIDITY;
            bin.turbidity_pct10 = (uint16_t)round(turbPct * 10.0f);
        } else {
            bin.turbidity_pct10 = MESH_NULL_UINT16;
        }

        // TDS
        if (tdsValid && !isnan(tdsPpm) && !isinf(tdsPpm)) {
            bin.validity_bitmap |= MESH_VALID_TDS;
            bin.tds_ppm10 = (uint16_t)round(tdsPpm * 10.0f);
        } else {
            bin.tds_ppm10 = MESH_NULL_UINT16;
        }

        // pH
        if (phValid && !isnan(phVal) && !isinf(phVal)) {
            bin.validity_bitmap |= MESH_VALID_PH;
            bin.ph_x100 = (uint16_t)round(phVal * 100.0f);
        } else {
            bin.ph_x100 = MESH_NULL_UINT16;
        }

        // GPS
        if (gpsValid && (lat != 0.0 || lon != 0.0)) {
            bin.validity_bitmap |= MESH_VALID_GPS_FIX;
            bin.latitude_e6 = (int32_t)round(lat * 1e6);
            bin.longitude_e6 = (int32_t)round(lon * 1e6);

            bin.validity_bitmap |= MESH_VALID_GPS_EXTRA;
            bin.altitude_dm = (int16_t)round(alt * 10.0f);
            bin.speed_kmh10 = (uint16_t)round(spd * 10.0f);
            bin.satellites = (uint8_t)constrain(sat, 0, 255);
        } else {
            bin.latitude_e6 = MESH_NULL_INT32;
            bin.longitude_e6 = MESH_NULL_INT32;
            bin.altitude_dm = MESH_NULL_INT16;
            bin.speed_kmh10 = MESH_NULL_UINT16;
            bin.satellites = 0;
        }

        // MPU6050 Motion
        if (mpuValid) {
            bin.validity_bitmap |= MESH_VALID_MPU_ATT | MESH_VALID_MPU_ACCEL | MESH_VALID_MPU_GYRO;
            bin.roll_deg10 = (int16_t)round(roll * 10.0f);
            bin.pitch_deg10 = (int16_t)round(pitch * 10.0f);

            bin.accel_x_mg = (int16_t)round(ax * 1000.0f);
            bin.accel_y_mg = (int16_t)round(ay * 1000.0f);
            bin.accel_z_mg = (int16_t)round(az * 1000.0f);

            bin.gyro_x_dps10 = (int16_t)round(gx * 10.0f);
            bin.gyro_y_dps10 = (int16_t)round(gy * 10.0f);
            bin.gyro_z_dps10 = (int16_t)round(gz * 10.0f);
        } else {
            bin.roll_deg10 = MESH_NULL_INT16;
            bin.pitch_deg10 = MESH_NULL_INT16;
            bin.accel_x_mg = 0;
            bin.accel_y_mg = 0;
            bin.accel_z_mg = 0;
            bin.gyro_x_dps10 = 0;
            bin.gyro_y_dps10 = 0;
            bin.gyro_z_dps10 = 0;
        }
    }

    // -------------------------------------------------------------------------
    // 2. Generate Standard JSON Representation from BinaryTelemetry
    // -------------------------------------------------------------------------
    static String serializeTelemetryToJson(const BinaryTelemetry &bin, const char *sourceId, uint32_t seq, uint32_t session, uint32_t timestamp) {
        String json = "{";
        json += "\"id\":\"" + String(sourceId) + "\",";
        json += "\"seq\":" + String(seq) + ",";
        json += "\"session\":" + String(session) + ",";
        json += "\"ts\":" + String(timestamp) + ",";
        json += "\"v_map\":" + String(bin.validity_bitmap) + ",";

        // Environment
        json += "\"env\":{";
        json += "\"t\":" + ((bin.validity_bitmap & MESH_VALID_DHT_TEMP) ? String(bin.air_temp_c10 / 10.0f, 1) : "null") + ",";
        json += "\"h\":" + ((bin.validity_bitmap & MESH_VALID_DHT_HUM) ? String(bin.air_hum_pct10 / 10.0f, 1) : "null");
        json += "},";

        // Water Quality
        json += "\"water\":{";
        json += "\"wt\":" + ((bin.validity_bitmap & MESH_VALID_DS18B20) ? String(bin.water_temp_c100 / 100.0f, 2) : "null") + ",";
        json += "\"turb\":" + ((bin.validity_bitmap & MESH_VALID_TURBIDITY) ? String(bin.turbidity_pct10 / 10.0f, 1) : "null") + ",";
        json += "\"tds\":" + ((bin.validity_bitmap & MESH_VALID_TDS) ? String(bin.tds_ppm10 / 10.0f, 1) : "null") + ",";
        json += "\"ph\":" + ((bin.validity_bitmap & MESH_VALID_PH) ? String(bin.ph_x100 / 100.0f, 2) : "null");
        json += "},";

        // GPS
        json += "\"gps\":{";
        bool gpsOk = (bin.validity_bitmap & MESH_VALID_GPS_FIX);
        json += "\"ok\":" + String(gpsOk ? 1 : 0) + ",";
        json += "\"lat\":" + (gpsOk ? String(bin.latitude_e6 / 1e6, 6) : "null") + ",";
        json += "\"lon\":" + (gpsOk ? String(bin.longitude_e6 / 1e6, 6) : "null") + ",";
        json += "\"alt\":" + (gpsOk ? String(bin.altitude_dm / 10.0f, 1) : "null") + ",";
        json += "\"spd\":" + (gpsOk ? String(bin.speed_kmh10 / 10.0f, 1) : "null") + ",";
        json += "\"sat\":" + String(bin.satellites);
        json += "},";

        // MPU6050 Attitude & Motion
        json += "\"imu\":{";
        bool imuOk = (bin.validity_bitmap & MESH_VALID_MPU_ATT);
        json += "\"ok\":" + String(imuOk ? 1 : 0) + ",";
        json += "\"roll\":" + (imuOk ? String(bin.roll_deg10 / 10.0f, 1) : "null") + ",";
        json += "\"pitch\":" + (imuOk ? String(bin.pitch_deg10 / 10.0f, 1) : "null") + ",";
        json += "\"ax\":" + (imuOk ? String(bin.accel_x_mg / 1000.0f, 2) : "null") + ",";
        json += "\"ay\":" + (imuOk ? String(bin.accel_y_mg / 1000.0f, 2) : "null") + ",";
        json += "\"az\":" + (imuOk ? String(bin.accel_z_mg / 1000.0f, 2) : "null") + ",";
        json += "\"gx\":" + (imuOk ? String(bin.gyro_x_dps10 / 10.0f, 1) : "null") + ",";
        json += "\"gy\":" + (imuOk ? String(bin.gyro_y_dps10 / 10.0f, 1) : "null") + ",";
        json += "\"gz\":" + (imuOk ? String(bin.gyro_z_dps10 / 10.0f, 1) : "null");
        json += "}";
        json += "}";
        return json;
    }

    // -------------------------------------------------------------------------
    // 3. Complete Encode Pipeline:
    // Raw Binary -> Compression -> Encryption -> Frame Packaging + CRC
    // -------------------------------------------------------------------------
    static size_t encodeMeshPacket(
        uint8_t *packetOut, size_t maxPacketLen,
        uint8_t msgType,
        const char *sourceId, uint32_t sessionId, uint32_t sequenceId, uint32_t timestamp,
        uint8_t maxHops,
        const uint8_t *payloadIn, size_t payloadLen,
        uint8_t secMode,
        CodecMetrics *metrics = nullptr)
    {
        unsigned long t0 = micros();

        if (maxPacketLen < sizeof(MeshHeader) + 2) {
            return 0; // Buffer too small
        }

        // Temporary buffers
        uint8_t compressedBuf[128];
        uint8_t encryptedBuf[160];
        uint8_t ivBuf[AES_GCM_IV_LEN];
        uint8_t tagBuf[AES_GCM_TAG_LEN];

        // --- Step A: Lossless Compression (Heatshrink/LZSS) ---
        bool wasCompressed = false;
        size_t postCompLen = payloadLen;
        const uint8_t *pAfterComp = payloadIn;

        if (ENABLE_LOSSLESS_COMPRESSION && payloadLen > 0) {
            size_t compRes = LosslessCodec::compress(payloadIn, payloadLen, compressedBuf, sizeof(compressedBuf), wasCompressed);
            if (wasCompressed && compRes < payloadLen) {
                postCompLen = compRes;
                pAfterComp = compressedBuf;
            }
        }

        // --- Step B: Assemble Header ---
        MeshHeader header;
        memset(&header, 0, sizeof(MeshHeader));
        header.magic = MESH_MAGIC_BYTE;
        header.version = MESH_PROTOCOL_VERSION;
        header.msg_type = msgType;
        header.sec_mode = secMode;
        header.compressed = wasCompressed ? 1 : 0;
        strncpy(header.source_id, sourceId, sizeof(header.source_id) - 1);
        header.source_id[sizeof(header.source_id) - 1] = '\0';
        header.session_id = sessionId;
        header.sequence_id = sequenceId;
        header.created_at_ms = timestamp;
        header.hop_count = 0;
        header.max_hops = maxHops;
        header.path_count = 0;
        header.payload_len = (uint8_t)postCompLen;

        // --- Step C: Cryptography / Transform ---
        size_t postEncLen = postCompLen;
        const uint8_t *pAfterEnc = pAfterComp;

        if (secMode == SEC_MODE_AES_GCM) {
            MeshCrypto::generateGcmIV(sessionId, sequenceId, timestamp, ivBuf);
            // Prepare AAD identically from header fields (Source ID + Session ID + Sequence ID)
            uint8_t aad[16];
            memset(aad, 0, sizeof(aad));
            strncpy((char*)aad, header.source_id, 8);
            memcpy(aad + 8, &header.session_id, 4);
            memcpy(aad + 12, &header.sequence_id, 4);

            bool ok = MeshCrypto::encryptAES_GCM(
                pAfterComp, postCompLen,
                aad, sizeof(aad),
                ivBuf, AES_GCM_IV_LEN,
                encryptedBuf, tagBuf
            );
            if (!ok) {
                return 0; // Encryption error
            }
            postEncLen = postCompLen;
            pAfterEnc = encryptedBuf;
        } else if (secMode == SEC_MODE_XOR_DEMO) {
            MeshCrypto::applyDemoXOR(pAfterComp, postCompLen, encryptedBuf);
            postEncLen = postCompLen;
            pAfterEnc = encryptedBuf;
        }

        header.payload_len = (uint8_t)postEncLen;

        // Calculate total frame length
        size_t totalLen = sizeof(MeshHeader);
        if (secMode == SEC_MODE_AES_GCM) {
            totalLen += AES_GCM_IV_LEN + AES_GCM_TAG_LEN;
        }
        totalLen += postEncLen;
        totalLen += 2; // CRC16

        if (totalLen > maxPacketLen || totalLen > LORA_HW_MAX_PAYLOAD) {
            return 0; // Exceeds packet limit
        }

        // --- Step D: Copy into packet buffer ---
        size_t offset = 0;
        memcpy(packetOut + offset, &header, sizeof(MeshHeader));
        offset += sizeof(MeshHeader);

        if (secMode == SEC_MODE_AES_GCM) {
            memcpy(packetOut + offset, ivBuf, AES_GCM_IV_LEN);
            offset += AES_GCM_IV_LEN;
            memcpy(packetOut + offset, tagBuf, AES_GCM_TAG_LEN);
            offset += AES_GCM_TAG_LEN;
        }

        memcpy(packetOut + offset, pAfterEnc, postEncLen);
        offset += postEncLen;

        // --- Step E: Calculate & Append Frame CRC16 ---
        uint16_t crc = meshCalculateCRC16(packetOut, offset);
        packetOut[offset++] = (uint8_t)(crc >> 8);
        packetOut[offset++] = (uint8_t)(crc & 0xFF);

        unsigned long duration = micros() - t0;

        // Fill Profiling Metrics
        if (metrics) {
            metrics->binary_bytes = payloadLen;
            metrics->compressed_bytes = postCompLen;
            metrics->encrypted_bytes = postEncLen;
            metrics->header_overhead = offset - postEncLen;
            metrics->total_packet_bytes = offset;
            metrics->duration_us = duration;
            if (metrics->json_bytes > 0) {
                metrics->compression_ratio = (float)metrics->json_bytes / (float)offset;
                metrics->savings_percent = (1.0f - ((float)offset / (float)metrics->json_bytes)) * 100.0f;
            }
        }

        return offset;
    }

    // -------------------------------------------------------------------------
    // 4. Complete Decode Pipeline:
    // Frame Integrity (CRC) -> Decryption (AES-GCM / XOR) -> Decompression
    // -------------------------------------------------------------------------
    static bool decodeMeshPacket(
        const uint8_t *packetIn, size_t packetLen,
        MeshHeader &headerOut,
        uint8_t *payloadOut, size_t &payloadLenOut, size_t maxPayloadOut,
        PacketDropReason &dropReason,
        CodecMetrics *metrics = nullptr)
    {
        unsigned long t0 = micros();
        payloadLenOut = 0;
        dropReason = DROP_NONE;

        // Minimum length check
        if (!packetIn || packetLen < sizeof(MeshHeader) + 2) {
            dropReason = DROP_INVALID_LENGTH;
            return false;
        }

        // Verify CRC16
        uint16_t expectedCrc = ((uint16_t)packetIn[packetLen - 2] << 8) | packetIn[packetLen - 1];
        uint16_t actualCrc = meshCalculateCRC16(packetIn, packetLen - 2);
        if (expectedCrc != actualCrc) {
            dropReason = DROP_CRC_FAILED;
            return false;
        }

        // Extract Header
        memcpy(&headerOut, packetIn, sizeof(MeshHeader));
        if (headerOut.magic != MESH_MAGIC_BYTE) {
            dropReason = DROP_BAD_MAGIC;
            return false;
        }

        size_t offset = sizeof(MeshHeader);
        size_t encPayloadLen = headerOut.payload_len;

        uint8_t ivBuf[AES_GCM_IV_LEN];
        uint8_t tagBuf[AES_GCM_TAG_LEN];

        if (headerOut.sec_mode == SEC_MODE_AES_GCM) {
            if (offset + AES_GCM_IV_LEN + AES_GCM_TAG_LEN + encPayloadLen + 2 > packetLen) {
                dropReason = DROP_INVALID_LENGTH;
                return false;
            }
            memcpy(ivBuf, packetIn + offset, AES_GCM_IV_LEN);
            offset += AES_GCM_IV_LEN;
            memcpy(tagBuf, packetIn + offset, AES_GCM_TAG_LEN);
            offset += AES_GCM_TAG_LEN;
        } else {
            if (offset + encPayloadLen + 2 > packetLen) {
                dropReason = DROP_INVALID_LENGTH;
                return false;
            }
        }

        const uint8_t *pEncPayload = packetIn + offset;

        // --- Step A: Decryption ---
        uint8_t decryptedBuf[160];
        const uint8_t *pPostDec = pEncPayload;
        size_t postDecLen = encPayloadLen;

        if (headerOut.sec_mode == SEC_MODE_AES_GCM) {
            uint8_t aad[16];
            memset(aad, 0, sizeof(aad));
            strncpy((char*)aad, headerOut.source_id, 8);
            memcpy(aad + 8, &headerOut.session_id, 4);
            memcpy(aad + 12, &headerOut.sequence_id, 4);

            bool authOk = MeshCrypto::decryptAES_GCM(
                pEncPayload, encPayloadLen,
                aad, sizeof(aad),
                ivBuf, AES_GCM_IV_LEN,
                tagBuf, AES_GCM_TAG_LEN,
                decryptedBuf
            );
            if (!authOk) {
                dropReason = DROP_AUTH_FAILED;
                return false;
            }
            pPostDec = decryptedBuf;
            postDecLen = encPayloadLen;
        } else if (headerOut.sec_mode == SEC_MODE_XOR_DEMO) {
            MeshCrypto::applyDemoXOR(pEncPayload, encPayloadLen, decryptedBuf);
            pPostDec = decryptedBuf;
            postDecLen = encPayloadLen;
        }

        // --- Step B: Decompression ---
        if (headerOut.compressed == 1) {
            size_t decompLen = 0;
            bool decOk = LosslessCodec::decompress(pPostDec, postDecLen, payloadOut, decompLen, maxPayloadOut);
            if (!decOk) {
                dropReason = DROP_DECOMPRESS_FAILED;
                return false;
            }
            payloadLenOut = decompLen;
        } else {
            if (postDecLen > maxPayloadOut) {
                dropReason = DROP_BUFFER_OVERFLOW;
                return false;
            }
            memcpy(payloadOut, pPostDec, postDecLen);
            payloadLenOut = postDecLen;
        }

        if (metrics) {
            metrics->duration_us = micros() - t0;
            metrics->total_packet_bytes = packetLen;
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // 5. Duplicate Detection Cache Helpers
    // -------------------------------------------------------------------------
    static bool isDuplicatePacket(
        const DuplicateCacheEntry *cache, size_t cacheSize,
        const char *sourceId, uint32_t sessionId, uint32_t sequenceId,
        unsigned long nowMs, unsigned long expiryMs)
    {
        for (size_t i = 0; i < cacheSize; i++) {
            if (cache[i].timestamp_ms == 0) continue;
            // Check expiry
            if (nowMs - cache[i].timestamp_ms > expiryMs) continue;

            if (cache[i].session_id == sessionId &&
                cache[i].sequence_id == sequenceId &&
                strncmp(cache[i].source_id, sourceId, MESH_MAX_NODE_ID_LEN) == 0)
            {
                return true; // Match found: Duplicate!
            }
        }
        return false;
    }

    static void registerPacketInCache(
        DuplicateCacheEntry *cache, size_t cacheSize, size_t &cacheHead,
        const char *sourceId, uint32_t sessionId, uint32_t sequenceId, uint8_t msgType,
        unsigned long nowMs)
    {
        DuplicateCacheEntry &e = cache[cacheHead];
        strncpy(e.source_id, sourceId, MESH_MAX_NODE_ID_LEN - 1);
        e.source_id[MESH_MAX_NODE_ID_LEN - 1] = '\0';
        e.session_id = sessionId;
        e.sequence_id = sequenceId;
        e.msg_type = msgType;
        e.timestamp_ms = (nowMs == 0) ? 1 : nowMs;

        cacheHead = (cacheHead + 1) % cacheSize;
    }

    // -------------------------------------------------------------------------
    // 6. Loop Detection Helper
    // Checks if a given node ID is already recorded in the route path
    // -------------------------------------------------------------------------
    static bool isNodeInPath(const MeshHeader &header, const char *nodeId) {
        for (uint8_t i = 0; i < header.path_count && i < MESH_MAX_PATH_HOPS; i++) {
            if (strncmp(header.path_nodes[i], nodeId, MESH_MAX_NODE_ID_LEN) == 0) {
                return true; // Node already in path -> Routing loop!
            }
        }
        return false;
    }

    // Format full route path as string: "[BOAT_001 -> REP_01 -> GATEWAY]"
    static String formatRoutePath(const MeshHeader &header, const char *finalReceiverId) {
        String path = "[" + String(header.source_id);
        for (uint8_t i = 0; i < header.path_count && i < MESH_MAX_PATH_HOPS; i++) {
            path += " -> " + String(header.path_nodes[i]);
        }
        if (finalReceiverId && strlen(finalReceiverId) > 0) {
            path += " -> " + String(finalReceiverId);
        }
        path += "]";
        return path;
    }
};

#endif // PACKET_CODEC_H

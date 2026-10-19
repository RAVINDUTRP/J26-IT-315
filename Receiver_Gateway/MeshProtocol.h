#ifndef MESH_PROTOCOL_H
#define MESH_PROTOCOL_H

#include <Arduino.h>
#include "MeshConfig.h"

// =============================================================================
// MESH PROTOCOL CONSTANTS & MESSAGE DEFINITIONS
// =============================================================================

#define MESH_MAGIC_BYTE         0x54    // 'T'
#define MESH_PROTOCOL_VERSION   0x01    // Schema & Framing version 1

// Message Types
#define MSG_TYPE_TELEMETRY      0x01
#define MSG_TYPE_HEARTBEAT      0x02
#define MSG_TYPE_ROUTE_BEACON   0x03

// Field Validity Bitmap Flags (BinaryTelemetry)
#define MESH_VALID_DHT_TEMP     (1 << 0)
#define MESH_VALID_DHT_HUM      (1 << 1)
#define MESH_VALID_DS18B20      (1 << 2)
#define MESH_VALID_TURBIDITY    (1 << 3)
#define MESH_VALID_TDS          (1 << 4)
#define MESH_VALID_PH           (1 << 5)
#define MESH_VALID_GPS_FIX      (1 << 6)
#define MESH_VALID_GPS_EXTRA    (1 << 7)
#define MESH_VALID_MPU_ATT      (1 << 8) // Roll & Pitch
#define MESH_VALID_MPU_ACCEL    (1 << 9)
#define MESH_VALID_MPU_GYRO     (1 << 10)

// Sentinel Values for Null/Invalid Readings
#define MESH_NULL_INT16         (-32768)
#define MESH_NULL_UINT16        (0xFFFF)
#define MESH_NULL_INT32         (0x7FFFFFFF)

// Security Layout Constants
#define AES_GCM_IV_LEN          12      // 96-bit standard Nonce/IV
#define AES_GCM_TAG_LEN         16      // 128-bit Authentication Tag

// =============================================================================
// 1. COMPACT BINARY TELEMETRY PAYLOAD (39 Bytes fixed)
// Endianness: Little-Endian standard across ESP32.
// Field validity indicated by validity_bitmap.
// =============================================================================
#pragma pack(push, 1)
struct BinaryTelemetry {
    uint8_t  schema_version;    // 0x01
    uint16_t validity_bitmap;   // Bitfield indicating which sensors produced valid data

    // Atmospheric & Water Quality
    int16_t  air_temp_c10;      // 0.1 °C (e.g. 285 = 28.5 °C)
    uint16_t air_hum_pct10;     // 0.1 % (e.g. 750 = 75.0 %)
    int16_t  water_temp_c100;   // 0.01 °C (e.g. 2640 = 26.40 °C)
    uint16_t turbidity_pct10;   // 0.1 % (e.g. 125 = 12.5 %)
    uint16_t tds_ppm10;         // 0.1 ppm (e.g. 1400 = 140.0 ppm)
    uint16_t ph_x100;           // 0.01 pH (e.g. 720 = 7.20)

    // GPS Navigation
    int32_t  latitude_e6;       // 1e-6 degrees (e.g. 6927079 = 6.927079°)
    int32_t  longitude_e6;      // 1e-6 degrees (e.g. 79861244 = 79.861244°)
    int16_t  altitude_dm;       // 0.1 m (decimeters)
    uint16_t speed_kmh10;       // 0.1 km/h
    uint8_t  satellites;        // Satellites count (0-255)

    // MPU6050 Motion & Attitude
    int16_t  roll_deg10;        // 0.1 degrees
    int16_t  pitch_deg10;       // 0.1 degrees
    int16_t  accel_x_mg;        // milli-g (0.001 g)
    int16_t  accel_y_mg;        // milli-g
    int16_t  accel_z_mg;        // milli-g
    int16_t  gyro_x_dps10;      // 0.1 deg/s
    int16_t  gyro_y_dps10;      // 0.1 deg/s
    int16_t  gyro_z_dps10;      // 0.1 deg/s
};
#pragma pack(pop)

// =============================================================================
// 2. HEARTBEAT PAYLOAD (12 Bytes)
// =============================================================================
#pragma pack(push, 1)
struct BinaryHeartbeat {
    uint8_t  node_type;         // 1=Boat, 2=Repeater, 3=Gateway
    uint32_t uptime_sec;        // Device uptime in seconds
    uint16_t battery_mv;        // Power/VCC in mV
    uint16_t packets_forwarded; // Counter for repeater diagnostics
    uint16_t packets_dropped;   // Drops / duplicates count
    int8_t   last_rssi;         // RSSI of last heard node
};
#pragma pack(pop)

// =============================================================================
// 3. MESH PACKET HEADER & ROUTING METADATA
// =============================================================================
#pragma pack(push, 1)
struct MeshHeader {
    uint8_t  magic;             // MESH_MAGIC_BYTE (0x54)
    uint8_t  version;           // Protocol version
    uint8_t  msg_type;          // MSG_TYPE_TELEMETRY, MSG_TYPE_HEARTBEAT
    uint8_t  sec_mode;          // SEC_MODE_NONE, SEC_MODE_XOR_DEMO, SEC_MODE_AES_GCM
    uint8_t  compressed;        // 0 = Raw, 1 = Compressed
    char     source_id[MESH_MAX_NODE_ID_LEN]; // Originator Node ID (null-terminated)
    uint32_t session_id;        // Random boot/session ID
    uint32_t sequence_id;       // Monotonic sequence number
    uint32_t created_at_ms;     // Originator timestamp (ms or epoch)
    uint8_t  hop_count;         // Current hop count (0 at source)
    uint8_t  max_hops;          // TTL / Max allowed hops
    uint8_t  path_count;        // Number of nodes in route path
    char     path_nodes[MESH_MAX_PATH_HOPS][MESH_MAX_NODE_ID_LEN]; // Appended at each hop
    uint8_t  payload_len;       // Length of the (possibly compressed/encrypted) payload
};
#pragma pack(pop)

// =============================================================================
// 4. DUPLICATE REJECTION CACHE ENTRY
// =============================================================================
struct DuplicateCacheEntry {
    char     source_id[MESH_MAX_NODE_ID_LEN];
    uint32_t session_id;
    uint32_t sequence_id;
    uint8_t  msg_type;
    unsigned long timestamp_ms;
};

// =============================================================================
// 5. NODE LIVENESS / STATUS TRACKER
// =============================================================================
enum NodeStatus {
    NODE_ONLINE,
    NODE_STALE,
    NODE_OFFLINE
};

struct NodeTrackInfo {
    char     node_id[MESH_MAX_NODE_ID_LEN];
    uint8_t  node_type;
    unsigned long last_seen_ms;
    int      last_rssi;
    float    last_snr;
    uint8_t  last_hops;
    char     last_forwarder[MESH_MAX_NODE_ID_LEN];
    char     last_route[64];
    uint32_t packet_count;
    bool     active;
};

// =============================================================================
// 6. CCITT CRC-16 INTEGRITY CALCULATION
// Polynomial 0x1021, Initial value 0xFFFF
// =============================================================================
inline uint16_t meshCalculateCRC16(const uint8_t *data, size_t length) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < length; i++) {
        crc ^= ((uint16_t)data[i] << 8);
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return crc;
}

#endif // MESH_PROTOCOL_H

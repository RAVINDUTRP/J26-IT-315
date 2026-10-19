#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// Provide the token generation process info and RTDB helper
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <time.h>

#include "MeshConfig.h"
#include "MeshProtocol.h"
#include "LosslessCompression.h"
#include "MeshCrypto.h"
#include "PacketCodec.h"

// =============================================================================
// LORA BOAT RECEIVER / GATEWAY FIRMWARE WITH FIREBASE CLOUD TELEMETRY
// ESP32 + SX1278 RA-02 LoRa + 0.96" SSD1306 I2C OLED Display + Wi-Fi + Firebase
//
// Features:
// 1. Dual-Core Asynchronous Architecture (Core 1: LoRa Radio, Core 0: Firebase/WiFi)
// 2. Hardware-Accelerated AES-128-GCM Decryption & GMAC Integrity Verification
// 3. Lossless LZSS/Heatshrink Decompression
// 4. Bounded Ring-Buffer De-duplication Cache (32 entries, 90s window)
// 5. Automatic Wi-Fi Auto-Reconnection & Offline Resiliency
// 6. Sri Lankan Standard Time (SLST / UTC+5:30) via Network Time Protocol (NTP)
// 7. Firebase Authentication (device@gmail.com) via Firebase_ESP_Client library
// 8. Firebase Realtime Database Synchronization:
//    - /live_data      : Live sensor metrics sent every 20 seconds
//    - /history/<time> : Full snapshot archived every 1 minute
//    - /device_status  : Node liveness (online/stale/offline) sent every 20 seconds
// 9. Multi-Page SSD1306 OLED Display (Water Quality, GPS, Motion, Mesh Link & Cloud)
// =============================================================================

// -----------------------------------------------------------------------------
// WI-FI & FIREBASE REALTIME DATABASE CONFIGURATION
// -----------------------------------------------------------------------------
#define WIFI_SSID             "Chamith rulz"      // Replace with your 2.4 GHz Wi-Fi SSID
#define WIFI_PASSWORD         "Chamith17321@"     // Replace with your Wi-Fi password

#define FIREBASE_API_KEY      "AIzaSyAMT0YfXt5xWmLmys_YUSPutt5DABQCKgU"
#define FIREBASE_DATABASE_URL "https://boat-research-e08fb-default-rtdb.firebaseio.com"
#define FIREBASE_PROJECT_ID   "boat-research-e08fb"
#define FIREBASE_AUTH_EMAIL   "device@gmail.com"
#define FIREBASE_AUTH_PASS    "Device@123"

// Sri Lanka Standard Time (SLST): UTC + 5:30 -> 19800 seconds offset, 0 daylight saving
#define NTP_TIMEZONE_OFFSET_SEC 19800
#define NTP_DAYLIGHT_OFFSET_SEC 0
#define NTP_SERVER_1            "pool.ntp.org"
#define NTP_SERVER_2            "time.google.com"
#define NTP_SERVER_3            "time.nist.gov"

// Timing Intervals (Milliseconds)
const unsigned long FIREBASE_LIVE_INTERVAL_MS    = 20000UL; // Live data every 20 seconds
const unsigned long FIREBASE_HISTORY_INTERVAL_MS = 60000UL; // Historical snapshot every 1 minute
const unsigned long FIREBASE_STATUS_INTERVAL_MS  = 20000UL; // Device status every 20 seconds
const unsigned long WIFI_RECONNECT_CHECK_MS      = 10000UL; // Check Wi-Fi state every 10 seconds

// -----------------------------------------------------------------------------
// FIREBASE DATA & CONFIGURATION OBJECTS (Firebase_ESP_Client)
// -----------------------------------------------------------------------------
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// -----------------------------------------------------------------------------
// OLED DISPLAY HARDWARE CONFIGURATION
// -----------------------------------------------------------------------------
#define OLED_SDA_PIN    21
#define OLED_SCL_PIN    22
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT    64
#define OLED_RESET       -1
#define OLED_I2C_ADDR  0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool oledReady = false;

// -----------------------------------------------------------------------------
// RECEIVER STATE & MESH STATISTICS
// -----------------------------------------------------------------------------
struct GatewayStats {
    uint32_t total_received      = 0;
    uint32_t telemetry_packets   = 0;
    uint32_t heartbeat_packets   = 0;
    uint32_t duplicates_rejected = 0;
    uint32_t crc_errors          = 0;
    uint32_t auth_failures       = 0;
    uint32_t decompress_errors   = 0;
    uint32_t hop_limit_drops     = 0;
    uint32_t invalid_frames      = 0;
};
GatewayStats gwStats;

// Duplicate Detection Cache
DuplicateCacheEntry dupCache[MESH_DUP_CACHE_SIZE];
size_t dupCacheHead = 0;

// Node Liveness Tracker: [0]=Boat, [1]=REP_01, [2]=REP_02
NodeTrackInfo trackedNodes[4];

// Latest Decoded Boat Telemetry (Protected by Mutex for thread-safe cross-core access)
portMUX_TYPE telemetryMux = portMUX_INITIALIZER_UNLOCKED;
BinaryTelemetry latestBoatData;
bool hasBoatTelemetry = false;
uint32_t lastBoatSeq = 0;
uint32_t lastBoatSession = 0;
unsigned long lastBoatRxTime = 0;
int lastRxRssi = 0;
float lastRxSnr = 0.0f;
uint8_t lastRxHops = 0;
char lastForwarderId[MESH_MAX_NODE_ID_LEN] = "Direct";
char lastFullRoute[64] = "[BOAT_001 -> GATEWAY]";
String lastReconstructedJson = "";

// Cloud & Connectivity Status Variables
bool wifiConnected = false;
bool firebaseAuthenticated = false;
unsigned long lastFirebaseLiveSync = 0;
unsigned long lastFirebaseHistorySync = 0;
unsigned long lastFirebaseStatusSync = 0;
unsigned long lastWiFiReconnectAttempt = 0;

// OLED Screen Cycling
int currentDisplayPage = 0;
unsigned long lastPageSwitch = 0;
const unsigned long PAGE_SWITCH_INTERVAL_MS = 3500;

bool loraReady = false;

// =============================================================================
// TIME HELPERS (SRI LANKA STANDARD TIME UTC+5:30)
// =============================================================================
String getSriLankaTimeString() {
    time_t now;
    time(&now);
    if (now < 100000) {
        return "NTP_SYNCING";
    }
    struct tm timeinfo;
    if (!localtime_r(&now, &timeinfo)) {
        return "TIME_PARSE_ERR";
    }
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return String(buf);
}

String getSriLankaHistoryKey() {
    time_t now;
    time(&now);
    if (now < 100000) {
        return "log_" + String(millis());
    }
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d_%H-%M-%S", &timeinfo);
    return String(buf);
}

time_t getSriLankaEpoch() {
    time_t now;
    time(&now);
    return now;
}

// =============================================================================
// NODE TRACKING HELPERS
// =============================================================================
void updateNodeLiveness(const char *nodeId, uint8_t nodeType, int rssi, float snr, uint8_t hops, const char *forwarder, const char *route) {
    unsigned long now = millis();
    int slot = -1;

    for (int i = 0; i < 4; i++) {
        if (trackedNodes[i].active && strncmp(trackedNodes[i].node_id, nodeId, MESH_MAX_NODE_ID_LEN) == 0) {
            slot = i;
            break;
        }
    }
    if (slot == -1) {
        for (int i = 0; i < 4; i++) {
            if (!trackedNodes[i].active) {
                slot = i;
                strncpy(trackedNodes[i].node_id, nodeId, MESH_MAX_NODE_ID_LEN - 1);
                trackedNodes[i].node_id[MESH_MAX_NODE_ID_LEN - 1] = '\0';
                trackedNodes[i].node_type = nodeType;
                trackedNodes[i].active = true;
                break;
            }
        }
    }
    if (slot != -1) {
        trackedNodes[slot].last_seen_ms = now;
        trackedNodes[slot].last_rssi = rssi;
        trackedNodes[slot].last_snr = snr;
        trackedNodes[slot].last_hops = hops;
        trackedNodes[slot].packet_count++;
        if (forwarder) {
            strncpy(trackedNodes[slot].last_forwarder, forwarder, MESH_MAX_NODE_ID_LEN - 1);
            trackedNodes[slot].last_forwarder[MESH_MAX_NODE_ID_LEN - 1] = '\0';
        }
        if (route) {
            strncpy(trackedNodes[slot].last_route, route, sizeof(trackedNodes[slot].last_route) - 1);
            trackedNodes[slot].last_route[sizeof(trackedNodes[slot].last_route) - 1] = '\0';
        }
    }
}

NodeStatus getNodeStatus(unsigned long lastSeenMs) {
    if (lastSeenMs == 0) return NODE_OFFLINE;
    unsigned long age = millis() - lastSeenMs;
    if (age <= NODE_STALE_TIMEOUT_MS) return NODE_ONLINE;
    if (age <= NODE_OFFLINE_TIMEOUT_MS) return NODE_STALE;
    return NODE_OFFLINE;
}

const char* statusToString(NodeStatus s) {
    switch (s) {
        case NODE_ONLINE:  return "online";
        case NODE_STALE:   return "stale";
        case NODE_OFFLINE: return "offline";
        default:           return "unknown";
    }
}

// =============================================================================
// FIREBASE REALTIME DATABASE CLIENT & SYNCHRONIZATION ENGINE (Firebase_ESP_Client)
// =============================================================================

// Low-level helper to write JSON to Firebase Realtime Database using Firebase_ESP_Client
bool firebaseWrite(String path, const String& jsonPayload) {
    if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) return false;

    // Strip trailing .json if present for compatibility
    if (path.endsWith(".json")) {
        path = path.substring(0, path.length() - 5);
    }

    FirebaseJson json;
    json.setJsonData(jsonPayload);

    if (Firebase.RTDB.setJSON(&fbdo, path.c_str(), &json)) {
        Serial.printf("[Firebase RTDB] PUT %s -> OK\n", path.c_str());
        return true;
    } else {
        Serial.printf("[Firebase RTDB ERROR] %s -> %s (HTTP %d)\n",
                      path.c_str(), fbdo.errorReason().c_str(), fbdo.httpCode());
        return false;
    }
}

// 1. Send Live Telemetry to /live_data (Every 20 seconds)
void sendFirebaseLiveData() {
    portENTER_CRITICAL(&telemetryMux);
    BinaryTelemetry snap = latestBoatData;
    bool hasData = hasBoatTelemetry;
    uint32_t seq = lastBoatSeq;
    uint32_t session = lastBoatSession;
    int rssi = lastRxRssi;
    float snr = lastRxSnr;
    uint8_t hops = lastRxHops;
    String route = String(lastFullRoute);
    String forwarder = String(lastForwarderId);
    unsigned long ageSec = (millis() - lastBoatRxTime) / 1000;
    portEXIT_CRITICAL(&telemetryMux);

    String slTime = getSriLankaTimeString();
    time_t epoch = getSriLankaEpoch();

    String json = "{";
    json += "\"timestamp\":\"" + slTime + "\",";
    json += "\"epoch\":" + String(epoch) + ",";
    json += "\"telemetry_available\":" + String(hasData ? "true" : "false") + ",";

    if (hasData) {
        // Water quality
        json += "\"water\":{";
        json += "\"temperature_c\":" + ((snap.validity_bitmap & MESH_VALID_DS18B20) ? String(snap.water_temp_c100 / 100.0f, 2) : "null") + ",";
        json += "\"ph\":" + ((snap.validity_bitmap & MESH_VALID_PH) ? String(snap.ph_x100 / 100.0f, 2) : "null") + ",";
        json += "\"tds_ppm\":" + ((snap.validity_bitmap & MESH_VALID_TDS) ? String(snap.tds_ppm10 / 10.0f, 1) : "null") + ",";
        json += "\"turbidity_pct\":" + ((snap.validity_bitmap & MESH_VALID_TURBIDITY) ? String(snap.turbidity_pct10 / 10.0f, 1) : "null");
        json += "},";

        // Environment
        json += "\"environment\":{";
        json += "\"temperature_c\":" + ((snap.validity_bitmap & MESH_VALID_DHT_TEMP) ? String(snap.air_temp_c10 / 10.0f, 1) : "null") + ",";
        json += "\"humidity_pct\":" + ((snap.validity_bitmap & MESH_VALID_DHT_HUM) ? String(snap.air_hum_pct10 / 10.0f, 0) : "null");
        json += "},";

        // Navigation & GPS
        json += "\"navigation\":{";
        bool gpsOk = (snap.validity_bitmap & MESH_VALID_GPS_FIX);
        json += "\"gps_valid\":" + String(gpsOk ? "true" : "false") + ",";
        json += "\"latitude\":" + (gpsOk ? String(snap.latitude_e6 / 1e6, 6) : "null") + ",";
        json += "\"longitude\":" + (gpsOk ? String(snap.longitude_e6 / 1e6, 6) : "null") + ",";
        json += "\"speed_kmh\":" + (gpsOk ? String(snap.speed_kmh10 / 10.0f, 1) : "null") + ",";
        json += "\"satellites\":" + String(snap.satellites) + ",";
        json += "\"altitude_m\":" + ((snap.validity_bitmap & MESH_VALID_GPS_EXTRA) ? String(snap.altitude_dm / 10.0f, 1) : "null");
        json += "},";

        // IMU Motion & Attitude
        json += "\"attitude\":{";
        json += "\"roll_deg\":" + ((snap.validity_bitmap & MESH_VALID_MPU_ATT) ? String(snap.roll_deg10 / 10.0f, 1) : "null") + ",";
        json += "\"pitch_deg\":" + ((snap.validity_bitmap & MESH_VALID_MPU_ATT) ? String(snap.pitch_deg10 / 10.0f, 1) : "null") + ",";
        json += "\"accel_z_g\":" + String(snap.accel_z_mg / 1000.0f, 2);
        json += "},";

        // Mesh Radio Link
        json += "\"mesh_link\":{";
        json += "\"source_id\":\"" + String(BOAT_NODE_ID) + "\",";
        json += "\"sequence_id\":" + String(seq) + ",";
        json += "\"session_id\":\"0x" + String(session, HEX) + "\",";
        json += "\"rssi\":" + String(rssi) + ",";
        json += "\"snr\":" + String(snr, 1) + ",";
        json += "\"hops\":" + String(hops) + ",";
        json += "\"last_forwarder\":\"" + forwarder + "\",";
        json += "\"full_route\":\"" + route + "\",";
        json += "\"data_age_sec\":" + String(ageSec);
        json += "}";
    } else {
        json += "\"status\":\"WAITING_FOR_TELEMETRY\"";
    }

    json += "}";
    firebaseWrite("/live_data", json);
}

// 2. Send Historical Record to /history/<timestamp> (Every 1 minute)
void sendFirebaseHistoryData() {
    portENTER_CRITICAL(&telemetryMux);
    BinaryTelemetry snap = latestBoatData;
    bool hasData = hasBoatTelemetry;
    uint32_t seq = lastBoatSeq;
    int rssi = lastRxRssi;
    float snr = lastRxSnr;
    uint8_t hops = lastRxHops;
    String route = String(lastFullRoute);
    portEXIT_CRITICAL(&telemetryMux);

    if (!hasData) return; // Don't log history if no telemetry yet

    String slTime = getSriLankaTimeString();
    time_t epoch = getSriLankaEpoch();
    String historyKey = getSriLankaHistoryKey();

    String json = "{";
    json += "\"timestamp\":\"" + slTime + "\",";
    json += "\"epoch\":" + String(epoch) + ",";
    json += "\"sequence_id\":" + String(seq) + ",";
    json += "\"water_temp_c\":" + ((snap.validity_bitmap & MESH_VALID_DS18B20) ? String(snap.water_temp_c100 / 100.0f, 2) : "null") + ",";
    json += "\"ph\":" + ((snap.validity_bitmap & MESH_VALID_PH) ? String(snap.ph_x100 / 100.0f, 2) : "null") + ",";
    json += "\"tds_ppm\":" + ((snap.validity_bitmap & MESH_VALID_TDS) ? String(snap.tds_ppm10 / 10.0f, 1) : "null") + ",";
    json += "\"turbidity_pct\":" + ((snap.validity_bitmap & MESH_VALID_TURBIDITY) ? String(snap.turbidity_pct10 / 10.0f, 1) : "null") + ",";
    json += "\"air_temp_c\":" + ((snap.validity_bitmap & MESH_VALID_DHT_TEMP) ? String(snap.air_temp_c10 / 10.0f, 1) : "null") + ",";
    json += "\"humidity_pct\":" + ((snap.validity_bitmap & MESH_VALID_DHT_HUM) ? String(snap.air_hum_pct10 / 10.0f, 0) : "null") + ",";

    bool gpsOk = (snap.validity_bitmap & MESH_VALID_GPS_FIX);
    json += "\"latitude\":" + (gpsOk ? String(snap.latitude_e6 / 1e6, 6) : "null") + ",";
    json += "\"longitude\":" + (gpsOk ? String(snap.longitude_e6 / 1e6, 6) : "null") + ",";
    json += "\"speed_kmh\":" + (gpsOk ? String(snap.speed_kmh10 / 10.0f, 1) : "null") + ",";
    json += "\"satellites\":" + String(snap.satellites) + ",";
    json += "\"roll_deg\":" + ((snap.validity_bitmap & MESH_VALID_MPU_ATT) ? String(snap.roll_deg10 / 10.0f, 1) : "null") + ",";
    json += "\"pitch_deg\":" + ((snap.validity_bitmap & MESH_VALID_MPU_ATT) ? String(snap.pitch_deg10 / 10.0f, 1) : "null") + ",";
    json += "\"rssi\":" + String(rssi) + ",";
    json += "\"snr\":" + String(snr, 1) + ",";
    json += "\"hops\":" + String(hops) + ",";
    json += "\"route\":\"" + route + "\"";
    json += "}";

    firebaseWrite("/history/" + historyKey, json);
}

// 3. Send Device Status to /device_status (Every 20 seconds)
void sendFirebaseDeviceStatus() {
    String slTime = getSriLankaTimeString();

    NodeStatus boatSt = getNodeStatus(trackedNodes[0].last_seen_ms);
    NodeStatus rep1St = getNodeStatus(trackedNodes[1].last_seen_ms);
    NodeStatus rep2St = getNodeStatus(trackedNodes[2].last_seen_ms);

    String json = "{";
    json += "\"last_updated\":\"" + slTime + "\",";

    // Boat Status
    json += "\"boat_001\":{";
    json += "\"status\":\"" + String(statusToString(boatSt)) + "\",";
    json += "\"last_seen_sec\":" + String(trackedNodes[0].last_seen_ms ? (millis() - trackedNodes[0].last_seen_ms) / 1000 : -1) + ",";
    json += "\"rssi\":" + String(trackedNodes[0].last_rssi) + ",";
    json += "\"snr\":" + String(trackedNodes[0].last_snr, 1) + ",";
    json += "\"packet_count\":" + String(trackedNodes[0].packet_count) + ",";
    json += "\"last_route\":\"" + String(trackedNodes[0].last_route) + "\"";
    json += "},";

    // Repeater 01 Status
    json += "\"repeater_01\":{";
    json += "\"status\":\"" + String(statusToString(rep1St)) + "\",";
    json += "\"last_seen_sec\":" + String(trackedNodes[1].last_seen_ms ? (millis() - trackedNodes[1].last_seen_ms) / 1000 : -1) + ",";
    json += "\"rssi\":" + String(trackedNodes[1].last_rssi) + ",";
    json += "\"snr\":" + String(trackedNodes[1].last_snr, 1) + ",";
    json += "\"packet_count\":" + String(trackedNodes[1].packet_count);
    json += "},";

    // Repeater 02 Status
    json += "\"repeater_02\":{";
    json += "\"status\":\"" + String(statusToString(rep2St)) + "\",";
    json += "\"last_seen_sec\":" + String(trackedNodes[2].last_seen_ms ? (millis() - trackedNodes[2].last_seen_ms) / 1000 : -1) + ",";
    json += "\"rssi\":" + String(trackedNodes[2].last_rssi) + ",";
    json += "\"snr\":" + String(trackedNodes[2].last_snr, 1) + ",";
    json += "\"packet_count\":" + String(trackedNodes[2].packet_count);
    json += "},";

    // Gateway Self Status
    json += "\"gateway\":{";
    json += "\"status\":\"online\",";
    json += "\"wifi_connected\":" + String((WiFi.status() == WL_CONNECTED) ? "true" : "false") + ",";
    json += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"wifi_ip\":\"" + WiFi.localIP().toString() + "\",";
    json += "\"firebase_connected\":" + String(firebaseAuthenticated ? "true" : "false") + ",";
    json += "\"total_lora_packets\":" + String(gwStats.total_received) + ",";
    json += "\"duplicates_rejected\":" + String(gwStats.duplicates_rejected) + ",";
    json += "\"free_heap_kb\":" + String(ESP.getFreeHeap() / 1024) + ",";
    json += "\"uptime_sec\":" + String(millis() / 1000);
    json += "}";

    json += "}";
    firebaseWrite("/device_status", json);
}

// -----------------------------------------------------------------------------
// WI-FI CONNECTION & AUTO-RECONNECTION SUPERVISOR
// -----------------------------------------------------------------------------
bool wifiWasConnected = false;

void handleWiFiMaintenance() {
    if (WiFi.status() == WL_CONNECTED) {
        if (!wifiWasConnected) {
            wifiWasConnected = true;
            wifiConnected = true;
            Serial.printf("[WiFi] Connected! IP: %s | RSSI: %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());

            // Initialize NTP Internet Time
            configTime(NTP_TIMEZONE_OFFSET_SEC, NTP_DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2, NTP_SERVER_3);
            Serial.println("[NTP] Initialized SNTP synchronization for Sri Lanka Standard Time (UTC+5:30).");
        }
        return;
    }

    wifiConnected = false;
    wifiWasConnected = false;
    unsigned long now = millis();
    if (now - lastWiFiReconnectAttempt >= WIFI_RECONNECT_CHECK_MS) {
        lastWiFiReconnectAttempt = now;
        Serial.printf("[WiFi] Reconnecting to '%s'...\n", WIFI_SSID);
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
}

// -----------------------------------------------------------------------------
// FREERTOS CLOUD WORKER TASK (PINNED TO CORE 0)
// Leaves Core 1 100% dedicated to high-speed LoRa SPI radio processing
// -----------------------------------------------------------------------------
void firebaseWorkerTask(void *pvParameters) {
    Serial.printf("[Cloud Task] Started background network worker on Core %d\n", xPortGetCoreID());

    // Initial Wi-Fi connection
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    // Initialize NTP Internet Time
    configTime(NTP_TIMEZONE_OFFSET_SEC, NTP_DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2, NTP_SERVER_3);
    Serial.println("[NTP] Initialized SNTP synchronization for Sri Lanka Standard Time (UTC+5:30).");

    // Assign Firebase Configuration & User Auth Credentials
    config.api_key = FIREBASE_API_KEY;
    config.database_url = FIREBASE_DATABASE_URL;
    auth.user.email = FIREBASE_AUTH_EMAIL;
    auth.user.password = FIREBASE_AUTH_PASS;
    config.token_status_callback = tokenStatusCallback; // Provided by addons/TokenHelper.h

    // Recommended Network Timeouts
    config.timeout.wifiReconnect = 10 * 1000;
    config.timeout.socketConnection = 10 * 1000;
    config.timeout.serverResponse = 10 * 1000;

    // Initialize Firebase client
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    fbdo.setResponseSize(2048);

    for (;;) {
        handleWiFiMaintenance();

        // Firebase.ready() handles token acquisition, refresh, and RTDB readiness
        if (Firebase.ready()) {
            firebaseAuthenticated = true;
            unsigned long now = millis();

            // 1. Live Data Sync every 20s
            if (now - lastFirebaseLiveSync >= FIREBASE_LIVE_INTERVAL_MS) {
                lastFirebaseLiveSync = now;
                sendFirebaseLiveData();
            }

            // 2. Device Status Sync every 20s
            if (now - lastFirebaseStatusSync >= FIREBASE_STATUS_INTERVAL_MS) {
                lastFirebaseStatusSync = now;
                sendFirebaseDeviceStatus();
            }

            // 3. History Snapshot Sync every 1 min
            if (now - lastFirebaseHistorySync >= FIREBASE_HISTORY_INTERVAL_MS) {
                lastFirebaseHistorySync = now;
                sendFirebaseHistoryData();
            }
        } else {
            firebaseAuthenticated = false;
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

// =============================================================================
// OLED DISPLAY RENDERING (MULTI-PAGE DASHBOARD)
// =============================================================================
void renderOLED() {
    if (!oledReady) return;

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    // Initial waiting screen if no packet received yet
    if (!hasBoatTelemetry) {
        display.setTextSize(1);
        display.setCursor(6, 2);
        display.print("LORA BOAT GATEWAY");
        display.drawFastHLine(0, 12, SCREEN_WIDTH, SSD1306_WHITE);

        display.setCursor(4, 16);
        display.print("Mesh: Listening...");
        display.setCursor(4, 28);
        display.printf("Freq: %.1f MHz", LORA_FREQUENCY / 1E6);
        display.setCursor(4, 40);
        display.printf("Wi-Fi: %s", (WiFi.status() == WL_CONNECTED) ? "ONLINE" : "SEARCHING");
        display.setCursor(4, 52);
        display.printf("Cloud: %s", firebaseAuthenticated ? "CONNECTED" : "AUTH_WAIT");
        display.display();
        return;
    }

    portENTER_CRITICAL(&telemetryMux);
    BinaryTelemetry snap = latestBoatData;
    uint32_t seq = lastBoatSeq;
    int rssi = lastRxRssi;
    float snr = lastRxSnr;
    uint8_t hops = lastRxHops;
    unsigned long ageSec = (millis() - lastBoatRxTime) / 1000;
    portEXIT_CRITICAL(&telemetryMux);

    // Top Header: Boat ID + RSSI + Cloud Badge
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.printf("%s %ddB", BOAT_NODE_ID, rssi);
    display.setCursor(90, 0);
    display.print(firebaseAuthenticated ? "[FB:OK]" : "[FB:--]");
    display.drawFastHLine(0, 9, SCREEN_WIDTH, SSD1306_WHITE);

    switch (currentDisplayPage) {
        case 0: // Page 0: Water Quality
            display.setCursor(0, 13);
            display.printf("Water: %.2f C", (snap.validity_bitmap & MESH_VALID_DS18B20) ? (snap.water_temp_c100 / 100.0f) : 0.0f);

            display.setCursor(0, 23);
            display.printf("pH   : %.2f", (snap.validity_bitmap & MESH_VALID_PH) ? (snap.ph_x100 / 100.0f) : 0.0f);

            display.setCursor(0, 33);
            display.printf("TDS  : %.1f ppm", (snap.validity_bitmap & MESH_VALID_TDS) ? (snap.tds_ppm10 / 10.0f) : 0.0f);

            display.setCursor(0, 43);
            display.printf("Turb : %.1f %%", (snap.validity_bitmap & MESH_VALID_TURBIDITY) ? (snap.turbidity_pct10 / 10.0f) : 0.0f);

            display.setCursor(0, 55);
            display.printf("#%u %lus [1/4 Water]", seq, ageSec);
            break;

        case 1: // Page 1: GPS & Environment
            display.setCursor(0, 13);
            if (snap.validity_bitmap & MESH_VALID_GPS_FIX) {
                display.printf("Lat: %.6f", snap.latitude_e6 / 1e6);
                display.setCursor(0, 23);
                display.printf("Lon: %.6f", snap.longitude_e6 / 1e6);
                display.setCursor(0, 33);
                display.printf("Spd:%.1fkm/h Sat:%d", snap.speed_kmh10 / 10.0f, snap.satellites);
            } else {
                display.print("GPS: Waiting for Fix");
                display.setCursor(0, 23);
                display.print("Lat: --  Lon: --");
                display.setCursor(0, 33);
                display.print("Spd: --  Sat: 0");
            }
            display.setCursor(0, 43);
            display.printf("Air:%.1fC Hum:%.0f%%",
                (snap.validity_bitmap & MESH_VALID_DHT_TEMP) ? (snap.air_temp_c10 / 10.0f) : 0.0f,
                (snap.validity_bitmap & MESH_VALID_DHT_HUM) ? (snap.air_hum_pct10 / 10.0f) : 0.0f);

            display.setCursor(0, 55);
            display.printf("Alt:%.1fm [2/4 GPS]", (snap.validity_bitmap & MESH_VALID_GPS_EXTRA) ? (snap.altitude_dm / 10.0f) : 0.0f);
            break;

        case 2: // Page 2: Motion & Tilt
            display.setCursor(0, 13);
            display.printf("Roll : %.1f deg", (snap.validity_bitmap & MESH_VALID_MPU_ATT) ? (snap.roll_deg10 / 10.0f) : 0.0f);

            display.setCursor(0, 23);
            display.printf("Pitch: %.1f deg", (snap.validity_bitmap & MESH_VALID_MPU_ATT) ? (snap.pitch_deg10 / 10.0f) : 0.0f);

            display.setCursor(0, 33);
            display.printf("Acc: %.2f,%.2f", snap.accel_x_mg / 1000.0f, snap.accel_y_mg / 1000.0f);

            display.setCursor(0, 43);
            display.printf("Az : %.2fg", snap.accel_z_mg / 1000.0f);

            display.setCursor(0, 55);
            display.printf("Seq: #%u [3/4 Motion]", seq);
            break;

        case 3: // Page 3: Mesh & Cloud Status
            display.setCursor(0, 13);
            display.printf("WiFi : %s (%ddBm)", (WiFi.status() == WL_CONNECTED) ? "ONLINE" : "DISC", WiFi.RSSI());

            display.setCursor(0, 23);
            display.printf("RTDB : %s", firebaseAuthenticated ? "AUTHENTICATED" : "OFFLINE");

            display.setCursor(0, 33);
            display.printf("Boat : %s", statusToString(getNodeStatus(trackedNodes[0].last_seen_ms)));
            display.setCursor(68, 33);
            display.printf("R1:%s", statusToString(getNodeStatus(trackedNodes[1].last_seen_ms)));

            display.setCursor(0, 43);
            display.printf("R2   : %s", statusToString(getNodeStatus(trackedNodes[2].last_seen_ms)));
            display.setCursor(68, 43);
            display.printf("Dup:%u", gwStats.duplicates_rejected);

            display.setCursor(0, 55);
            display.printf("Pkts:%u [4/4 Cloud]", gwStats.total_received);
            break;
    }

    display.display();
}

// =============================================================================
// RECEIVER DECODE & PACKET PROCESSING ENGINE (CORE 1)
// =============================================================================
void processIncomingMeshPacket() {
    int packetSize = LoRa.parsePacket();
    if (!packetSize) return;

    gwStats.total_received++;
    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();

    // Check packet size bounds
    if (packetSize < (int)(sizeof(MeshHeader) + 2) || packetSize > LORA_HW_MAX_PAYLOAD) {
        gwStats.invalid_frames++;
        Serial.printf("[GW RX] DROPPED: Invalid frame length (%d bytes)\n", packetSize);
        return;
    }

    uint8_t rxBuffer[LORA_HW_MAX_PAYLOAD];
    int bytesRead = 0;
    while (LoRa.available() && bytesRead < packetSize) {
        rxBuffer[bytesRead++] = (uint8_t)LoRa.read();
    }

    unsigned long now = millis();

    // 1. Decode Pipeline (CRC verification -> Decryption -> Decompression -> Deserialization)
    MeshHeader header;
    uint8_t decodedPayload[128];
    size_t decodedLen = 0;
    PacketDropReason dropReason = DROP_NONE;
    CodecMetrics metrics;

    bool decodeSuccess = PacketCodec::decodeMeshPacket(
        rxBuffer, packetSize,
        header,
        decodedPayload, decodedLen, sizeof(decodedPayload),
        dropReason,
        &metrics
    );

    // 2. Handle Errors & Rejections
    if (!decodeSuccess) {
        switch (dropReason) {
            case DROP_CRC_FAILED:
                gwStats.crc_errors++;
                Serial.printf("[GW RX] DROPPED: CRC16 integrity verification failed!\n");
                break;
            case DROP_AUTH_FAILED:
                gwStats.auth_failures++;
                Serial.printf("[GW RX] DROPPED: AES-GCM Authentication Tag mismatch! (Tampered or bad key)\n");
                break;
            case DROP_DECOMPRESS_FAILED:
                gwStats.decompress_errors++;
                Serial.printf("[GW RX] DROPPED: Lossless decompression error!\n");
                break;
            default:
                gwStats.invalid_frames++;
                Serial.printf("[GW RX] DROPPED: Decode error (Code %d)\n", dropReason);
                break;
        }
        return;
    }

    // 3. Duplicate Suppression Check (Keyed by Source ID + Session ID + Sequence ID)
    if (PacketCodec::isDuplicatePacket(dupCache, MESH_DUP_CACHE_SIZE, header.source_id, header.session_id, header.sequence_id, now, MESH_DUP_EXPIRY_MS)) {
        gwStats.duplicates_rejected++;
        Serial.printf("[GW RX] REJECTED DUPLICATE: Packet #%u from %s already processed.\n", header.sequence_id, header.source_id);
        return;
    }

    // Register in duplicate suppression cache
    PacketCodec::registerPacketInCache(dupCache, MESH_DUP_CACHE_SIZE, dupCacheHead, header.source_id, header.session_id, header.sequence_id, header.msg_type, now);

    // 4. Determine Immediate Forwarder & Full Route Path
    char immediateForwarder[MESH_MAX_NODE_ID_LEN];
    if (header.path_count == 0) {
        strncpy(immediateForwarder, "Direct", sizeof(immediateForwarder));
    } else {
        strncpy(immediateForwarder, header.path_nodes[header.path_count - 1], MESH_MAX_NODE_ID_LEN - 1);
        immediateForwarder[MESH_MAX_NODE_ID_LEN - 1] = '\0';
    }
    String fullObservedRoute = PacketCodec::formatRoutePath(header, GATEWAY_NODE_ID);

    // 5. Update Node Liveness Trackers
    uint8_t srcType = (strcmp(header.source_id, BOAT_NODE_ID) == 0) ? 1 : 2;
    updateNodeLiveness(header.source_id, srcType, rssi, snr, header.hop_count, immediateForwarder, fullObservedRoute.c_str());

    // Also update immediate forwarder node if different from source
    if (header.path_count > 0) {
        updateNodeLiveness(immediateForwarder, 2, rssi, snr, header.hop_count, immediateForwarder, fullObservedRoute.c_str());
    }

    // 6. Handle Payload based on Message Type
    if (header.msg_type == MSG_TYPE_TELEMETRY && decodedLen == sizeof(BinaryTelemetry)) {
        gwStats.telemetry_packets++;

        portENTER_CRITICAL(&telemetryMux);
        memcpy(&latestBoatData, decodedPayload, sizeof(BinaryTelemetry));
        hasBoatTelemetry = true;
        lastBoatSeq = header.sequence_id;
        lastBoatSession = header.session_id;
        lastBoatRxTime = now;
        lastRxRssi = rssi;
        lastRxSnr = snr;
        lastRxHops = header.hop_count;
        strncpy(lastForwarderId, immediateForwarder, sizeof(lastForwarderId) - 1);
        lastForwarderId[sizeof(lastForwarderId) - 1] = '\0';
        strncpy(lastFullRoute, fullObservedRoute.c_str(), sizeof(lastFullRoute) - 1);
        lastFullRoute[sizeof(lastFullRoute) - 1] = '\0';
        portEXIT_CRITICAL(&telemetryMux);

        // Reconstruct Standard JSON Telemetry for Serial Host
        lastReconstructedJson = PacketCodec::serializeTelemetryToJson(
            latestBoatData, header.source_id, header.sequence_id, header.session_id, header.created_at_ms
        );

        // Print Comprehensive Diagnostics to Serial Monitor
        Serial.println();
        Serial.println("================================================================================");
        Serial.printf(">>> [GATEWAY RX] Telemetry Packet #%u Successfully Decoded <<<\n", header.sequence_id);
        Serial.println("================================================================================");
        Serial.printf("Originating Node  : %s (Session: 0x%08X)\n", header.source_id, header.session_id);
        Serial.printf("Last Forwarder    : %s\n", immediateForwarder);
        Serial.printf("Full Route Path   : %s\n", fullObservedRoute.c_str());
        Serial.printf("Hop Count / Max   : %d / %d hops\n", header.hop_count, header.max_hops);
        Serial.printf("Link Quality      : RSSI = %d dBm | SNR = %+.1f dB\n", rssi, snr);
        Serial.printf("Sri Lanka Time    : %s\n", getSriLankaTimeString().c_str());
        Serial.println("--------------------------------------------------------------------------------");
        Serial.printf("Water Temperature : %.2f C\n", (latestBoatData.validity_bitmap & MESH_VALID_DS18B20) ? (latestBoatData.water_temp_c100 / 100.0f) : 0.0f);
        Serial.printf("pH Level          : %.2f\n", (latestBoatData.validity_bitmap & MESH_VALID_PH) ? (latestBoatData.ph_x100 / 100.0f) : 0.0f);
        Serial.printf("TDS PPM           : %.1f ppm\n", (latestBoatData.validity_bitmap & MESH_VALID_TDS) ? (latestBoatData.tds_ppm10 / 10.0f) : 0.0f);
        Serial.printf("Turbidity Percent : %.1f %%\n", (latestBoatData.validity_bitmap & MESH_VALID_TURBIDITY) ? (latestBoatData.turbidity_pct10 / 10.0f) : 0.0f);
        Serial.printf("Air Temp / Hum    : %.1f C / %.1f %%\n",
            (latestBoatData.validity_bitmap & MESH_VALID_DHT_TEMP) ? (latestBoatData.air_temp_c10 / 10.0f) : 0.0f,
            (latestBoatData.validity_bitmap & MESH_VALID_DHT_HUM) ? (latestBoatData.air_hum_pct10 / 10.0f) : 0.0f);
        if (latestBoatData.validity_bitmap & MESH_VALID_GPS_FIX) {
            Serial.printf("GPS Location      : Lat = %.6f, Lon = %.6f | Spd = %.1f km/h | Sats = %d\n",
                latestBoatData.latitude_e6 / 1e6, latestBoatData.longitude_e6 / 1e6,
                latestBoatData.speed_kmh10 / 10.0f, latestBoatData.satellites);
        } else {
            Serial.println("GPS Location      : Waiting for fix");
        }
        Serial.printf("MPU6050 Motion    : Roll = %.1f deg, Pitch = %.1f deg | Accel Z = %.2f g\n",
            latestBoatData.roll_deg10 / 10.0f, latestBoatData.pitch_deg10 / 10.0f, latestBoatData.accel_z_mg / 1000.0f);
        Serial.println("--------------------------------------------------------------------------------");
        Serial.printf("Decode Duration   : %lu microseconds\n", metrics.duration_us);
        Serial.println("Reconstructed Standard JSON (Serial Stream):");
        Serial.println(lastReconstructedJson);
        Serial.println("================================================================================");

    } else if (header.msg_type == MSG_TYPE_HEARTBEAT && decodedLen == sizeof(BinaryHeartbeat)) {
        gwStats.heartbeat_packets++;
        BinaryHeartbeat hb;
        memcpy(&hb, decodedPayload, sizeof(BinaryHeartbeat));
        Serial.printf("[GW RX HEARTBEAT] Node: %s | Uptime: %lu s | Battery: %u mV | Fwd: %u | Drops: %u | Path: %s\n",
                      header.source_id, hb.uptime_sec, hb.battery_mv, hb.packets_forwarded, hb.packets_dropped, fullObservedRoute.c_str());
    }

    // Refresh OLED with latest data
    renderOLED();
}

// =============================================================================
// SETUP
// =============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("=================================================================");
    Serial.println("      ESP32 LORA BOAT MESH RECEIVER / GATEWAY (BASE STATION)     ");
    Serial.println("=================================================================");
    Serial.printf("Gateway Node ID : %s\n", GATEWAY_NODE_ID);
    Serial.printf("LoRa Frequency  : %.1f MHz (Sync: 0x%02X, SF%d, BW %.0f kHz)\n",
                  LORA_FREQUENCY / 1E6, LORA_SYNC_WORD, LORA_SPREAD_FACTOR, LORA_BANDWIDTH / 1E3);
    Serial.println("-----------------------------------------------------------------");

    // Initialize I2C and SSD1306 OLED Display
    Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
    if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
        oledReady = true;
        Serial.println("[OLED] Display initialized at 0x3C.");
    } else if (display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
        oledReady = true;
        Serial.println("[OLED] Display initialized at alternate address 0x3D.");
    } else {
        Serial.println("[OLED] WARNING: SSD1306 OLED display not detected!");
    }

    if (oledReady) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(12, 14);
        display.print("LORA BOAT MESH");
        display.setCursor(20, 28);
        display.print("BASE GATEWAY");
        display.setCursor(10, 44);
        display.print("Connecting Wi-Fi...");
        display.display();
    }

    // Initialize LoRa Radio
    SPI.begin(LORA_SCK_PIN, LORA_MISO_PIN, LORA_MOSI_PIN, LORA_SS_PIN);
    LoRa.setPins(LORA_SS_PIN, LORA_RST_PIN, LORA_DIO0_PIN);

    if (!LoRa.begin(LORA_FREQUENCY)) {
        Serial.println("[LoRa] ERROR: Gateway radio initialization failed!");
        loraReady = false;
    } else {
        LoRa.setSyncWord(LORA_SYNC_WORD);
        LoRa.setSpreadingFactor(LORA_SPREAD_FACTOR);
        LoRa.setSignalBandwidth(LORA_BANDWIDTH);
        LoRa.setCodingRate4(LORA_CODING_RATE);
        LoRa.setPreambleLength(LORA_PREAMBLE_LEN);
        if (LORA_ENABLE_CRC) LoRa.enableCrc();
        LoRa.setTxPower(LORA_TX_POWER);
        loraReady = true;
        Serial.println("[LoRa] Gateway radio ready and listening.");
    }

    // Initialize Tracked Nodes list
    strncpy(trackedNodes[0].node_id, BOAT_NODE_ID, MESH_MAX_NODE_ID_LEN);
    trackedNodes[0].node_type = 1;
    trackedNodes[0].active = true;

    strncpy(trackedNodes[1].node_id, REPEATER_01_NODE_ID, MESH_MAX_NODE_ID_LEN);
    trackedNodes[1].node_type = 2;
    trackedNodes[1].active = true;

    strncpy(trackedNodes[2].node_id, REPEATER_02_NODE_ID, MESH_MAX_NODE_ID_LEN);
    trackedNodes[2].node_type = 2;
    trackedNodes[2].active = true;

    // Start Firebase Cloud Synchronization Worker on Core 0
    xTaskCreatePinnedToCore(
        firebaseWorkerTask,
        "FirebaseWorker",
        16384,            // Stack size in bytes (16 KB for SSL & JSON)
        NULL,
        1,                // Low-to-medium priority
        NULL,
        0                 // Pin strictly to Core 0 (leaving Core 1 for LoRa)
    );
    Serial.println("[FreeRTOS] Spawned FirebaseWorker task pinned to Core 0.");

    renderOLED();
    Serial.println("\nGateway operational. Ready to receive mesh telemetry and stream to Firebase...\n");
}

// =============================================================================
// MAIN LOOP (CORE 1)
// Dedicated to continuous LoRa packet reception and local UI rendering
// =============================================================================
void loop() {
    // 1. Process Incoming LoRa Packets (Immediate interrupt / polling check)
    processIncomingMeshPacket();

    // 2. Periodic OLED Display Page Rotation
    unsigned long now = millis();
    if (now - lastPageSwitch >= PAGE_SWITCH_INTERVAL_MS) {
        lastPageSwitch = now;
        currentDisplayPage = (currentDisplayPage + 1) % 4; // 4 Pages (Water, GPS, Motion, Cloud/Mesh)
        renderOLED();
    }
}

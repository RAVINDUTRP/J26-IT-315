#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <math.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#include "MeshConfig.h"
#include "MeshProtocol.h"
#include "LosslessCompression.h"
#include "MeshCrypto.h"
#include "PacketCodec.h"

// =============================================================================
// LORA BOAT TRANSMITTER FIRMWARE
// ESP32 + DHT11 + TURBIDITY + pH + TDS + DS18B20 + NEO-6M GPS + MPU6050
// Features: Compact Binary Serialization, Heatshrink/LZSS Lossless Compression,
// Authenticated AES-GCM Encryption, Dynamic Profiling & LoRa Mesh Framing
// =============================================================================

// ----------------- DS18B20 WATER TEMPERATURE -----------------
#define DS18B20_PIN 27
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
float waterTemperature = 0.0f;
bool ds18b20Valid = false;

// ----------------- DHT11 AIR SENSOR --------------------------
#define DHT_PIN 13
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);
float temperature = 0.0f;
float humidity = 0.0f;
bool dhtValid = false;

// ----------------- TURBIDITY SENSOR --------------------------
#define TURBIDITY_PIN 36
int turbidityRaw = 0;
float turbidityVoltage = 0.0f;
float turbidityPercent = 0.0f;
bool turbidityValid = false;

// ----------------- pH SENSOR ---------------------------------
#define PH_PIN 34
int phRaw = 0;
float phVoltage = 0.0f;
float phValue = 0.0f;
bool phValid = false;
// Preserved calibration values
float phNeutralVoltage = 2.50f;
float phVoltagePerPH   = 0.18f;

// ----------------- TDS SENSOR --------------------------------
#define TDS_PIN 39
int tdsRaw = 0;
float tdsVoltage = 0.0f;
float tdsPPM = 0.0f;
bool tdsValid = false;

// ----------------- NEO-6M GPS --------------------------------
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define GPS_BAUD 9600
TinyGPSPlus gps;
HardwareSerial GPSSerial(2);
bool gpsFixValid = false;

// ----------------- MPU6050 MOTION SENSOR ---------------------
#define MPU_SDA_PIN 21
#define MPU_SCL_PIN 22
#define MPU_ADDR 0x68
const float FILTER_ALPHA = 0.98f;
const float RAD_TO_DEG_F = 57.2957795f;

float accelX = 0.0f, accelY = 0.0f, accelZ = 0.0f;
float gyroX = 0.0f, gyroY = 0.0f, gyroZ = 0.0f;
float rollAngle = 0.0f, pitchAngle = 0.0f;
float gyroBiasX = 0.0f, gyroBiasY = 0.0f, gyroBiasZ = 0.0f;
bool mpuValid = false;
bool mpuCalibrated = false;
unsigned long lastMPUUpdate = 0;

// ----------------- ADC CONSTANTS -----------------------------
#define ADC_MAX_VALUE 4095.0f
#define ADC_REFERENCE 3.3f

// ----------------- TIMING CONSTANTS --------------------------
const unsigned long SENSOR_INTERVAL = 2000;
const unsigned long DEBUG_INTERVAL  = 3000;

unsigned long lastSensorRead    = 0;
unsigned long lastDebugPrint    = 0;
unsigned long lastLoRaTransmit  = 0;
unsigned long lastHeartbeatTx   = 0;

// ----------------- PROTOCOL & SESSION STATE ------------------
uint32_t bootSessionId = 0;
uint32_t packetSequence = 0;
bool loraReady = false;

// Buffer for transmitting over LoRa
uint8_t txPacketBuffer[LORA_HW_MAX_PAYLOAD];

// =============================================================================
// MPU6050 LOW-LEVEL I2C FUNCTIONS
// =============================================================================
void mpuWriteRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    Wire.write(value);
    Wire.endTransmission();
}

bool mpuReadRegisters(uint8_t reg, uint8_t count, uint8_t *buffer) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return false;

    uint8_t received = Wire.requestFrom((uint8_t)MPU_ADDR, count, (uint8_t)true);
    if (received != count) return false;

    for (uint8_t i = 0; i < count; i++) {
        buffer[i] = Wire.read();
    }
    return true;
}

int16_t readInt16(uint8_t highByte, uint8_t lowByte) {
    return (int16_t)((highByte << 8) | lowByte);
}

bool initializeMPU6050() {
    Wire.beginTransmission(MPU_ADDR);
    if (Wire.endTransmission() != 0) {
        Serial.println("[MPU6050] Sensor not detected on I2C address 0x68!");
        return false;
    }
    mpuWriteRegister(0x6B, 0x00); // Wake up
    delay(100);
    mpuWriteRegister(0x1C, 0x00); // Accel range: +/- 2g
    mpuWriteRegister(0x1B, 0x00); // Gyro range: +/- 250 dps
    mpuWriteRegister(0x1A, 0x03); // DLPF configuration
    Serial.println("[MPU6050] Initialized successfully.");
    return true;
}

bool readMPURaw(int16_t &ax, int16_t &ay, int16_t &az, int16_t &gx, int16_t &gy, int16_t &gz) {
    uint8_t data[14];
    if (!mpuReadRegisters(0x3B, 14, data)) return false;

    ax = readInt16(data[0], data[1]);
    ay = readInt16(data[2], data[3]);
    az = readInt16(data[4], data[5]);
    gx = readInt16(data[8], data[9]);
    gy = readInt16(data[10], data[11]);
    gz = readInt16(data[12], data[13]);
    return true;
}

void calibrateMPU6050() {
    Serial.println("[MPU6050] Calibrating gyroscope... Keep boat stationary!");
    const int samples = 400;
    long sumGX = 0, sumGY = 0, sumGZ = 0;
    int successCount = 0;

    for (int i = 0; i < samples; i++) {
        int16_t ax, ay, az, gx, gy, gz;
        if (readMPURaw(ax, ay, az, gx, gy, gz)) {
            sumGX += gx;
            sumGY += gy;
            sumGZ += gz;
            successCount++;
        }
        delay(3);
    }

    if (successCount < 100) {
        Serial.println("[MPU6050] Calibration failed: insufficient samples!");
        mpuCalibrated = false;
        return;
    }

    gyroBiasX = (float)sumGX / successCount / 131.0f;
    gyroBiasY = (float)sumGY / successCount / 131.0f;
    gyroBiasZ = (float)sumGZ / successCount / 131.0f;
    mpuCalibrated = true;
    Serial.printf("[MPU6050] Gyro Biases: X=%.2f, Y=%.2f, Z=%.2f deg/s\n", gyroBiasX, gyroBiasY, gyroBiasZ);
}

void readMPU6050() {
    int16_t rawAX, rawAY, rawAZ, rawGX, rawGY, rawGZ;
    if (!readMPURaw(rawAX, rawAY, rawAZ, rawGX, rawGY, rawGZ)) {
        mpuValid = false;
        return;
    }

    accelX = rawAX / 16384.0f;
    accelY = rawAY / 16384.0f;
    accelZ = rawAZ / 16384.0f;

    gyroX = rawGX / 131.0f - gyroBiasX;
    gyroY = rawGY / 131.0f - gyroBiasY;
    gyroZ = rawGZ / 131.0f - gyroBiasZ;

    float accelRoll  = atan2f(accelY, accelZ) * RAD_TO_DEG_F;
    float accelPitch = atan2f(-accelX, sqrtf(accelY * accelY + accelZ * accelZ)) * RAD_TO_DEG_F;

    unsigned long now = micros();
    if (lastMPUUpdate == 0) {
        rollAngle = accelRoll;
        pitchAngle = accelPitch;
        lastMPUUpdate = now;
    } else {
        float dt = (now - lastMPUUpdate) / 1000000.0f;
        lastMPUUpdate = now;
        if (dt > 0.0f && dt < 0.5f) {
            rollAngle  = FILTER_ALPHA * (rollAngle + gyroX * dt) + (1.0f - FILTER_ALPHA) * accelRoll;
            pitchAngle = FILTER_ALPHA * (pitchAngle + gyroY * dt) + (1.0f - FILTER_ALPHA) * accelPitch;
        } else {
            rollAngle = accelRoll;
            pitchAngle = accelPitch;
        }
    }
    mpuValid = true;
}

// =============================================================================
// SENSOR ACQUISITION ROUTINES
// =============================================================================
void readDS18B20() {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);
    if (t == DEVICE_DISCONNECTED_C || isnan(t) || t < -55.0f || t > 125.0f) {
        ds18b20Valid = false;
        return;
    }
    waterTemperature = t;
    ds18b20Valid = true;
}

void readDHT11() {
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (isnan(h) || isnan(t)) {
        dhtValid = false;
        return;
    }
    humidity = h;
    temperature = t;
    dhtValid = true;
}

void readTurbiditySensor() {
    const int samples = 10;
    long total = 0;
    for (int i = 0; i < samples; i++) {
        total += analogRead(TURBIDITY_PIN);
        delay(4);
    }
    turbidityRaw = total / samples;
    turbidityVoltage = (turbidityRaw / ADC_MAX_VALUE) * ADC_REFERENCE;
    turbidityPercent = (turbidityRaw / ADC_MAX_VALUE) * 100.0f;
    turbidityPercent = constrain(turbidityPercent, 0.0f, 100.0f);
    turbidityValid = true;
}

void readTDSSensor() {
    const int samples = 10;
    long total = 0;
    for (int i = 0; i < samples; i++) {
        total += analogRead(TDS_PIN);
        delay(4);
    }
    tdsRaw = total / samples;
    tdsVoltage = (tdsRaw / ADC_MAX_VALUE) * ADC_REFERENCE;

    float waterTemp = ds18b20Valid ? waterTemperature : (dhtValid ? temperature : 25.0f);
    float compensationCoefficient = 1.0f + 0.02f * (waterTemp - 25.0f);
    float compensationVoltage = tdsVoltage / compensationCoefficient;
    float v = compensationVoltage;

    tdsPPM = (133.42f * v * v * v - 255.86f * v * v + 857.39f * v) * 0.5f;
    if (tdsPPM < 0.0f) tdsPPM = 0.0f;
    tdsValid = true;
}

void readPHSensor() {
    const int samples = 10;
    long total = 0;
    for (int i = 0; i < samples; i++) {
        total += analogRead(PH_PIN);
        delay(4);
    }
    phRaw = total / samples;
    phVoltage = (phRaw / ADC_MAX_VALUE) * ADC_REFERENCE;
    phValue = 7.0f + (phNeutralVoltage - phVoltage) / phVoltagePerPH;
    phValue = constrain(phValue, 0.0f, 14.0f);
    phValid = true;
}

void readGPS() {
    while (GPSSerial.available() > 0) {
        gps.encode(GPSSerial.read());
    }
    gpsFixValid = (gps.location.isValid() && gps.location.age() < 5000);
}

// =============================================================================
// TELEMETRY TRANSMISSION & BENCHMARK PROFILING
// =============================================================================
void transmitTelemetryPacket() {
    if (!loraReady) {
        Serial.println("[LoRa] Skip TX: Radio not initialized!");
        return;
    }

    packetSequence++;
    uint32_t nowMs = millis();

    // 1. Construct Compact Binary Telemetry
    BinaryTelemetry binTelemetry;
    PacketCodec::buildBinaryTelemetry(
        binTelemetry,
        dhtValid, temperature, humidity,
        ds18b20Valid, waterTemperature,
        turbidityValid, turbidityPercent,
        tdsValid, tdsPPM,
        phValid, phValue,
        gpsFixValid,
        gpsFixValid ? gps.location.lat() : 0.0,
        gpsFixValid ? gps.location.lng() : 0.0,
        gpsFixValid && gps.altitude.isValid() ? gps.altitude.meters() : 0.0f,
        gpsFixValid && gps.speed.isValid() ? gps.speed.kmph() : 0.0f,
        gps.satellites.isValid() ? gps.satellites.value() : 0,
        mpuValid, rollAngle, pitchAngle, accelX, accelY, accelZ, gyroX, gyroY, gyroZ
    );

    // 2. Generate Standard JSON (Used for benchmark comparison & debug preview)
    String standardJson = PacketCodec::serializeTelemetryToJson(
        binTelemetry, BOAT_NODE_ID, packetSequence, bootSessionId, nowMs
    );

    CodecMetrics metrics;
    metrics.json_bytes = standardJson.length();

    // 3. Complete Encode Pipeline: Binary -> Compression -> Crypto -> Framing + CRC16
    size_t packetLen = PacketCodec::encodeMeshPacket(
        txPacketBuffer, sizeof(txPacketBuffer),
        MSG_TYPE_TELEMETRY,
        BOAT_NODE_ID, bootSessionId, packetSequence, nowMs,
        MESH_MAX_PATH_HOPS,
        (const uint8_t*)&binTelemetry, sizeof(BinaryTelemetry),
        ACTIVE_SECURITY_MODE,
        &metrics
    );

    if (packetLen == 0) {
        Serial.println("[LoRa TX] ERROR: Packet encoding failed or exceeded length limits!");
        return;
    }

    // 4. Radio Transmission
    LoRa.beginPacket();
    LoRa.write(txPacketBuffer, packetLen);
    int txResult = LoRa.endPacket();

    // 5. Detailed Telemetry Profiling Report
    Serial.println();
    Serial.println("================================================================================");
    Serial.printf(">>> [LORA MESH TX] Telemetry Packet #%u Transmitted (Result=%d) <<<\n", packetSequence, txResult);
    Serial.println("================================================================================");
    Serial.printf("Source Node ID    : %s (Session ID: 0x%08X)\n", BOAT_NODE_ID, bootSessionId);
    Serial.printf("Security Mode     : %s\n",
        (ACTIVE_SECURITY_MODE == SEC_MODE_AES_GCM) ? "AES-128-GCM (Hardware Authenticated Encryption)" :
        (ACTIVE_SECURITY_MODE == SEC_MODE_XOR_DEMO) ? "DEMO XOR MASKING (INSECURE / DEMO ONLY)" : "NONE (Plaintext)");
    Serial.printf("Compression Mode  : %s\n", (ENABLE_LOSSLESS_COMPRESSION ? "LZSS / Heatshrink (Lossless Embedded)" : "Disabled"));
    Serial.println("--------------------------------------------------------------------------------");
    Serial.printf("Original JSON Size: %4u bytes\n", (unsigned int)metrics.json_bytes);
    Serial.printf("Binary Struct Size: %4u bytes (%.1f%% reduction vs JSON)\n",
        (unsigned int)metrics.binary_bytes, (1.0f - (float)metrics.binary_bytes / metrics.json_bytes) * 100.0f);
    Serial.printf("Compressed Size   : %4u bytes (%.1f%% reduction vs binary)\n",
        (unsigned int)metrics.compressed_bytes, (1.0f - (float)metrics.compressed_bytes / metrics.binary_bytes) * 100.0f);
    Serial.printf("Ciphertext Size   : %4u bytes\n", (unsigned int)metrics.encrypted_bytes);
    Serial.printf("Header / Overhead : %4u bytes (Mesh header + routing list + auth tag)\n", (unsigned int)metrics.header_overhead);
    Serial.printf("Final Frame Size  : %4u bytes / %u limit\n", (unsigned int)metrics.total_packet_bytes, MESH_APP_MAX_PACKET);
    Serial.printf("Total Bandwidth   : %.1f%% Saved | Compression Ratio: %.2f:1\n", metrics.savings_percent, metrics.compression_ratio);
    Serial.printf("Encode Time       : %lu microseconds\n", metrics.duration_us);
    Serial.println("--------------------------------------------------------------------------------");

#if MESH_DEBUG_OUTPUT
    Serial.println("[DEBUG PREVIEW] Standard JSON Telemetry:");
    Serial.println(standardJson);
    Serial.print("[DEBUG PREVIEW] Packet Hex (First 32 bytes): ");
    for (size_t i = 0; i < min(packetLen, (size_t)32); i++) {
        Serial.printf("%02X ", txPacketBuffer[i]);
    }
    Serial.println("...");
#endif
    Serial.println("================================================================================");
}

// =============================================================================
// HEARTBEAT BROADCAST
// =============================================================================
void transmitHeartbeatPacket() {
    if (!loraReady) return;

    BinaryHeartbeat hb;
    hb.node_type = 1; // 1 = Boat
    hb.uptime_sec = millis() / 1000;
    hb.battery_mv = 3300; // ESP32 regulated VCC
    hb.packets_forwarded = packetSequence;
    hb.packets_dropped = 0;
    hb.last_rssi = 0;

    size_t packetLen = PacketCodec::encodeMeshPacket(
        txPacketBuffer, sizeof(txPacketBuffer),
        MSG_TYPE_HEARTBEAT,
        BOAT_NODE_ID, bootSessionId, packetSequence, millis(),
        MESH_MAX_PATH_HOPS,
        (const uint8_t*)&hb, sizeof(BinaryHeartbeat),
        ACTIVE_SECURITY_MODE
    );

    if (packetLen > 0) {
        LoRa.beginPacket();
        LoRa.write(txPacketBuffer, packetLen);
        LoRa.endPacket();
        Serial.printf("[HEARTBEAT TX] Boat heartbeat transmitted (Uptime: %lu s, Packet #%u)\n", hb.uptime_sec, packetSequence);
    }
}

// =============================================================================
// HARDWARE INITIALIZATION
// =============================================================================
bool initializeLoRaHardware() {
    SPI.begin(LORA_SCK_PIN, LORA_MISO_PIN, LORA_MOSI_PIN, LORA_SS_PIN);
    LoRa.setPins(LORA_SS_PIN, LORA_RST_PIN, LORA_DIO0_PIN);

    if (!LoRa.begin(LORA_FREQUENCY)) {
        Serial.println("[LoRa] Initializing radio FAILED! Check SPI wiring and power.");
        return false;
    }

    LoRa.setSyncWord(LORA_SYNC_WORD);
    LoRa.setSpreadingFactor(LORA_SPREAD_FACTOR);
    LoRa.setSignalBandwidth(LORA_BANDWIDTH);
    LoRa.setCodingRate4(LORA_CODING_RATE);
    LoRa.setPreambleLength(LORA_PREAMBLE_LEN);
    if (LORA_ENABLE_CRC) LoRa.enableCrc();
    LoRa.setTxPower(LORA_TX_POWER);

    Serial.println("[LoRa] Radio initialized successfully.");
    Serial.printf("[LoRa] Freq: %.1f MHz, SyncWord: 0x%02X, SF%d, BW %.0f kHz, CR 4/%d\n",
                  LORA_FREQUENCY / 1E6, LORA_SYNC_WORD, LORA_SPREAD_FACTOR, LORA_BANDWIDTH / 1E3, LORA_CODING_RATE);
    return true;
}

// =============================================================================
// SETUP
// =============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    // Generate random 32-bit boot/session ID
    bootSessionId = (uint32_t)esp_random();
    if (bootSessionId == 0) bootSessionId = 0xAA551234;

    Serial.println();
    Serial.println("=================================================================");
    Serial.println("        ESP32 LORA BOAT TELEMETRY TRANSMITTER (MESH NODE)        ");
    Serial.println("=================================================================");
    Serial.printf("Device ID       : %s\n", BOAT_NODE_ID);
    Serial.printf("Session ID      : 0x%08X\n", bootSessionId);
    Serial.printf("LoRa Frequency  : %.1f MHz (ISM legal)\n", LORA_FREQUENCY / 1E6);
    Serial.printf("TX Interval     : %lu ms (%lu sec)\n", BOAT_TELEMETRY_INTERVAL_MS, BOAT_TELEMETRY_INTERVAL_MS / 1000);
    Serial.printf("Security Mode   : %s\n",
        (ACTIVE_SECURITY_MODE == SEC_MODE_AES_GCM) ? "AES-128-GCM (Hardware Authenticated)" :
        (ACTIVE_SECURITY_MODE == SEC_MODE_XOR_DEMO) ? "DEMO XOR (Obfuscation Only)" : "None");
    Serial.println("-----------------------------------------------------------------");

    // Configure ADC
    analogReadResolution(12);
    analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);
    analogSetPinAttenuation(TDS_PIN, ADC_11db);
    analogSetPinAttenuation(PH_PIN, ADC_11db);

    // Initialize DHT11
    dht.begin();
    Serial.println("[DHT11] Initialized on GPIO 13");

    // Initialize DS18B20
    ds18b20.begin();
    ds18b20.setResolution(10);
    ds18b20.setWaitForConversion(true);
    Serial.println("[DS18B20] Initialized on GPIO 27");

    // Initialize GPS UART2
    GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    Serial.printf("[NEO-6M GPS] Serial2 initialized on RX=%d, TX=%d @ %d baud\n", GPS_RX_PIN, GPS_TX_PIN, GPS_BAUD);

    // Initialize I2C for MPU6050
    Wire.begin(MPU_SDA_PIN, MPU_SCL_PIN);
    Wire.setClock(400000);
    if (initializeMPU6050()) {
        calibrateMPU6050();
    } else {
        Serial.println("[MPU6050] WARNING: Failed to communicate with MPU6050!");
    }

    // Initialize LoRa RA-02
    loraReady = initializeLoRaHardware();

    Serial.println("\nAll boat subsystems initialized. Entering operational loop...\n");
}

// =============================================================================
// MAIN LOOP
// =============================================================================
void loop() {
    // 1. GPS encoding must run continuously
    readGPS();

    // 2. MPU complementary filter must update frequently
    if (mpuCalibrated) {
        readMPU6050();
    }

    unsigned long now = millis();

    // 3. Periodic Sensor Readings
    if (now - lastSensorRead >= SENSOR_INTERVAL) {
        lastSensorRead = now;
        readDHT11();
        readTurbiditySensor();
        readTDSSensor();
        readPHSensor();
        readDS18B20();
    }

    // 4. Periodic Heartbeat Broadcast
    if (now - lastHeartbeatTx >= BOAT_HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTx = now;
        transmitHeartbeatPacket();
    }

    // 5. Periodic Mesh Telemetry Transmission
    if (now - lastLoRaTransmit >= BOAT_TELEMETRY_INTERVAL_MS) {
        lastLoRaTransmit = now;
        transmitTelemetryPacket();
    }
}

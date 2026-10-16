#include <Arduino.h>
#include <LoRa.h>

// Component 2 ESP32 + Ra-02 hardware prototype.
// Confirm the legal LoRa frequency and actual GPIO wiring before deployment.
#ifndef LORA_FREQUENCY
#define LORA_FREQUENCY 868E6
#endif
#ifndef NODE_ID
#define NODE_ID 1
#endif
#ifndef NODE_ROLE
#define NODE_ROLE "sensor"
#endif

constexpr int LORA_SS = 5;
constexpr int LORA_RST = 14;
constexpr int LORA_DIO0 = 26;
constexpr uint8_t PROTOCOL_VERSION = 1;
constexpr uint8_t MASTER_KEY = 0x5A;

#pragma pack(push, 1)
struct TelemetryPayload {
  uint16_t ph_x100;
  uint16_t turbidity_x10;
  uint16_t tds_ppm;
  int16_t temperature_x10;
  uint8_t battery;
};

struct WirePacket {
  uint8_t magic0;
  uint8_t magic1;
  uint8_t version;
  uint8_t source;
  uint16_t sequence;                 // clear nonce/sequence for key rotation
  TelemetryPayload encryptedPayload; // payload is XOR protected
  uint16_t checksum;
};
#pragma pack(pop)

uint16_t sequenceNo = 0;

void xorRolling(uint8_t* data, size_t length, uint16_t sequence) {
  uint32_t state = (static_cast<uint32_t>(MASTER_KEY) << 24) | sequence;
  for (size_t i = 0; i < length; ++i) {
    state = state * 1664525UL + 1013904223UL;
    data[i] ^= static_cast<uint8_t>((state >> 24) & 0xFF);
  }
}

uint16_t checksum16(const uint8_t* data, size_t length) {
  uint32_t sum = 0xA5A5;
  for (size_t i = 0; i < length; ++i) sum = (sum + data[i] * 257UL) & 0xFFFF;
  return static_cast<uint16_t>(sum);
}

TelemetryPayload makeTelemetry() {
  TelemetryPayload p{};
  p.ph_x100 = 712;          // Replace with Component 1 sensor readings.
  p.turbidity_x10 = 284;
  p.tds_ppm = 132;
  p.temperature_x10 = 284;
  p.battery = 87;
  return p;
}

void sendTelemetry() {
  WirePacket packet{};
  packet.magic0 = 'A';
  packet.magic1 = 'S';
  packet.version = PROTOCOL_VERSION;
  packet.source = NODE_ID;
  packet.sequence = sequenceNo++;
  packet.encryptedPayload = makeTelemetry();

  xorRolling(reinterpret_cast<uint8_t*>(&packet.encryptedPayload),
             sizeof(packet.encryptedPayload), packet.sequence);
  packet.checksum = checksum16(reinterpret_cast<const uint8_t*>(&packet),
                               sizeof(packet) - sizeof(packet.checksum));

  LoRa.beginPacket();
  LoRa.write(reinterpret_cast<uint8_t*>(&packet), sizeof(packet));
  LoRa.endPacket();

  Serial.printf("TX node=%u seq=%u bytes=%u\n",
                packet.source, packet.sequence, static_cast<unsigned>(sizeof(packet)));
}

void receivePacket(int packetSize) {
  if (packetSize != static_cast<int>(sizeof(WirePacket))) {
    while (LoRa.available()) LoRa.read();
    Serial.printf("Ignored packet size=%d\n", packetSize);
    return;
  }

  WirePacket packet{};
  LoRa.readBytes(reinterpret_cast<uint8_t*>(&packet), sizeof(packet));

  const uint16_t expected = checksum16(reinterpret_cast<const uint8_t*>(&packet),
                                        sizeof(packet) - sizeof(packet.checksum));
  if (packet.magic0 != 'A' || packet.magic1 != 'S' ||
      packet.version != PROTOCOL_VERSION || expected != packet.checksum) {
    Serial.println("RX: invalid header/checksum");
    return;
  }

  Serial.printf("RX source=%u seq=%u RSSI=%d SNR=%.1f role=%s\n",
                packet.source, packet.sequence, LoRa.packetRssi(),
                LoRa.packetSnr(), NODE_ROLE);

  if (strcmp(NODE_ROLE, "relay") == 0) {
    // A relay forwards the protected packet without decrypting it.
    LoRa.beginPacket();
    LoRa.write(reinterpret_cast<uint8_t*>(&packet), sizeof(packet));
    LoRa.endPacket();
    Serial.println("RELAY: forwarded protected packet");
    return;
  }

  if (strcmp(NODE_ROLE, "gateway") == 0) {
    xorRolling(reinterpret_cast<uint8_t*>(&packet.encryptedPayload),
               sizeof(packet.encryptedPayload), packet.sequence);

    Serial.printf("GATEWAY: decoded pH=%.2f turbidity=%.1f TDS=%u temp=%.1f battery=%u%%\n",
                  packet.encryptedPayload.ph_x100 / 100.0f,
                  packet.encryptedPayload.turbidity_x10 / 10.0f,
                  packet.encryptedPayload.tds_ppm,
                  packet.encryptedPayload.temperature_x10 / 10.0f,
                  packet.encryptedPayload.battery);
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("ERROR: LoRa initialization failed");
    while (true) delay(1000);
  }

  LoRa.setTxPower(17);
  LoRa.receive();

  Serial.printf("AquaShield C2 node=%u role=%s frequency=%.0f Hz\n",
                NODE_ID, NODE_ROLE, static_cast<double>(LORA_FREQUENCY));
}

void loop() {
  const int packetSize = LoRa.parsePacket();
  if (packetSize) receivePacket(packetSize);

  if (strcmp(NODE_ROLE, "sensor") == 0) {
    static unsigned long lastTx = 0;
    if (millis() - lastTx >= 5000) {
      lastTx = millis();
      sendTelemetry();
      LoRa.receive();
    }
  }
  delay(10);
}

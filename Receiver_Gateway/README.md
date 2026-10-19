# 🖥️ Base Station Central Receiver & Ingestion Gateway
**Firmware Target:** `Receiver_Gateway.ino`  
**Node Identifier:** `GATEWAY`  
**Role:** Central Mesh Data Sink, Cryptographic Verification Engine & Upstream Bridge  
**Hardware Platform:** ESP32-WROOM-32 + Semtech SX1278 Ra-02 LoRa + 0.96" SSD1306 I2C OLED  
**Operating Frequency:** 433.0 MHz ISM Band  
**Upstream Interface:** High-Speed Serial JSON Stream (115200 baud) for PC / Cloud / MQTT / Node-RED  

---

## 📑 Table of Contents
1. [System Architecture & Ingestion Pipeline](#1-system-architecture--ingestion-pipeline)
2. [Hardware Bill of Materials (BOM)](#2-hardware-bill-of-materials-bom)
3. [Circuit Schematic & Pinout Matrix](#3-circuit-schematic--pinout-matrix)
4. [Gateway Cryptographic & Decompression Processing](#4-gateway-cryptographic--decompression-processing)
   - [RF Signal Capture & CRC16 Integrity](#41-rf-signal-capture--crc16-integrity)
   - [Multi-Path De-duplication Engine](#42-multi-path-de-duplication-engine)
   - [Hardware AES-128-GCM Decryption & GMAC Verification](#43-hardware-aes-128-gcm-decryption--gmac-verification)
   - [Lossless LZSS / Heatshrink Decompression](#44-lossless-lzss--heatshrink-decompression)
   - [Physical Telemetry Reconstruction](#45-physical-telemetry-reconstruction)
5. [Upstream JSON Schema Specification](#5-upstream-json-schema-specification)
6. [Multi-Page SSD1306 OLED Display Interface](#6-multi-page-ssd1306-oled-display-interface)
7. [Mesh Node Liveness Tracking State Machine](#7-mesh-node-liveness-tracking-state-machine)
8. [Serial Diagnostics & Output Formats](#8-serial-diagnostics--output-formats)
9. [Integration with PC / Node-RED / Python / Cloud](#9-integration-with-pc--node-red--python--cloud)

---

## 1. System Architecture & Ingestion Pipeline

The **Base Station Receiver / Gateway** is the central sink of the LoRa mesh network. Positioned at the shore control station or research laboratory, it continuously monitors the 433.0 MHz channel, ingesting frames arriving either directly from the boat or relayed via intermediate repeaters.

```
                    ┌── Direct Path (If within range) ──┐
                    │                                   │
[BOAT_001] ─────────┼── Via REP_01 (Slot 1) ────────────┼──▶ [SX1278 LoRa Receiver]
                    │                                   │             │
                    └── Via REP_02 (Slot 2) ────────────┘             ▼
                                                        [1. Hardware CRC16 Check]
                                                                      │
                                                        [2. Multi-Path De-duplication]
                                                                      │
                                                        [3. AES-128-GCM Tag Verify]
                                                                      │
                                                        [4. Lossless Decompress]
                                                                      │
                                                        [5. Reconstruct JSON & Metrics]
                                                                      │
                                           ┌──────────────────────────┴──────────────────────────┐
                                           ▼                                                     ▼
                                 [0.96" SSD1306 OLED]                                  [USB Serial (115200)]
                              Page 0: Water Quality                                  - Node-RED Dashboard
                              Page 1: GPS & Attitude                                 - InfluxDB / Grafana
                              Page 2: Mesh Health & RSSI                             - Python Telemetry Logger
```

---

## 2. Hardware Bill of Materials (BOM)

| Component | Model / Specification | Purpose | Operating Voltage | Interface |
|---|---|---|---|---|
| **Microcontroller** | ESP32 DevKit V1 (Xtensa Dual-Core 32-bit @ 240 MHz, 520 KB SRAM) | Mesh Gateway Sink, AES Engine, JSON Serializer | 3.3V (5V via USB) | SPI, I2C, UART |
| **LoRa Radio** | Semtech SX1278 (Ai-Thinker Ra-02 433 MHz) | High-sensitivity RF receiver (-148 dBm) | 3.3V (Max 3.6V!) | Hardware SPI @ 10 MHz |
| **OLED Display** | 0.96" SSD1306 Monochrome 128x64 OLED Display Module | Real-time standalone graphical readout | 3.3V – 5.0V | I2C (Address: `0x3C`) |
| **RF Antenna** | 433 MHz Omni-Directional High-Gain Fiberglass / Dipole Antenna | Maximum RF reception sensitivity | Passive RF | 50 Ω SMA / IPEX Coaxial |
| **Host PC / Pi** | PC, Laptop, Raspberry Pi, or Cloud Gateway | Telemetry storage, map plotting, remote dashboard | 5V DC | USB Type-A to Micro-USB |

---

## 3. Circuit Schematic & Pinout Matrix

> [!CAUTION]
> The **Semtech SX1278 Ra-02 LoRa module operates strictly at 3.3V**. Connecting the Ra-02 module to 5V will permanently burn the chip!

### Complete ESP32 to SX1278 & SSD1306 OLED Wiring

| ESP32 Pin | Connected Device | Device Pin | Signal Type | Electrical Notes |
|---|---|---|---|---|
| **GPIO 18** | SX1278 LoRa | `SCK` | SPI Clock | Master clock driven by ESP32 |
| **GPIO 19** | SX1278 LoRa | `MISO` | SPI MISO | Master-In data line |
| **GPIO 23** | SX1278 LoRa | `MOSI` | SPI MOSI | Master-Out data line |
| **GPIO 5** | SX1278 LoRa | `NSS / CS` | SPI Chip Select | Active-low chip select |
| **GPIO 14** | SX1278 LoRa | `RST` | Reset | Active-low transceiver reset |
| **GPIO 2** | SX1278 LoRa | `DIO0` | Interrupt / RxDone | High on packet arrival |
| **GPIO 21** | 0.96" SSD1306 OLED | `SDA` | I2C Data | 4.7 kΩ pull-up to 3.3V (onboard module) |
| **GPIO 22** | 0.96" SSD1306 OLED | `SCL` | I2C Clock | 4.7 kΩ pull-up to 3.3V (onboard module) |
| **3.3V** | SX1278 Ra-02 | `VCC` | Power Supply | Pure 3.3V rail from ESP32 |
| **5.0V / VIN** | SSD1306 OLED | `VCC` | Power Supply | 5V or 3.3V rail |
| **GND** | SX1278 & OLED | `GND` | Ground Reference | Common System Ground |

---

## 4. Gateway Cryptographic & Decompression Processing

### 4.1. RF Signal Capture & CRC16 Integrity
Upon receiving an RF symbol sequence, the SX1278 hardware verifies the physical layer CRC. If valid, the gateway reads the packet into memory, capturing physical link metrics:
- **Received Signal Strength Indicator (RSSI):** Typically $-65\text{ dBm}$ (close range) to $-120\text{ dBm}$ (extreme range).
- **Signal-to-Noise Ratio (SNR):** Ranging from $+10\text{ dB}$ (clean channel) down to $-12.5\text{ dB}$ (sub-noise floor reception via LoRa chirp spread spectrum).

### 4.2. Multi-Path De-duplication Engine
Because `BOAT_001` broadcasts its telemetry to all listening nodes, the Gateway often receives the identical packet multiple times:
1. Direct transmission from boat at $t = 0\text{ ms}$.
2. Forwarded copy from `REP_01` at $t \approx 160\text{ ms}$.
3. Forwarded copy from `REP_02` at $t \approx 310\text{ ms}$.

The gateway maintains a **Bounded Cyclic Cache (`dupCache[32]`)**. The first arriving copy (which possesses the lowest latency) is immediately processed. Subsequent copies matching the same `(source_id, session_id, sequence_id)` within the 90-second window are silently rejected (`gwStats.duplicates_rejected++`), preventing duplicate database insertions while logging path diversity metrics.

### 4.3. Hardware AES-128-GCM Decryption & GMAC Verification
The gateway executes hardware-accelerated AES-GCM verification via ESP32's `mbedtls` cryptographic core:
1. Reconstructs the 12-byte Nonce deterministically:
   $$\text{Nonce} = [\text{SourceID}] \parallel [\text{SessionID}] \parallel [\text{SequenceID}]$$
2. Feeds the 16-byte `MeshHeader` as **Additional Authenticated Data (AAD)** into the GMAC engine.
3. Decrypts the ciphertext payload using pre-shared key `MESH_AES_KEY`.
4. Evaluates the 16-byte GHASH tag:
   - If tag matches: Authenticity and integrity confirmed.
   - If tag fails: Drops packet with warning:
     `[GW RX] DROPPED: AES-GCM Authentication Tag mismatch! (Tampered or bad key)`

### 4.4. Lossless LZSS / Heatshrink Decompression
The authenticated ciphertext represents an LZSS-compressed stream. The gateway passes this stream to the `HeatshrinkDecoder` ring buffer, reconstructing the raw 44-byte `BinaryTelemetry` packed struct.

### 4.5. Physical Telemetry Reconstruction
The gateway unpacks the fixed-point integers into engineering floating-point units:
$$\text{Water Temperature } (^\circ\text{C}) = \frac{T_{\text{water, raw}}}{100.0}$$
$$\text{pH Value} = \frac{\text{pH}_{\text{raw}}}{100.0}$$
$$\text{Turbidity } (\%) = \frac{\text{Turb}_{\text{raw}}}{100.0}$$
$$\text{GPS Latitude } (^\circ) = \frac{\text{Lat}_{\text{raw}}}{1000000.0}$$
$$\text{GPS Longitude } (^\circ) = \frac{\text{Lon}_{\text{raw}}}{1000000.0}$$

---

## 5. Upstream JSON Schema Specification

Whenever a valid telemetry frame is decoded, the gateway formats and streams a standard JSON payload over USB Serial (**115200 baud**):

```json
{
  "node": "BOAT_001",
  "seq": 42,
  "hops": 1,
  "timestamp": 128450,
  "rx_rssi": -84,
  "rx_snr": 7.2,
  "rx_route": "[BOAT_001 -> REP_01 -> GATEWAY]",
  "age_sec": 0,
  "water": {
    "temp_c": 26.40,
    "ph": 7.35,
    "tds_ppm": 245.0,
    "turbidity_pct": 92.50
  },
  "env": {
    "temp_c": 29.1,
    "humidity_pct": 68
  },
  "gps": {
    "ok": true,
    "lat": 6.927079,
    "lon": 79.861244,
    "speed_kmh": 3.2,
    "satellites": 8
  },
  "imu": {
    "ok": true,
    "roll_deg": 1.2,
    "pitch_deg": -0.8
  },
  "diagnostics": {
    "battery_mv": 3300,
    "uptime_sec": 420,
    "sensor_flags": 31
  }
}
```

---

## 6. Multi-Page SSD1306 OLED Display Interface

The gateway cycles its 128x64 OLED display every **3 seconds** across three diagnostic pages:

```
┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
│-- WATER QUALITY [P0] --│  │-- BOAT MOTION & NAV ---│  │-- MESH NETWORK LINK ---│
│Temp : 26.40 C          │  │Lat : 6.927079          │  │Boat: ONLINE (4s ago)   │
│pH   : 7.35             │  │Lon : 79.861244         │  │Route: BOAT->REP1->GW   │
│TDS  : 245 ppm          │  │Spd : 3.2 km/h (8 sats) │  │RSSI : -84dBm SNR: 7.2dB│
│Turb : 92.5 %           │  │Att : R: 1.2 | P: -0.8  │  │Total Pkts: 142 (Dup:28)│
└────────────────────────┘  └────────────────────────┘  └────────────────────────┘
       [Page 0]                    [Page 1]                    [Page 2]
```

---

## 7. Mesh Node Liveness Tracking State Machine

The gateway maintains independent health and liveness tracking for all known mesh participants:
- `trackedNodes[0]`: Boat Transmitter (`BOAT_001`)
- `trackedNodes[1]`: Primary Repeater (`REP_01`)
- `trackedNodes[2]`: Secondary Repeater (`REP_02`)

### Liveness State Transitions
- **`ONLINE`:** Heartbeat or telemetry received within the last **90 seconds**.
- **`STALE`:** No packet received between **90 and 180 seconds** (flags potential obstacle or signal degradation).
- **`OFFLINE`:** No packet received for over **180 seconds** (triggers alert for vessel power loss or out-of-range condition).

---

## 8. Serial Diagnostics & Output Formats

At boot and during runtime, the Gateway prints diagnostic tables to Serial (**115200 baud**):
```
================================================================================
       ESP32 LORA BOAT RECEIVER / GATEWAY BASE STATION FIRMWARE                 
================================================================================
[OLED] SSD1306 128x64 OLED display ready.
[LoRa] Radio ready: 433.0 MHz, Sync 0xF3, SF7, BW 125 kHz
[Gateway] Ingestion Engine Active. Listening for telemetry & heartbeats...

[GW RX] Telemetry Frame Ingested (RSSI: -84 dBm, SNR: 7.2 dB, Hops: 1)
[GW RX] Route Path : [BOAT_001 -> REP_01 -> GATEWAY]
[GW CRYPTO] AES-128-GCM Tag Verified OK (Authentic & Intact).
[GW DECOMP] LZSS Decompression Success (Compressed 26B -> Binary 44B).
>>> [UPSTREAM JSON] Emitted to Serial Host <<<
```

---

---

## 9. Integration with PC / Node-RED / Python / Cloud

### Quick Python Serial Logger Example
Save as `logger.py` to automatically capture and write telemetry to a CSV file or database:
```python
import serial
import json
import time

ser = serial.Serial('COM3', 115200, timeout=1)
print("Listening for Gateway Telemetry...")

with open("lake_telemetry.csv", "a") as f:
    while True:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                data = json.loads(line)
                print(f"[{time.strftime('%X')}] Temp={data['water']['temp_c']}C, pH={data['water']['ph']}, Route={data['rx_route']}")
                f.write(f"{time.time()},{data['water']['temp_c']},{data['water']['ph']},{data['water']['tds_ppm']},{data['gps']['lat']},{data['gps']['lon']}\n")
                f.flush()
            except Exception as e:
                pass
```

---

## 10. Firebase Realtime Database & Cloud Telemetry

The Gateway features an asynchronous, dual-core cloud synchronization worker (`firebaseWorkerTask`) executing on **Core 0**, allowing the **Core 1** LoRa engine to process RF frames without blocking.

### 10.1. Firebase Configuration & Authentication
- **Project ID:** `boat-research-e08fb`
- **Database URL:** `https://boat-research-e08fb-default-rtdb.firebaseio.com`
- **Library:** Mobizt `Firebase_ESP_Client` (`#include <Firebase_ESP_Client.h>`, `#include <addons/TokenHelper.h>`, `#include <addons/RTDBHelper.h>`).
- **Authentication:** Firebase Email/Password Auth (`device@gmail.com` / `Device@123`).
- **Token Management:** Handled natively by `Firebase.ready()` and `addons/TokenHelper.h` with automated background token acquisition and refresh without LoRa packet loss.

### 10.2. Cloud Database Schema & Endpoints

#### 1. Live Sensor Data: `/live_data` (Every 20 Seconds)
```json
{
  "timestamp": "2026-10-18 13:30:45",
  "epoch": 1771234567,
  "telemetry_available": true,
  "water": {
    "temperature_c": 26.40,
    "ph": 7.35,
    "tds_ppm": 245.0,
    "turbidity_pct": 92.5
  },
  "environment": {
    "temperature_c": 29.1,
    "humidity_pct": 68
  },
  "navigation": {
    "gps_valid": true,
    "latitude": 6.927079,
    "longitude": 79.861244,
    "speed_kmh": 3.2,
    "satellites": 8,
    "altitude_m": 12.5
  },
  "attitude": {
    "roll_deg": 1.2,
    "pitch_deg": -0.8,
    "accel_z_g": 1.02
  },
  "mesh_link": {
    "source_id": "BOAT_001",
    "sequence_id": 42,
    "session_id": "0x48FA12B0",
    "rssi": -84,
    "snr": 7.2,
    "hops": 1,
    "last_forwarder": "REP_01",
    "full_route": "[BOAT_001 -> REP_01 -> GATEWAY]",
    "data_age_sec": 4
  }
}
```

#### 2. Historical Snapshots: `/history/<timestamp>` (Every 1 Minute)
Every 60 seconds, a full immutable telemetry record is archived under `/history/<YYYY-MM-DD_HH-MM-SS>.json` for persistent analytical trending and historical charts.

#### 3. Device Status Tracker: `/device_status` (Every 20 Seconds)
Tracks real-time liveness (`online`, `stale`, `offline`), signal quality, and packet counts for all mesh participants:
```json
{
  "last_updated": "2026-10-18 13:30:45",
  "boat_001": {
    "status": "online",
    "last_seen_sec": 4,
    "rssi": -84,
    "snr": 7.2,
    "packet_count": 142,
    "last_route": "[BOAT_001 -> REP_01 -> GATEWAY]"
  },
  "repeater_01": {
    "status": "online",
    "last_seen_sec": 12,
    "rssi": -76,
    "snr": 8.5,
    "packet_count": 89
  },
  "repeater_02": {
    "status": "online",
    "last_seen_sec": 25,
    "rssi": -89,
    "snr": 5.1,
    "packet_count": 54
  },
  "gateway": {
    "status": "online",
    "wifi_connected": true,
    "wifi_rssi": -58,
    "wifi_ip": "192.168.1.105",
    "firebase_connected": true,
    "total_lora_packets": 142,
    "duplicates_rejected": 28,
    "free_heap_kb": 278,
    "uptime_sec": 1240
  }
}
```

### 10.3. Sri Lanka Standard Time (SLST / UTC+5:30) via SNTP
The gateway synchronizes time on Wi-Fi connection using POSIX SNTP with servers `pool.ntp.org`, `time.google.com`, and `time.nist.gov`. Time offset is configured to `+19800` seconds with zero daylight saving.

### 10.4. Automatic Wi-Fi Auto-Reconnection
The gateway checks connection state every 10 seconds. If an AP drops, it issues non-blocking reconnect requests while the LoRa SPI interrupt engine on Core 1 continues receiving packets without interruption.

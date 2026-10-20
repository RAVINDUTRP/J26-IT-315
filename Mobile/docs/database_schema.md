# AquaShield — Firebase Realtime Database Schema Documentation

**Firebase Project ID:** `boat-research-e08fb`  
**Database URL:** `https://boat-research-e08fb-default-rtdb.firebaseio.com`

---

## 1. Overview of Database Hierarchy

```text
/
├── live_data/                    # Latest realtime broadcast from LoRa Boat
│   ├── water/                    # Submersible probe readings
│   ├── environment/              # Ambient meteorological data
│   ├── navigation/               # GPS coordinates & kinematics
│   ├── attitude/                 # IMU vessel balance & acceleration
│   └── mesh_link/                # LoRa mesh link quality & routing
│
├── history/                      # Time-series log records
│   └── {timestamp_key}/          # e.g., "2026-10-18_14-13-25"
│
├── device_status/                # Fleet and gateway node health
│   ├── boat_001/                 # Autonomous vessel node
│   ├── repeater_01/              # LoRa repeater buoy 1
│   ├── repeater_02/              # LoRa repeater buoy 2
│   └── gateway/                  # Shore base station gateway
│
├── userProfiles/                 # User personal details
│   └── {uid}/
│
└── userRoles/                    # Protected role authorization
    └── {uid}/
```

---

## 2. IoT Telemetry Schema

### A. Live Telemetry: `/live_data`

| Key / Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `water/ph` | `double` | Acidity / Alkalinity level | `3.16` |
| `water/tds_ppm` | `double` | Total Dissolved Solids in ppm | `0` |
| `water/temperature_c` | `double` | Submersible water temperature (°C) | `31.0` |
| `water/turbidity_pct` | `double` | Water turbidity percentage (%) | `34.2` |
| `environment/humidity_pct` | `double` | Relative air humidity (%) | `71.0` |
| `environment/temperature_c` | `double` | Ambient air temperature (°C) | `35.6` |
| `navigation/gps_valid` | `bool` | GPS fix status | `true` |
| `navigation/latitude` | `double` | GPS Latitude in decimal degrees | `6.419002` |
| `navigation/longitude` | `double` | GPS Longitude in decimal degrees | `80.823292` |
| `navigation/altitude_m` | `double` | Altitude above sea level in meters | `89.6` |
| `navigation/speed_kmh` | `double` | Ground speed in km/h | `0.3` |
| `navigation/satellites` | `int` | Connected GNSS satellites | `9` |
| `attitude/pitch_deg` | `double` | Longitudinal tilt angle | `-68.6` |
| `attitude/roll_deg` | `double` | Lateral tilt angle | `70.0` |
| `attitude/accel_z_g` | `double` | Vertical acceleration in Gs | `0.13` |
| `mesh_link/source_id` | `string` | Transmitter node ID | `"BOAT_001"` |
| `mesh_link/hops` | `int` | Number of LoRa hops | `0` |
| `mesh_link/last_forwarder` | `string` | Node relaying to gateway | `"Direct"` |
| `mesh_link/rssi` | `double` | Received Signal Strength Indicator (dBm) | `-27.0` |
| `mesh_link/snr` | `double` | Signal-to-Noise Ratio (dB) | `9.8` |
| `mesh_link/sequence_id` | `int` | LoRa packet counter | `111` |
| `mesh_link/full_route` | `string` | Complete routing chain | `"[BOAT_001 -> GATEWAY]"` |
| `mesh_link/data_age_sec` | `int` | Device telemetry age in seconds | `32` |
| `timestamp` | `string` | Timestamp string | `"2026-10-18 14:13:27"` |
| `epoch` | `int` | Epoch unix seconds | `1792313007` |

---

### B. Historical Log Records: `/history/{timestamp_key}`

Keys are formatted as `YYYY-MM-DD_HH-mm-ss` (e.g. `2026-10-18_14-13-25`). Each entry contains a flat snapshot:

- `air_temp_c`
- `humidity_pct`
- `water_temp_c`
- `ph`
- `turbidity_pct`
- `tds_ppm`
- `latitude`
- `longitude`
- `speed_kmh`
- `satellites`
- `pitch_deg`
- `roll_deg`
- `hops`
- `route`
- `rssi`
- `snr`
- `sequence_id`
- `timestamp`
- `epoch`

---

### C. Fleet Health: `/device_status`

- **`gateway`**: Base station telemetry including `firebase_connected`, `free_heap_kb`, `uptime_sec`, `wifi_ip`, `wifi_rssi`, `duplicates_rejected`, and `total_lora_packets`.
- **`boat_001`**: Boat transmitter health including `status` ("online"/"offline"), `last_seen_sec`, `packet_count`, `rssi`, `snr`, and `last_route`.
- **`repeater_01`, `repeater_02`**: Relay buoy metrics including `status`, `last_seen_sec`, `packet_count`, `rssi`, and `snr`.

---

## 3. User Authorization & Profile Nodes

### `/userProfiles/{uid}`
- `fullName`: string
- `email`: string
- `contactNumber`: string (optional)
- `createdAt`: ISO 8601 string

### `/userRoles/{uid}`
- `role`: string (`"ADMIN"` or `"USER"`)
- `updatedAt`: ISO 8601 string
- `assignedBy`: string

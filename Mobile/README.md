# AquaShield — Smart Water Quality & Disaster Monitoring

Production-grade Flutter mobile application built for autonomous boat telemetry, LoRa mesh networking, realtime water quality monitoring, and GIS positioning.

---

## 🌟 Overview & Key Capabilities

AquaShield is an enterprise-grade mobile telemetry client designed to monitor real-time environmental data collected by an autonomous water research vessel. The application integrates directly with **Firebase Authentication** and **Firebase Realtime Database (RTDB)** to stream zero-mock live sensor readings, vessel kinematics, LoRa mesh topology, and live GPS positioning.

### 1. 🛡️ Role-Based Authentication & Security
- **Dual Role Enforcement**: Distinguishes between `ADMIN` and `USER` roles anchored to Firebase Auth Custom Claims and protected database nodes (`/userRoles/{uid}`).
- **Development & Demo Convenience**: Login screen comes pre-configured with the default Admin credentials (`admin@gmail.com` / `Admin@123`) for rapid testing and demonstrations.
- **Field Researcher Portal (USER role)**: Restricted view displaying phase status, disallowing unauthorized access to vessel telemetry.
- **Zero Mock Data Guarantee**: Completely eliminates mocked or synthetic fallbacks. Telemetry is sourced directly from live RTDB paths (`/live_data` and `/history`).

### 2. 📊 Admin Real-time IoT Dashboard
- **Submersible Water Quality Parameters**:
  - **pH Value**: Real-time reading with automatic chemical categorization (Acidic / Optimal / Alkaline).
  - **Turbidity (%)**: Optical light scattering sensor tracking water clarity.
  - **Sub-surface Water Temp (°C)**: High-precision submerged temperature probe.
  - **TDS Minerals (ppm)**: Electrical conductivity measurement for dissolved solids.
- **Meteorological & Atmospheric Metrics**: Ambient air temperature (°C) and relative humidity (%).
- **Vessel Kinematics & Attitude**: Accelerometer/gyroscope telemetry capturing pitch, roll tilt angles, and vertical Z-acceleration ($g$).
- **Base Station Gateway Status**: Live heartbeat, ESP32 free heap memory, Wi-Fi IP address, Wi-Fi RSSI, uptime, and processed packet counters.

### 3. 🗺️ Interactive Live GPS Positioning & Navigation
- **Interactive OpenStreetMap Visualization**: Embedded high-performance mapping powered by `flutter_map` and `latlong2`.
- **Dynamic Vessel Marker**: Real-time position tracking with animated pulsing radar and coordinates display.
- **Vessel Navigation Telemetry**: GPS lock status, satellite constellation count, ground speed (km/h), latitude, and longitude.
- **External Map Integration**: One-tap action to launch native Google Maps / external navigation via `url_launcher`.

### 4. 📡 LoRa Mesh Network Diagnostics
- **Signal Quality Metrics**: RSSI (Received Signal Strength Indicator) in dBm and SNR (Signal-to-Noise Ratio) in dB.
- **Multi-Hop Route Tracing**: Displays the complete packet transmission path (e.g., `[BOAT_001 -> GATEWAY]`).
- **Telemetry Counter**: Live packet sequence ID and hop counter badges.

### 5. 📈 Advanced Historical Telemetry & Filtering
- **Interactive Trend Charts (`fl_chart`)**:
  - Multi-metric historical curves for pH, Turbidity, Water Temperature, and TDS Mineral levels.
  - Compact trend headers with overflow protection and dynamic point counts.
- **Quick-Access Time Presets**:
  - `Recent 20`: Displays the latest 20 telemetry transmissions (default).
  - `Today`: Filters all readings timestamped within the current calendar day (00:00 - 23:59).
  - `Last 24h`: Dynamically filters all packets logged over the preceding 24 hours.
  - `Custom Range`: Expands the detailed date and time selection panel.
- **Expandable Custom Date & Time Picker**:
  - Start Date/Time and End Date/Time selectors.
  - Configurable data point limits (20, 50, 100 points).
  - Search & Apply Filter action and quick Reset to default.
  - Automatic synchronization: switching between presets smoothly expands or collapses the custom form.
- **Chronological Reading Logs**:
  - Detailed telemetry log table with exact timestamps, hop count badges, and individual parameter readings.

---

## 🏗️ Architecture & Project Structure

```text
Mobile/
├── android/                      # Native Android configuration (package: com.aquashield.aquashield)
│   ├── app/
│   │   ├── build.gradle          # Android app-level Gradle build configuration
│   │   ├── google-services.json  # Authentic Firebase Google Services configuration
│   │   └── src/main/res/         # Launcher icons (AquaShield branded mipmap assets)
│   └── gradle.properties         # JVM & Android toolchain configuration
├── assets/
│   └── images/
│       └── logo.png              # Official AquaShield vector/raster branding
├── docs/
│   ├── database_schema.md        # Confirmed RTDB schema documentation
│   ├── firebase_setup.md         # Firebase & Admin provisioning guide
│   └── security_rules.json       # Production Realtime Database security rules
├── lib/
│   ├── app.dart                  # AquaShieldApp with MultiProvider, theme & localization
│   ├── firebase_options.dart     # Multiplatform Firebase options configuration
│   ├── main.dart                 # Application entry point with async Firebase initialization
│   ├── core/
│   │   ├── constants/            # Thresholds, telemetry keys, and asset references
│   │   ├── theme/                # Material 3 Navy & Aqua color tokens and typography
│   │   ├── utils/                # Date/time formatters and form validation logic
│   │   └── widgets/              # Reusable UI components (MetricCard, StatusBadge, CustomButton, etc.)
│   ├── features/
│   │   ├── admin/
│   │   │   ├── admin_shell_screen.dart # Persistent bottom navigation shell
│   │   │   ├── dashboard/              # Live dashboard tab with interactive GPS map
│   │   │   ├── monitoring/             # Comprehensive real-time sensor monitoring tab
│   │   │   ├── history/                # Historical charts, presets, and date-time filter tab
│   │   │   └── profile/                # Admin profile, credentials info, and sign-out tab
│   │   ├── auth/                       # Login (pre-filled), Register, and Password Reset screens
│   │   ├── splash/                     # Splash screen with authentic auth & role routing
│   │   └── user/                       # Basic Field Researcher landing view
│   ├── models/                         # LiveIotData, HistoryReading, DeviceStatus, UserProfile, UserRole
│   ├── providers/                      # AppAuthProvider and IotProvider (RTDB stream listeners)
│   ├── routing/                        # Named application routes
│   └── services/                       # AuthService, RoleService, and RtdbService
├── scripts/
│   └── provision_admin.py        # Secure Python CLI script for Firebase Admin provisioning
├── test/
│   ├── aquashield_unit_test.dart # Unit tests (UserRole, security validation, RTDB parsing)
│   └── widget_test.dart          # Widget tests for core UI components
└── pubspec.yaml                  # Flutter dependencies, assets, and metadata
```

---

## 🛠️ Technology Stack & Dependencies

| Category | Technology / Library | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Flutter (Dart SDK) | `^3.11.0` | Cross-platform mobile development |
| **UI Design System** | Material 3 | Built-in | Modern responsive design with custom Navy & Aqua palette |
| **State Management** | `provider` | `^6.1.5` | Reactive state management for Auth and IoT streams |
| **Backend & Database** | `firebase_core`, `firebase_auth`, `firebase_database` | Latest | Live Realtime Database streaming & authentication |
| **Charting Engine** | `fl_chart` | `^1.2.0` | Dynamic line charts with cubic smoothing and custom tooltips |
| **GIS & Mapping** | `flutter_map`, `latlong2` | `^8.3.2` | Embedded OpenStreetMap rendering for vessel GPS tracking |
| **External Utilities** | `url_launcher`, `intl` | Latest | Native map launching, date-time formatting |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Flutter SDK**: `^3.11.0` (Dart null-safety compatible)
- **Android Studio / Android SDK**: Platform API 34+
- **Java Development Kit**: JDK 17 or JDK 21 (Android Studio bundled JBR recommended)

### 2. Dependency Installation
```bash
flutter pub get
```

### 3. Verify Code Quality & Tests
Run static analysis and unit tests to ensure 100% compliance:
```bash
# Analyze project for lint warnings or errors
flutter analyze

# Run unit and widget test suites
flutter test
```

### 4. Admin Account Initialization
To provision the administrator account directly on Firebase Authentication and Realtime Database:
```bash
python scripts/provision_admin.py --email admin@gmail.com --password Admin@123
```

### 5. Running the Application

#### On Connected Device / Emulator:
```bash
flutter run -d android
```

#### Build Debug APK:
```bash
# Using Gradle wrapper
.\android\gradlew.bat -p android assembleDebug
```
The output APK will be generated at:
`build/app/outputs/flutter-apk/app-debug.apk`

#### Install Directly via ADB:
```bash
adb install -r -t -g build/app/outputs/flutter-apk/app-debug.apk
```

---

## 🔐 Credentials & Default Access

| Role | Email | Password | Access Privileges |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@gmail.com` | `Admin@123` | Full access to Live Dashboard, GPS Map, Telemetry Monitoring, and History Filtering |
| **Researcher** | *(Self-registered)* | *(Custom)* | Restricted Field Researcher overview |

*(Note: Admin credentials are automatically pre-filled on the login screen for testing convenience).*


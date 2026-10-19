/// Application-wide constants for AquaShield.
class AppConstants {
  AppConstants._();

  static const String appName = 'AquaShield';
  static const String appTagline = 'Smart Water Quality & Disaster Monitoring';
  static const String appVersion = '1.0.0 (Research Edition)';

  // Assets
  static const String logoPath = 'assets/images/logo.png';

  // Firebase Realtime Database Paths
  static const String rtdbLiveDataPath = 'live_data';
  static const String rtdbHistoryPath = 'history';
  static const String rtdbDeviceStatusPath = 'device_status';
  static const String rtdbUserProfilesPath = 'userProfiles';
  static const String rtdbUserRolesPath = 'userRoles';

  // Telemetry Freshness Thresholds
  static const Duration telemetryFreshDuration = Duration(seconds: 60);
  static const Duration telemetryStaleDuration = Duration(seconds: 180);

  // Demonstration Water Quality Thresholds
  // DISCLAIMER: These thresholds are configurable baseline assumptions for demonstration
  // and research visualization purposes, pending formal scientific/regulatory validation.
  static const double phMinNormal = 6.5;
  static const double phMaxNormal = 8.5;
  static const double turbidityMaxNormal = 50.0; // percent
  static const double waterTempMinNormal = 20.0; // Celsius
  static const double waterTempMaxNormal = 32.0; // Celsius
  static const double tdsMaxNormal = 500.0; // ppm

  // Role Names
  static const String roleAdmin = 'ADMIN';
  static const String roleUser = 'USER';
}

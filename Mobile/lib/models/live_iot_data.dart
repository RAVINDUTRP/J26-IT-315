/// Model representing water sensor telemetry from `/live_data/water`.
class WaterTelemetry {
  final double? ph;
  final double? tdsPpm;
  final double? temperatureC;
  final double? turbidityPct;

  const WaterTelemetry({
    this.ph,
    this.tdsPpm,
    this.temperatureC,
    this.turbidityPct,
  });

  factory WaterTelemetry.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return const WaterTelemetry();
    return WaterTelemetry(
      ph: (map['ph'] as num?)?.toDouble(),
      tdsPpm: (map['tds_ppm'] as num?)?.toDouble(),
      temperatureC: (map['temperature_c'] as num?)?.toDouble(),
      turbidityPct: (map['turbidity_pct'] as num?)?.toDouble(),
    );
  }

  bool get hasData =>
      ph != null ||
      tdsPpm != null ||
      temperatureC != null ||
      turbidityPct != null;
}

/// Model representing environmental telemetry from `/live_data/environment`.
class EnvironmentTelemetry {
  final double? humidityPct;
  final double? temperatureC;

  const EnvironmentTelemetry({this.humidityPct, this.temperatureC});

  factory EnvironmentTelemetry.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return const EnvironmentTelemetry();
    return EnvironmentTelemetry(
      humidityPct: (map['humidity_pct'] as num?)?.toDouble(),
      temperatureC: (map['temperature_c'] as num?)?.toDouble(),
    );
  }

  bool get hasData => humidityPct != null || temperatureC != null;
}

/// Model representing GPS & boat navigation telemetry from `/live_data/navigation`.
class NavigationTelemetry {
  final double? altitudeM;
  final bool gpsValid;
  final double? latitude;
  final double? longitude;
  final int satellites;
  final double? speedKmh;

  const NavigationTelemetry({
    this.altitudeM,
    this.gpsValid = false,
    this.latitude,
    this.longitude,
    this.satellites = 0,
    this.speedKmh,
  });

  factory NavigationTelemetry.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return const NavigationTelemetry();
    return NavigationTelemetry(
      altitudeM: (map['altitude_m'] as num?)?.toDouble(),
      gpsValid: map['gps_valid'] == true,
      latitude: (map['latitude'] as num?)?.toDouble(),
      longitude: (map['longitude'] as num?)?.toDouble(),
      satellites: (map['satellites'] as num?)?.toInt() ?? 0,
      speedKmh: (map['speed_kmh'] as num?)?.toDouble(),
    );
  }

  bool get hasValidCoordinates =>
      gpsValid &&
      latitude != null &&
      longitude != null &&
      latitude != 0 &&
      longitude != 0;
}

/// Model representing boat orientation & accelerometer from `/live_data/attitude`.
class AttitudeTelemetry {
  final double? accelZG;
  final double? pitchDeg;
  final double? rollDeg;

  const AttitudeTelemetry({this.accelZG, this.pitchDeg, this.rollDeg});

  factory AttitudeTelemetry.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return const AttitudeTelemetry();
    return AttitudeTelemetry(
      accelZG: (map['accel_z_g'] as num?)?.toDouble(),
      pitchDeg: (map['pitch_deg'] as num?)?.toDouble(),
      rollDeg: (map['roll_deg'] as num?)?.toDouble(),
    );
  }

  bool get hasData => pitchDeg != null || rollDeg != null || accelZG != null;
}

/// Model representing LoRa mesh transmission metrics from `/live_data/mesh_link`.
class MeshLinkTelemetry {
  final int? dataAgeSec;
  final String? fullRoute;
  final int hops;
  final String? lastForwarder;
  final double? rssi;
  final int? sequenceId;
  final String? sessionId;
  final double? snr;
  final String? sourceId;

  const MeshLinkTelemetry({
    this.dataAgeSec,
    this.fullRoute,
    this.hops = 0,
    this.lastForwarder,
    this.rssi,
    this.sequenceId,
    this.sessionId,
    this.snr,
    this.sourceId,
  });

  factory MeshLinkTelemetry.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return const MeshLinkTelemetry();
    return MeshLinkTelemetry(
      dataAgeSec: (map['data_age_sec'] as num?)?.toInt(),
      fullRoute: map['full_route']?.toString(),
      hops: (map['hops'] as num?)?.toInt() ?? 0,
      lastForwarder: map['last_forwarder']?.toString(),
      rssi: (map['rssi'] as num?)?.toDouble(),
      sequenceId: (map['sequence_id'] as num?)?.toInt(),
      sessionId: map['session_id']?.toString(),
      snr: (map['snr'] as num?)?.toDouble(),
      sourceId: map['source_id']?.toString(),
    );
  }
}

/// Root Model representing entire `/live_data` node in Firebase RTDB.
class LiveIotData {
  final WaterTelemetry water;
  final EnvironmentTelemetry environment;
  final NavigationTelemetry navigation;
  final AttitudeTelemetry attitude;
  final MeshLinkTelemetry meshLink;
  final int? epoch;
  final bool telemetryAvailable;
  final String? timestamp;
  final DateTime receivedAt;

  LiveIotData({
    required this.water,
    required this.environment,
    required this.navigation,
    required this.attitude,
    required this.meshLink,
    this.epoch,
    this.telemetryAvailable = false,
    this.timestamp,
    DateTime? receivedAt,
  }) : receivedAt = receivedAt ?? DateTime.now();

  factory LiveIotData.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) {
      return LiveIotData(
        water: const WaterTelemetry(),
        environment: const EnvironmentTelemetry(),
        navigation: const NavigationTelemetry(),
        attitude: const AttitudeTelemetry(),
        meshLink: const MeshLinkTelemetry(),
        telemetryAvailable: false,
      );
    }

    final rawWater = map['water'] is Map ? map['water'] as Map : null;
    final rawEnv = map['environment'] is Map ? map['environment'] as Map : null;
    final rawNav = map['navigation'] is Map ? map['navigation'] as Map : null;
    final rawAtt = map['attitude'] is Map ? map['attitude'] as Map : null;
    final rawMesh = map['mesh_link'] is Map ? map['mesh_link'] as Map : null;

    return LiveIotData(
      water: WaterTelemetry.fromMap(rawWater),
      environment: EnvironmentTelemetry.fromMap(rawEnv),
      navigation: NavigationTelemetry.fromMap(rawNav),
      attitude: AttitudeTelemetry.fromMap(rawAtt),
      meshLink: MeshLinkTelemetry.fromMap(rawMesh),
      epoch: (map['epoch'] as num?)?.toInt(),
      telemetryAvailable: map['telemetry_available'] == true,
      timestamp: map['timestamp']?.toString(),
      receivedAt: DateTime.now(),
    );
  }

  /// Calculates data freshness in seconds compared to device's mesh dataAgeSec or reception time
  int get calculatedAgeSeconds {
    if (meshLink.dataAgeSec != null && meshLink.dataAgeSec! >= 0) {
      return meshLink.dataAgeSec!;
    }
    if (epoch != null && epoch! > 0) {
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final diff = nowSec - epoch!;
      if (diff >= 0) return diff;
    }
    return DateTime.now().difference(receivedAt).inSeconds;
  }

  /// Checks if telemetry is fresh (< 60s)
  bool get isFresh => calculatedAgeSeconds < 60;

  /// Checks if telemetry is stale (> 180s)
  bool get isStale => calculatedAgeSeconds >= 180;
}

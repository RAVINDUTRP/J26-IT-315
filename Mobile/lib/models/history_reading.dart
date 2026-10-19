/// Model representing a single historical record under `/history/{timestamp_key}` in RTDB.
class HistoryReading {
  final String key;
  final double? airTempC;
  final int? epoch;
  final int hops;
  final double? humidityPct;
  final double? latitude;
  final double? longitude;
  final double? ph;
  final double? pitchDeg;
  final double? rollDeg;
  final String? route;
  final double? rssi;
  final int satellites;
  final int? sequenceId;
  final double? snr;
  final double? speedKmh;
  final double? tdsPpm;
  final String? timestamp;
  final double? turbidityPct;
  final double? waterTempC;

  const HistoryReading({
    required this.key,
    this.airTempC,
    this.epoch,
    this.hops = 0,
    this.humidityPct,
    this.latitude,
    this.longitude,
    this.ph,
    this.pitchDeg,
    this.rollDeg,
    this.route,
    this.rssi,
    this.satellites = 0,
    this.sequenceId,
    this.snr,
    this.speedKmh,
    this.tdsPpm,
    this.timestamp,
    this.turbidityPct,
    this.waterTempC,
  });

  factory HistoryReading.fromMap(String key, Map<dynamic, dynamic>? map) {
    if (map == null) return HistoryReading(key: key);
    return HistoryReading(
      key: key,
      airTempC: (map['air_temp_c'] as num?)?.toDouble(),
      epoch: (map['epoch'] as num?)?.toInt(),
      hops: (map['hops'] as num?)?.toInt() ?? 0,
      humidityPct: (map['humidity_pct'] as num?)?.toDouble(),
      latitude: (map['latitude'] as num?)?.toDouble(),
      longitude: (map['longitude'] as num?)?.toDouble(),
      ph: (map['ph'] as num?)?.toDouble(),
      pitchDeg: (map['pitch_deg'] as num?)?.toDouble(),
      rollDeg: (map['roll_deg'] as num?)?.toDouble(),
      route: map['route']?.toString(),
      rssi: (map['rssi'] as num?)?.toDouble(),
      satellites: (map['satellites'] as num?)?.toInt() ?? 0,
      sequenceId: (map['sequence_id'] as num?)?.toInt(),
      snr: (map['snr'] as num?)?.toDouble(),
      speedKmh: (map['speed_kmh'] as num?)?.toDouble(),
      tdsPpm: (map['tds_ppm'] as num?)?.toDouble(),
      timestamp: map['timestamp']?.toString(),
      turbidityPct: (map['turbidity_pct'] as num?)?.toDouble(),
      waterTempC: (map['water_temp_c'] as num?)?.toDouble(),
    );
  }

  DateTime? get parsedDateTime {
    if (timestamp != null && timestamp!.isNotEmpty) {
      try {
        final sanitized = timestamp!.trim().replaceAll('_', 'T').replaceFirst(' ', 'T');
        final dt = DateTime.tryParse(sanitized);
        if (dt != null) return dt;
      } catch (_) {}
    }
    if (epoch != null && epoch! > 0) {
      return DateTime.fromMillisecondsSinceEpoch(epoch! * 1000);
    }
    return null;
  }
}

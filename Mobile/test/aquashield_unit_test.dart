import 'package:aquashield/core/utils/formatters.dart';
import 'package:aquashield/core/utils/validators.dart';
import 'package:aquashield/models/device_status.dart';
import 'package:aquashield/models/history_reading.dart';
import 'package:aquashield/models/live_iot_data.dart';
import 'package:aquashield/models/user_profile.dart';
import 'package:aquashield/models/user_role.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('UserRole & Security Validation Tests', () {
    test('Role parsing from string values', () {
      expect(UserRole.fromString('ADMIN'), equals(UserRole.admin));
      expect(UserRole.fromString('admin'), equals(UserRole.admin));
      expect(UserRole.fromString('USER'), equals(UserRole.user));
      expect(UserRole.fromString('user'), equals(UserRole.user));
      expect(UserRole.fromString(''), equals(UserRole.none));
      expect(UserRole.fromString(null), equals(UserRole.none));
      expect(UserRole.fromString('SUPER_ADMIN'), equals(UserRole.none));
    });

    test('UserRole boolean helpers and db values', () {
      expect(UserRole.admin.isAdmin, isTrue);
      expect(UserRole.admin.isUser, isFalse);
      expect(UserRole.admin.toDbValue(), equals('ADMIN'));

      expect(UserRole.user.isAdmin, isFalse);
      expect(UserRole.user.isUser, isTrue);
      expect(UserRole.user.toDbValue(), equals('USER'));

      expect(UserRole.none.isAdmin, isFalse);
      expect(UserRole.none.isUser, isFalse);
    });

    test('UserProfile creation and serialization', () {
      const profile = UserProfile(
        uid: 'test_uid_123',
        fullName: 'Test Researcher',
        email: 'researcher@gmail.com',
        contactNumber: '+94712345678',
        createdAt: '2026-10-18T14:00:00Z',
        role: UserRole.user,
      );

      final map = profile.toMap();
      expect(map['fullName'], equals('Test Researcher'));
      expect(map['email'], equals('researcher@gmail.com'));
      expect(map['contactNumber'], equals('+94712345678'));

      final parsed = UserProfile.fromMap(
        'test_uid_123',
        map,
        role: UserRole.user,
      );
      expect(parsed.fullName, equals('Test Researcher'));
      expect(parsed.role, equals(UserRole.user));
    });

    test('UserProfile handles null and malformed maps safely', () {
      final parsed = UserProfile.fromMap('uid_null', null);
      expect(parsed.uid, equals('uid_null'));
      expect(parsed.fullName, equals('Unknown User'));
      expect(parsed.role, equals(UserRole.user));
    });
  });

  group('Form Validators Tests', () {
    test('validateEmail accepts valid emails and rejects invalid ones', () {
      expect(Validators.validateEmail('admin@gmail.com'), isNull);
      expect(Validators.validateEmail('researcher.user@sliit.lk'), isNull);
      expect(Validators.validateEmail(''), isNotNull);
      expect(Validators.validateEmail(null), isNotNull);
      expect(Validators.validateEmail('invalid-email'), isNotNull);
      expect(Validators.validateEmail('missing@domain'), isNotNull);
    });

    test('validatePassword enforces minimum 6 characters', () {
      expect(Validators.validatePassword('Admin@123'), isNull);
      expect(Validators.validatePassword('123456'), isNull);
      expect(Validators.validatePassword('12345'), isNotNull);
      expect(Validators.validatePassword(''), isNotNull);
      expect(Validators.validatePassword(null), isNotNull);
    });

    test('validateConfirmPassword ensures password match', () {
      expect(Validators.validateConfirmPassword('pass123', 'pass123'), isNull);
      expect(
        Validators.validateConfirmPassword('pass123', 'diffPass'),
        isNotNull,
      );
      expect(Validators.validateConfirmPassword('', 'pass123'), isNotNull);
      expect(Validators.validateConfirmPassword(null, 'pass123'), isNotNull);
    });

    test('validateFullName enforces minimum length', () {
      expect(Validators.validateFullName('Aqua Admin'), isNull);
      expect(Validators.validateFullName('A'), isNotNull);
      expect(Validators.validateFullName(''), isNotNull);
      expect(Validators.validateFullName(null), isNotNull);
    });
  });

  group('IoT Data Model Parsing & Handling Tests', () {
    test('LiveIotData parses authentic RTDB exported schema accurately', () {
      final sampleLive = {
        'attitude': {'accel_z_g': 0.13, 'pitch_deg': -68.6, 'roll_deg': 70.0},
        'environment': {'humidity_pct': 71, 'temperature_c': 35.6},
        'epoch': 1792313007,
        'mesh_link': {
          'data_age_sec': 32,
          'full_route': '[BOAT_001 -> GATEWAY]',
          'hops': 0,
          'last_forwarder': 'Direct',
          'rssi': -27,
          'sequence_id': 111,
          'session_id': '0xbc61de79',
          'snr': 9.8,
          'source_id': 'BOAT_001',
        },
        'navigation': {
          'altitude_m': 89.6,
          'gps_valid': true,
          'latitude': 6.419002,
          'longitude': 80.823292,
          'satellites': 9,
          'speed_kmh': 0.3,
        },
        'telemetry_available': true,
        'timestamp': '2026-10-18 14:13:27',
        'water': {
          'ph': 3.16,
          'tds_ppm': 0,
          'temperature_c': 31.0,
          'turbidity_pct': 34.2,
        },
      };

      final liveData = LiveIotData.fromMap(sampleLive);

      expect(liveData.water.ph, equals(3.16));
      expect(liveData.water.turbidityPct, equals(34.2));
      expect(liveData.water.temperatureC, equals(31.0));
      expect(liveData.water.tdsPpm, equals(0.0));

      expect(liveData.environment.humidityPct, equals(71.0));
      expect(liveData.environment.temperatureC, equals(35.6));

      expect(liveData.navigation.gpsValid, isTrue);
      expect(liveData.navigation.hasValidCoordinates, isTrue);
      expect(liveData.navigation.latitude, equals(6.419002));
      expect(liveData.navigation.longitude, equals(80.823292));
      expect(liveData.navigation.satellites, equals(9));
      expect(liveData.navigation.speedKmh, equals(0.3));

      expect(liveData.meshLink.hops, equals(0));
      expect(liveData.meshLink.sourceId, equals('BOAT_001'));
      expect(liveData.meshLink.rssi, equals(-27.0));
      expect(liveData.meshLink.snr, equals(9.8));
      expect(liveData.meshLink.dataAgeSec, equals(32));

      expect(liveData.isFresh, isTrue);
      expect(liveData.isStale, isFalse);
    });

    test('LiveIotData handles missing and null fields gracefully', () {
      final emptyMap = <dynamic, dynamic>{};
      final liveData = LiveIotData.fromMap(emptyMap);

      expect(liveData.water.ph, isNull);
      expect(liveData.water.hasData, isFalse);
      expect(liveData.navigation.hasValidCoordinates, isFalse);
      expect(liveData.meshLink.hops, equals(0));
      expect(liveData.telemetryAvailable, isFalse);
    });

    test('HistoryReading parses timestamps and null sensors safely', () {
      final sampleHistory = {
        'air_temp_c': 35.6,
        'epoch': 1792312824,
        'hops': 1,
        'humidity_pct': 71,
        'latitude': 6.418984,
        'longitude': 80.823244,
        'ph': 3.17,
        'pitch_deg': -68.5,
        'roll_deg': 69.7,
        'route': '[BOAT_001 -> REP_02 -> GATEWAY]',
        'rssi': -44,
        'satellites': 9,
        'sequence_id': 108,
        'snr': 9.5,
        'speed_kmh': 0,
        'tds_ppm': 0,
        'timestamp': '2026-10-18 14:10:24',
        'turbidity_pct': 34,
        'water_temp_c': 30.75,
      };

      final reading = HistoryReading.fromMap(
        '2026-10-18_14-10-24',
        sampleHistory,
      );

      expect(reading.key, equals('2026-10-18_14-10-24'));
      expect(reading.ph, equals(3.17));
      expect(reading.turbidityPct, equals(34.0));
      expect(reading.waterTempC, equals(30.75));
      expect(reading.hops, equals(1));
      expect(reading.route, contains('REP_02'));
      expect(reading.parsedDateTime, isNotNull);
    });

    test('DeviceStatusData parses gateway and nodes', () {
      final sampleDeviceStatus = {
        'boat_001': {
          'last_route': '[BOAT_001 -> GATEWAY]',
          'last_seen_sec': 33,
          'packet_count': 5,
          'rssi': -27,
          'snr': 9.8,
          'status': 'online',
        },
        'gateway': {
          'duplicates_rejected': 14,
          'firebase_connected': true,
          'free_heap_kb': 160,
          'status': 'online',
          'total_lora_packets': 23,
          'uptime_sec': 243,
          'wifi_connected': true,
          'wifi_ip': '192.168.1.180',
          'wifi_rssi': -30,
        },
        'repeater_01': {
          'last_seen_sec': 4294967295,
          'packet_count': 0,
          'status': 'offline',
        },
        'repeater_02': {
          'last_seen_sec': 76,
          'packet_count': 5,
          'status': 'online',
        },
        'last_updated': '2026-10-18 14:13:28',
      };

      final statusData = DeviceStatusData.fromMap(sampleDeviceStatus);

      expect(statusData.gateway.isOnline, isTrue);
      expect(statusData.gateway.wifiIp, equals('192.168.1.180'));
      expect(statusData.gateway.freeHeapKb, equals(160));

      expect(statusData.boat001.isOnline, isTrue);
      expect(statusData.boat001.packetCount, equals(5));

      expect(statusData.repeater01.isOnline, isFalse);
      expect(statusData.repeater02.isOnline, isTrue);
    });
  });

  group('Formatters Tests', () {
    test('formatDecimal handles null and precision', () {
      expect(Formatters.formatDecimal(null), equals('N/A'));
      expect(Formatters.formatDecimal(3.14159, precision: 2), equals('3.14'));
      expect(Formatters.formatDecimal(34.2, precision: 1), equals('34.2'));
    });

    test('formatDataAge formats seconds properly', () {
      expect(Formatters.formatDataAge(32), equals('32s ago'));
      expect(Formatters.formatDataAge(125), equals('2m 5s ago'));
      expect(Formatters.formatDataAge(4294967295), equals('Never / Offline'));
      expect(Formatters.formatDataAge(null), equals('Unknown'));
    });

    test('formatCoordinate formats lat and long correctly', () {
      expect(
        Formatters.formatCoordinate(6.419002, isLatitude: true),
        equals('6.419002° N'),
      );
      expect(
        Formatters.formatCoordinate(-6.419002, isLatitude: true),
        equals('6.419002° S'),
      );
      expect(
        Formatters.formatCoordinate(80.823292, isLatitude: false),
        equals('80.823292° E'),
      );
      expect(Formatters.formatCoordinate(null), equals('N/A'));
    });
  });
}

import 'dart:async';
import 'package:firebase_database/firebase_database.dart';
import '../core/constants/app_constants.dart';
import '../models/device_status.dart';
import '../models/history_reading.dart';
import '../models/live_iot_data.dart';
import '../models/user_profile.dart';

/// Service for reading IoT telemetry and user profiles from Firebase Realtime Database.
/// Note: The mobile application is purely a consumer (read-only) of IoT data.
class RtdbService {
  final FirebaseDatabase _database;

  RtdbService({FirebaseDatabase? database})
    : _database = database ?? FirebaseDatabase.instance;

  /// Stream of connection state from `.info/connected`
  Stream<bool> streamConnectionStatus() {
    return _database
        .ref('.info/connected')
        .onValue
        .map((event) {
          return event.snapshot.value == true;
        })
        .handleError((_) => false);
  }

  /// Realtime stream of live IoT telemetry from `/live_data`
  Stream<LiveIotData?> streamLiveData() {
    return _database.ref(AppConstants.rtdbLiveDataPath).onValue.map((event) {
      final value = event.snapshot.value;
      if (value == null || value is! Map) return null;
      return LiveIotData.fromMap(value);
    });
  }

  /// Realtime stream of device and gateway statuses from `/device_status`
  Stream<DeviceStatusData?> streamDeviceStatus() {
    return _database.ref(AppConstants.rtdbDeviceStatusPath).onValue.map((
      event,
    ) {
      final value = event.snapshot.value;
      if (value == null || value is! Map) return null;
      return DeviceStatusData.fromMap(value);
    });
  }

  /// Streams recent history readings from `/history` (default 20 data points)
  Stream<List<HistoryReading>> streamHistory({int limit = 20}) {
    return _database
        .ref(AppConstants.rtdbHistoryPath)
        .limitToLast(limit)
        .onValue
        .map((event) {
          final value = event.snapshot.value;
          if (value == null || value is! Map) return <HistoryReading>[];

          final readings = <HistoryReading>[];
          value.forEach((key, val) {
            if (val is Map) {
              readings.add(HistoryReading.fromMap(key.toString(), val));
            }
          });

          // Sort by timestamp or epoch descending (most recent first)
          readings.sort((a, b) {
            final aEpoch = a.epoch ?? 0;
            final bEpoch = b.epoch ?? 0;
            if (aEpoch != bEpoch) return bEpoch.compareTo(aEpoch);
            return (b.timestamp ?? '').compareTo(a.timestamp ?? '');
          });

          return readings;
        });
  }

  /// Fetches historical records once (default 20 data points)
  Future<List<HistoryReading>> fetchHistory({int limit = 20}) async {
    final snapshot = await _database
        .ref(AppConstants.rtdbHistoryPath)
        .limitToLast(limit)
        .get();

    if (!snapshot.exists || snapshot.value is! Map) {
      return <HistoryReading>[];
    }

    final value = snapshot.value as Map;
    final readings = <HistoryReading>[];
    value.forEach((key, val) {
      if (val is Map) {
        readings.add(HistoryReading.fromMap(key.toString(), val));
      }
    });

    readings.sort((a, b) {
      final aEpoch = a.epoch ?? 0;
      final bEpoch = b.epoch ?? 0;
      if (aEpoch != bEpoch) return bEpoch.compareTo(aEpoch);
      return (b.timestamp ?? '').compareTo(a.timestamp ?? '');
    });

    return readings;
  }

  /// Streams user profile from `/userProfiles/{uid}`
  Stream<UserProfile?> streamUserProfile(String uid) {
    return _database
        .ref('${AppConstants.rtdbUserProfilesPath}/$uid')
        .onValue
        .map((event) {
          final val = event.snapshot.value;
          if (val is Map) {
            return UserProfile.fromMap(uid, val);
          }
          return null;
        });
  }

  /// Fetches user profile once
  Future<UserProfile?> fetchUserProfile(String uid) async {
    final snapshot = await _database
        .ref('${AppConstants.rtdbUserProfilesPath}/$uid')
        .get();

    if (snapshot.exists && snapshot.value is Map) {
      return UserProfile.fromMap(uid, snapshot.value as Map);
    }
    return null;
  }
}

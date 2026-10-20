import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/device_status.dart';
import '../models/history_reading.dart';
import '../models/live_iot_data.dart';
import '../services/rtdb_service.dart';

/// Provider responsible for streaming and caching Firebase RTDB IoT telemetry,
/// gateway status, and historical data.
class IotProvider extends ChangeNotifier {
  final RtdbService _rtdbService;

  StreamSubscription<bool>? _connectionSubscription;
  StreamSubscription<LiveIotData?>? _liveDataSubscription;
  StreamSubscription<DeviceStatusData?>? _deviceStatusSubscription;
  StreamSubscription<List<HistoryReading>>? _historySubscription;

  bool _isFirebaseConnected = false;
  LiveIotData? _liveData;
  DeviceStatusData? _deviceStatus;
  List<HistoryReading> _historyReadings = [];

  bool _isLoadingLiveData = true;
  bool _isLoadingHistory = true;
  String? _liveDataError;
  String? _historyError;

  String _selectedHistoryMetric =
      'ph'; // 'ph', 'turbidity', 'water_temp', 'tds'

  IotProvider({RtdbService? rtdbService})
    : _rtdbService = rtdbService ?? RtdbService() {
    startListening();
  }

  bool get isFirebaseConnected => _isFirebaseConnected;
  LiveIotData? get liveData => _liveData;
  DeviceStatusData? get deviceStatus => _deviceStatus;
  List<HistoryReading> get historyReadings => _historyReadings;

  bool get isLoadingLiveData => _isLoadingLiveData;
  bool get isLoadingHistory => _isLoadingHistory;
  String? get liveDataError => _liveDataError;
  String? get historyError => _historyError;
  String get selectedHistoryMetric => _selectedHistoryMetric;

  void startListening() {
    _subscribeConnection();
    _subscribeLiveData();
    _subscribeDeviceStatus();
    _subscribeHistory();
  }

  void _subscribeConnection() {
    _connectionSubscription?.cancel();
    _connectionSubscription = _rtdbService.streamConnectionStatus().listen(
      (connected) {
        _isFirebaseConnected = connected;
        notifyListeners();
      },
      onError: (_) {
        _isFirebaseConnected = false;
        notifyListeners();
      },
    );
  }

  void _subscribeLiveData() {
    _liveDataSubscription?.cancel();
    _isLoadingLiveData = true;
    _liveDataError = null;
    notifyListeners();

    _liveDataSubscription = _rtdbService.streamLiveData().listen(
      (data) {
        _liveData = data;
        _isLoadingLiveData = false;
        _liveDataError = null;
        notifyListeners();
      },
      onError: (e) {
        _isLoadingLiveData = false;
        _liveDataError = 'Failed to stream live IoT telemetry: ${e.toString()}';
        notifyListeners();
      },
    );
  }

  void _subscribeDeviceStatus() {
    _deviceStatusSubscription?.cancel();
    _deviceStatusSubscription = _rtdbService.streamDeviceStatus().listen((
      status,
    ) {
      _deviceStatus = status;
      notifyListeners();
    }, onError: (_) {});
  }

  int _historyLimit = 20;
  int get historyLimit => _historyLimit;

  void setHistoryLimit(int limit) {
    if (_historyLimit != limit) {
      _historyLimit = limit;
      _subscribeHistory();
    }
  }

  void _subscribeHistory() {
    _historySubscription?.cancel();
    _isLoadingHistory = true;
    _historyError = null;
    notifyListeners();

    _historySubscription = _rtdbService
        .streamHistory(limit: _historyLimit)
        .listen(
          (readings) {
            _historyReadings = readings;
            _isLoadingHistory = false;
            _historyError = null;
            notifyListeners();
          },
          onError: (e) {
            _isLoadingHistory = false;
            _historyError =
                'Failed to load historical sensor data: ${e.toString()}';
            notifyListeners();
          },
        );
  }

  Future<void> refreshHistory({int? limit}) async {
    try {
      _isLoadingHistory = true;
      notifyListeners();
      final effectiveLimit = limit ?? _historyLimit;
      final readings = await _rtdbService.fetchHistory(limit: effectiveLimit);
      _historyReadings = readings;
      _isLoadingHistory = false;
      _historyError = null;
    } catch (e) {
      _isLoadingHistory = false;
      _historyError = e.toString();
    }
    notifyListeners();
  }

  void setHistoryMetric(String metric) {
    if (_selectedHistoryMetric != metric) {
      _selectedHistoryMetric = metric;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _connectionSubscription?.cancel();
    _liveDataSubscription?.cancel();
    _deviceStatusSubscription?.cancel();
    _historySubscription?.cancel();
    super.dispose();
  }
}

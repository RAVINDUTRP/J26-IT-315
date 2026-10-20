import 'package:intl/intl.dart';

/// Formatting utilities for AquaShield.
class Formatters {
  Formatters._();

  static final DateFormat _dateTimeFormat = DateFormat('yyyy-MM-dd HH:mm:ss');
  static final DateFormat _timeOnlyFormat = DateFormat('HH:mm:ss');
  static final DateFormat _dateOnlyFormat = DateFormat('yyyy-MM-dd');

  /// Formats a [DateTime] into a standard full string: YYYY-MM-DD HH:mm:ss
  static String formatDateTime(DateTime? dateTime) {
    if (dateTime == null) return 'N/A';
    return _dateTimeFormat.format(dateTime.toLocal());
  }

  /// Formats time only: HH:mm:ss
  static String formatTimeOnly(DateTime? dateTime) {
    if (dateTime == null) return '--:--:--';
    return _timeOnlyFormat.format(dateTime.toLocal());
  }

  /// Formats date only: YYYY-MM-DD
  static String formatDateOnly(DateTime? dateTime) {
    if (dateTime == null) return '----/--/--';
    return _dateOnlyFormat.format(dateTime.toLocal());
  }

  /// Formats an epoch seconds integer or parsed string into standard date/time
  static String formatEpochSeconds(int? epochSec) {
    if (epochSec == null || epochSec <= 0) return 'N/A';
    final dt = DateTime.fromMillisecondsSinceEpoch(epochSec * 1000);
    return formatDateTime(dt);
  }

  /// Formats numeric decimal value cleanly
  static String formatDecimal(
    num? value, {
    int precision = 2,
    String fallback = 'N/A',
  }) {
    if (value == null) return fallback;
    return value.toStringAsFixed(precision);
  }

  /// Formats human-readable age from seconds
  static String formatDataAge(int? seconds) {
    if (seconds == null || seconds < 0) return 'Unknown';
    if (seconds >= 4294967000) return 'Never / Offline';
    if (seconds < 60) return '${seconds}s ago';
    final minutes = seconds ~/ 60;
    if (minutes < 60) return '${minutes}m ${seconds % 60}s ago';
    final hours = minutes ~/ 60;
    return '${hours}h ${minutes % 60}m ago';
  }

  /// Formats GPS coordinates
  static String formatCoordinate(double? coord, {bool isLatitude = true}) {
    if (coord == null) return 'N/A';
    final direction = isLatitude
        ? (coord >= 0 ? 'N' : 'S')
        : (coord >= 0 ? 'E' : 'W');
    return '${coord.abs().toStringAsFixed(6)}° $direction';
  }
}

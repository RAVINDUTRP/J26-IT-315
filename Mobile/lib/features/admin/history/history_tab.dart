import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../models/history_reading.dart';
import '../../../providers/iot_provider.dart';

/// Historical Telemetry & Analytics tab displaying interactive fl_chart time-series,
/// date-time range filters, point limits, and chronological tabular readings from `/history`.
class HistoryTab extends StatefulWidget {
  const HistoryTab({super.key});

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<HistoryTab> {
  // Selected metric for chart: 'ph', 'turbidity', 'water_temp', 'tds'
  String _selectedMetric = 'ph';

  // Date-Time filter state
  String _activePreset = 'All'; // 'All', 'Today', 'Last 24h', 'Custom'
  DateTime? _filterStartDate;
  TimeOfDay? _filterStartTime;
  DateTime? _filterEndDate;
  TimeOfDay? _filterEndTime;
  int _pointLimit = 20; // Default 20 data points as requested
  bool _isFilterExpanded = false;

  final DateFormat _displayDateFormat = DateFormat('yyyy-MM-dd HH:mm');

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _filterStartDate = DateTime(now.year, now.month, now.day, 0, 0);
    _filterStartTime = const TimeOfDay(hour: 0, minute: 0);
    _filterEndDate = now;
    _filterEndTime = TimeOfDay(hour: now.hour, minute: now.minute);
  }

  /// Filters all raw history readings according to the selected date-time range and point limit
  List<HistoryReading> _getFilteredReadings(List<HistoryReading> allReadings) {
    if (allReadings.isEmpty) return [];

    DateTime? startRange;
    DateTime? endRange;
    final now = DateTime.now();

    if (_activePreset == 'Today') {
      startRange = DateTime(now.year, now.month, now.day, 0, 0, 0);
      endRange = DateTime(now.year, now.month, now.day, 23, 59, 59);
    } else if (_activePreset == 'Last 24h') {
      startRange = now.subtract(const Duration(hours: 24));
      endRange = now;
    } else if (_activePreset == 'Custom') {
      if (_filterStartDate != null) {
        final t = _filterStartTime ?? const TimeOfDay(hour: 0, minute: 0);
        startRange = DateTime(
          _filterStartDate!.year,
          _filterStartDate!.month,
          _filterStartDate!.day,
          t.hour,
          t.minute,
          0,
        );
      }
      if (_filterEndDate != null) {
        final t = _filterEndTime ?? const TimeOfDay(hour: 23, minute: 59);
        endRange = DateTime(
          _filterEndDate!.year,
          _filterEndDate!.month,
          _filterEndDate!.day,
          t.hour,
          t.minute,
          59,
        );
      }
    }

    var filtered = allReadings;
    if (startRange != null || endRange != null) {
      filtered = allReadings.where((r) {
        final dt = r.parsedDateTime;
        if (dt == null) return false;
        if (startRange != null && dt.isBefore(startRange)) return false;
        if (endRange != null && dt.isAfter(endRange)) return false;
        return true;
      }).toList();
    }

    // Limit to the chosen point limit (default 20)
    return filtered.take(_pointLimit).toList();
  }

  Future<void> _selectDateTimeRange(bool isStart) async {
    final now = DateTime.now();
    final initialDate = isStart
        ? (_filterStartDate ?? now)
        : (_filterEndDate ?? now);

    final pickedDate = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2025, 1, 1),
      lastDate: DateTime(2030, 12, 31),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppColors.navyPrimary,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: AppColors.textPrimary,
            ),
          ),
          child: child!,
        );
      },
    );

    if (pickedDate != null && mounted) {
      final initialTime = isStart
          ? (_filterStartTime ?? const TimeOfDay(hour: 0, minute: 0))
          : (_filterEndTime ?? TimeOfDay(hour: now.hour, minute: now.minute));

      final pickedTime = await showTimePicker(
        context: context,
        initialTime: initialTime,
        builder: (context, child) {
          return Theme(
            data: Theme.of(context).copyWith(
              colorScheme: const ColorScheme.light(
                primary: AppColors.navyPrimary,
                onPrimary: Colors.white,
                surface: Colors.white,
                onSurface: AppColors.textPrimary,
              ),
            ),
            child: child!,
          );
        },
      );

      if (pickedTime != null && mounted) {
        setState(() {
          _activePreset = 'Custom';
          _isFilterExpanded = true;
          if (isStart) {
            _filterStartDate = pickedDate;
            _filterStartTime = pickedTime;
          } else {
            _filterEndDate = pickedDate;
            _filterEndTime = pickedTime;
          }
        });
      }
    }
  }

  void _applyFilterSearch(IotProvider iotProvider) {
    if (_pointLimit > iotProvider.historyLimit) {
      iotProvider.setHistoryLimit(_pointLimit);
    }
    setState(() {
      _isFilterExpanded = false;
    });
  }

  void _resetFilter(IotProvider iotProvider) {
    setState(() {
      _activePreset = 'All';
      _pointLimit = 20;
      final now = DateTime.now();
      _filterStartDate = DateTime(now.year, now.month, now.day, 0, 0);
      _filterStartTime = const TimeOfDay(hour: 0, minute: 0);
      _filterEndDate = now;
      _filterEndTime = TimeOfDay(hour: now.hour, minute: now.minute);
      _isFilterExpanded = false;
    });
    if (iotProvider.historyLimit != 20) {
      iotProvider.setHistoryLimit(20);
    }
  }

  @override
  Widget build(BuildContext context) {
    final iotProvider = context.watch<IotProvider>();
    final allReadings = iotProvider.historyReadings;
    final isLoading = iotProvider.isLoadingHistory;
    final error = iotProvider.historyError;

    if (isLoading && allReadings.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: AppColors.aquaPrimary),
            SizedBox(height: 16),
            Text(
              'Fetching historical telemetry from Firebase...',
              style: TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }

    if (error != null && allReadings.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 48,
                color: AppColors.statusDanger,
              ),
              const SizedBox(height: 12),
              const Text(
                'Historical Data Unavailable',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.navyDark,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                error,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => iotProvider.refreshHistory(),
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final filteredReadings = _getFilteredReadings(allReadings);

    return RefreshIndicator(
      onRefresh: () => iotProvider.refreshHistory(limit: _pointLimit),
      color: AppColors.aquaPrimary,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. Date-Time Filter & Search Card
            _buildDateTimeFilterCard(
              iotProvider,
              allReadings.length,
              filteredReadings.length,
            ),
            const SizedBox(height: 14),

            // 2. Metric selector pills
            _buildMetricSelector(),
            const SizedBox(height: 16),

            // 3. Dynamic Time series Chart Card (Filtered to selected range & TDS fixed)
            _buildChartCard(filteredReadings),
            const SizedBox(height: 20),

            // 4. Filtered Logs Table
            _buildRecentLogsSection(filteredReadings, allReadings.length),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildDateTimeFilterCard(
    IotProvider iotProvider,
    int totalCount,
    int filteredCount,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.navyDark.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: AppColors.navyDark.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Bar with Expand/Collapse
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              setState(() {
                if (_activePreset != 'Custom') {
                  _activePreset = 'Custom';
                  _isFilterExpanded = true;
                } else {
                  _isFilterExpanded = !_isFilterExpanded;
                }
              });
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.navyPrimary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.tune_rounded,
                      size: 18,
                      color: AppColors.navyPrimary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Date & Time Filter',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.navyDark,
                          ),
                        ),
                        Text(
                          _activePreset == 'All'
                              ? 'Default: Most Recent $_pointLimit Points'
                              : 'Filter: $_activePreset ($filteredCount of $totalCount)',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusBadge(
                    label: '$_pointLimit PTS',
                    type: BadgeStatusType.info,
                  ),
                  const SizedBox(width: 6),
                  Icon(
                    (_activePreset == 'Custom' && _isFilterExpanded)
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: AppColors.textMuted,
                  ),
                ],
              ),
            ),
          ),

          // Preset Chips Row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildPresetChip('All', 'Recent 20'),
                  const SizedBox(width: 8),
                  _buildPresetChip('Today', 'Today'),
                  const SizedBox(width: 8),
                  _buildPresetChip('Last 24h', 'Last 24h'),
                  const SizedBox(width: 8),
                  _buildPresetChip('Custom', 'Custom Range'),
                ],
              ),
            ),
          ),

          // Expandable Detailed Search Form
          if (_activePreset == 'Custom' && _isFilterExpanded) ...[
            const Divider(height: 16),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Select Range & Points Limit:',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Start and End DateTime Pickers
                  Row(
                    children: [
                      Expanded(
                        child: _buildDateTimeButton(
                          label: 'From (Start)',
                          date: _filterStartDate,
                          time: _filterStartTime,
                          onTap: () => _selectDateTimeRange(true),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _buildDateTimeButton(
                          label: 'To (End)',
                          date: _filterEndDate,
                          time: _filterEndTime,
                          onTap: () => _selectDateTimeRange(false),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Limit Selector (Default 20)
                  Row(
                    children: [
                      const Text(
                        'Points Limit:',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 10),
                      ...[20, 50, 100].map((limit) {
                        final isSelected = _pointLimit == limit;
                        return Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: InkWell(
                            onTap: () {
                              setState(() {
                                _pointLimit = limit;
                              });
                            },
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.navyPrimary
                                    : AppColors.surfaceVariant,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '$limit pts',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: isSelected
                                      ? Colors.white
                                      : AppColors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Search Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _applyFilterSearch(iotProvider),
                          icon: const Icon(Icons.search, size: 16),
                          label: const Text('Search & Apply Filter'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.navyPrimary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => _resetFilter(iotProvider),
                        icon: const Icon(Icons.restart_alt, size: 16),
                        label: const Text('Reset'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.textSecondary,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPresetChip(String key, String label) {
    final isSelected = _activePreset == key;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      selectedColor: AppColors.navyPrimary,
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : AppColors.textPrimary,
        fontWeight: FontWeight.w600,
        fontSize: 11,
      ),
      backgroundColor: AppColors.surfaceVariant,
      side: BorderSide.none,
      onSelected: (_) {
        setState(() {
          if (_activePreset == key && key == 'Custom') {
            _isFilterExpanded = !_isFilterExpanded;
          } else {
            _activePreset = key;
            _isFilterExpanded = (key == 'Custom');
          }
        });
      },
    );
  }

  Widget _buildDateTimeButton({
    required String label,
    required DateTime? date,
    required TimeOfDay? time,
    required VoidCallback onTap,
  }) {
    String formatted = 'Select Date & Time';
    if (date != null) {
      final t = time ?? const TimeOfDay(hour: 0, minute: 0);
      final combined = DateTime(
        date.year,
        date.month,
        date.day,
        t.hour,
        t.minute,
      );
      formatted = _displayDateFormat.format(combined);
    }

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: AppColors.navyDark.withValues(alpha: 0.1),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                const Icon(
                  Icons.calendar_today,
                  size: 13,
                  color: AppColors.aquaDark,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    formatted,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricSelector() {
    final metrics = [
      {'key': 'ph', 'label': 'pH', 'unit': 'pH'},
      {'key': 'turbidity', 'label': 'Turbidity', 'unit': '%'},
      {'key': 'water_temp', 'label': 'Temp', 'unit': '°C'},
      {'key': 'tds', 'label': 'TDS', 'unit': 'ppm'},
    ];

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: metrics.map((m) {
          final isSelected = _selectedMetric == m['key'];
          return Expanded(
            child: InkWell(
              onTap: () {
                setState(() {
                  _selectedMetric = m['key']!;
                });
              },
              borderRadius: BorderRadius.circular(10),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 8),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.navyPrimary : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: AppColors.navyDark.withValues(alpha: 0.15),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      m['label']!,
                      style: TextStyle(
                        color: isSelected ? Colors.white : AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      m['unit']!,
                      style: TextStyle(
                        color: isSelected
                            ? AppColors.aquaLight
                            : AppColors.textMuted,
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildChartCard(List<HistoryReading> readings) {
    // Reverse so chart renders chronologically (oldest -> newest)
    final chronological = readings.reversed.toList();
    final spots = <FlSpot>[];

    for (int i = 0; i < chronological.length; i++) {
      final r = chronological[i];
      double? val;
      switch (_selectedMetric) {
        case 'ph':
          val = r.ph;
          break;
        case 'turbidity':
          val = r.turbidityPct;
          break;
        case 'water_temp':
          val = r.waterTempC;
          break;
        case 'tds':
          val = r.tdsPpm;
          break;
      }
      if (val != null) {
        spots.add(FlSpot(i.toDouble(), val));
      }
    }

    String metricName;
    String unit;
    Color lineColor;
    switch (_selectedMetric) {
      case 'ph':
        metricName = 'pH Level';
        unit = 'pH';
        lineColor = AppColors.aquaPrimary;
        break;
      case 'turbidity':
        metricName = 'Turbidity';
        unit = '%';
        lineColor = Colors.deepOrangeAccent;
        break;
      case 'water_temp':
        metricName = 'Water Temperature';
        unit = '°C';
        lineColor = Colors.teal;
        break;
      case 'tds':
      default:
        metricName = 'TDS Mineral';
        unit = 'ppm';
        lineColor = Colors.indigo;
        break;
    }

    // SAFE Y-AXIS BOUNDS CALCULATION (Fixes TDS and Constant values Pixel Outbound)
    double calculatedMinY = 0.0;
    double calculatedMaxY = 100.0;
    double yInterval = 25.0;

    if (spots.isNotEmpty) {
      final yValues = spots.map((s) => s.y).toList();
      final actualMin = yValues.reduce((a, b) => a < b ? a : b);
      final actualMax = yValues.reduce((a, b) => a > b ? a : b);

      if ((actualMax - actualMin).abs() < 0.001) {
        // When all points have the identical value (e.g. TDS = 0, or constant sensor)
        if (_selectedMetric == 'tds') {
          calculatedMinY = 0.0;
          calculatedMaxY = actualMax == 0 ? 100.0 : (actualMax * 1.5);
          yInterval = ((calculatedMaxY - calculatedMinY) / 4).clamp(10.0, 500.0);
        } else if (_selectedMetric == 'ph') {
          calculatedMinY = (actualMin - 1.0).clamp(0.0, 14.0);
          calculatedMaxY = (actualMax + 1.0).clamp(0.0, 14.0);
          yInterval = 1.0;
        } else {
          calculatedMinY = (actualMin - 2.0).clamp(0.0, 100.0);
          calculatedMaxY = actualMax + 2.0;
          yInterval = 1.0;
        }
      } else {
        // Dynamic range with 15% headroom
        final padding = (actualMax - actualMin) * 0.15;
        calculatedMinY = (actualMin - padding).clamp(0.0, double.infinity);
        calculatedMaxY = actualMax + padding;
        yInterval = ((calculatedMaxY - calculatedMinY) / 4).clamp(0.5, double.infinity);
      }
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.navyDark.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: AppColors.navyDark.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  '$metricName Trend ($unit)',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navyDark,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${spots.length} Pts in Range',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          if (spots.isEmpty)
            const SizedBox(
              height: 180,
              child: Center(
                child: Text(
                  'No measurements found for the selected date-time filter.',
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ),
            )
          else
            SizedBox(
              height: 190,
              child: LineChart(
                LineChartData(
                  // PREVENTS PIXEL OUTBOUND: FlClipData.all clips everything strictly within chart boundaries
                  clipData: const FlClipData.all(),
                  minX: 0,
                  maxX: spots.length > 1 ? (spots.length - 1).toDouble() : 1.0,
                  minY: calculatedMinY,
                  maxY: calculatedMaxY,
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: yInterval,
                    getDrawingHorizontalLine: (value) => FlLine(
                      color: AppColors.navyDark.withValues(alpha: 0.06),
                      strokeWidth: 1,
                    ),
                  ),
                  titlesData: FlTitlesData(
                    show: true,
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 48, // Generous space so 3-4 digit TDS values don't overflow
                        interval: yInterval,
                        getTitlesWidget: (val, meta) {
                          if (val < calculatedMinY || val > calculatedMaxY) {
                            return const SizedBox.shrink();
                          }
                          final String formatted;
                          if (_selectedMetric == 'tds') {
                            formatted = val >= 1000
                                ? '${(val / 1000).toStringAsFixed(1)}k'
                                : val.toInt().toString();
                          } else {
                            formatted = val.toStringAsFixed(1);
                          }
                          return SideTitleWidget(
                            meta: meta,
                            space: 6,
                            child: Text(
                              formatted,
                              style: const TextStyle(
                                color: AppColors.textMuted,
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 26,
                        getTitlesWidget: (val, meta) {
                          final idx = val.toInt();
                          if (idx >= 0 && idx < chronological.length) {
                            // Show at most 4-5 labels along x-axis to prevent text collisions
                            final step = (chronological.length / 4).ceil().clamp(1, 100);
                            if (idx % step == 0 || idx == chronological.length - 1) {
                              final time = chronological[idx].timestamp;
                              if (time != null && time.length >= 16) {
                                final label = time.length >= 19
                                    ? time.substring(11, 16)
                                    : time;
                                return SideTitleWidget(
                                  meta: meta,
                                  space: 4,
                                  child: Text(
                                    label,
                                    style: const TextStyle(
                                      color: AppColors.textMuted,
                                      fontSize: 9,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                );
                              }
                            }
                          }
                          return const SizedBox.shrink();
                        },
                      ),
                    ),
                  ),
                  borderData: FlBorderData(
                    show: true,
                    border: Border(
                      bottom: BorderSide(
                        color: AppColors.navyDark.withValues(alpha: 0.1),
                      ),
                      left: BorderSide(
                        color: AppColors.navyDark.withValues(alpha: 0.1),
                      ),
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: spots.length > 2,
                      curveSmoothness: 0.2, // Gentle smoothness avoids bezier tangent spikes
                      preventCurveOverShooting: true, // PREVENTS TDS BEZIER OVERSHOOT OUTBOUND
                      color: lineColor,
                      barWidth: 2.5,
                      isStrokeCapRound: true,
                      dotData: FlDotData(
                        show: spots.length <= 20,
                        getDotPainter: (spot, percent, barData, index) =>
                            FlDotCirclePainter(
                              radius: 3.5,
                              color: Colors.white,
                              strokeWidth: 2,
                              strokeColor: lineColor,
                            ),
                      ),
                      belowBarData: BarAreaData(
                        show: true,
                        color: lineColor.withValues(alpha: 0.12),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildRecentLogsSection(
    List<HistoryReading> readings,
    int totalCount,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Historical Reading Logs',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.navyDark,
              ),
            ),
            Text(
              'Showing ${readings.length} of $totalCount',
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (readings.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text(
              'No readings match the chosen filter.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: readings.length,
            separatorBuilder: (_, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final r = readings[index];
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.navyDark.withValues(alpha: 0.08),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.access_time,
                              size: 14,
                              color: AppColors.textMuted,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              r.timestamp ?? r.key,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ],
                        ),
                        StatusBadge(
                          label: '${r.hops} Hop(s)',
                          type: r.hops == 0
                              ? BadgeStatusType.fresh
                              : BadgeStatusType.info,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _buildMiniParam(
                          'pH',
                          Formatters.formatDecimal(r.ph, precision: 2),
                        ),
                        _buildMiniParam(
                          'Turbidity',
                          '${Formatters.formatDecimal(r.turbidityPct, precision: 1)}%',
                        ),
                        _buildMiniParam(
                          'Temp',
                          '${Formatters.formatDecimal(r.waterTempC, precision: 1)}°C',
                        ),
                        _buildMiniParam(
                          'TDS',
                          Formatters.formatDecimal(r.tdsPpm, precision: 0),
                        ),
                        _buildMiniParam(
                          'RSSI',
                          '${Formatters.formatDecimal(r.rssi, precision: 0)} dBm',
                        ),
                      ],
                    ),
                    if (r.route != null && r.route!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Route: ${r.route}',
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _buildMiniParam(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: AppColors.navyDark,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
        ),
      ],
    );
  }
}

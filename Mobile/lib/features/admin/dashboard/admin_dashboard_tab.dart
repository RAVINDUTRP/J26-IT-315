import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/boat_map_card.dart';
import '../../../core/widgets/metric_card.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/iot_provider.dart';

/// Admin Dashboard Tab displaying real-time water quality metrics and boat telemetry.
class AdminDashboardTab extends StatelessWidget {
  const AdminDashboardTab({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AppAuthProvider>();
    final iotProvider = context.watch<IotProvider>();

    final live = iotProvider.liveData;
    final status = iotProvider.deviceStatus;
    final isConnected = iotProvider.isFirebaseConnected;

    return RefreshIndicator(
      onRefresh: () async {
        await iotProvider.refreshHistory();
      },
      color: AppColors.aquaPrimary,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. Dashboard Header Card
            _buildHeaderCard(
              context,
              authProvider,
              isConnected,
              live?.calculatedAgeSeconds,
              live?.timestamp,
            ),
            const SizedBox(height: 16),

            // 2. Loading, Error, or Telemetry Content
            if (iotProvider.isLoadingLiveData && live == null) ...[
              _buildLoadingState(),
            ] else if (iotProvider.liveDataError != null && live == null) ...[
              _buildErrorState(iotProvider.liveDataError!),
            ] else if (live == null) ...[
              _buildEmptyState(),
            ] else ...[
              // Primary Water Quality Metrics
              _buildSectionTitle('Live Water Parameters', Icons.water_drop),
              const SizedBox(height: 10),
              _buildWaterMetricsGrid(live),
              const SizedBox(height: 20),

              // LoRa Mesh Link & Boat Status
              _buildSectionTitle(
                'LoRa Mesh & Boat Telemetry',
                Icons.hub_outlined,
              ),
              const SizedBox(height: 10),
              _buildMeshAndBoatCard(live, status),
              const SizedBox(height: 20),

              // Navigation & Position Card
              _buildSectionTitle(
                'Navigation & Deployment Position',
                Icons.navigation_outlined,
              ),
              const SizedBox(height: 10),
              _buildNavigationCard(live),
              const SizedBox(height: 16),

              // Configurable Thresholds Disclaimer
              _buildDisclaimerCard(),
              const SizedBox(height: 20),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderCard(
    BuildContext context,
    AppAuthProvider auth,
    bool isConnected,
    int? dataAgeSec,
    String? timestamp,
  ) {
    final adminName = auth.userProfile?.fullName ?? 'Administrator';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: AppColors.cardHeaderGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.navyDark.withValues(alpha: 0.15),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Image.asset(
                      AppConstants.logoPath,
                      fit: BoxFit.contain,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        AppConstants.appName,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: -0.2,
                        ),
                      ),
                      Text(
                        'Water Monitoring Dashboard',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.aquaLight.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              // Firebase RTDB connection pill
              StatusBadge(
                label: isConnected ? 'RTDB LIVE' : 'CONNECTING',
                type: isConnected
                    ? BadgeStatusType.online
                    : BadgeStatusType.warning,
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(color: Colors.white12, height: 1),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Welcome, $adminName',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    timestamp != null
                        ? 'Updated: $timestamp'
                        : 'Awaiting telemetry broadcast...',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.aquaLight.withValues(alpha: 0.75),
                    ),
                  ),
                ],
              ),
              if (dataAgeSec != null)
                StatusBadge(
                  label: Formatters.formatDataAge(dataAgeSec),
                  type: dataAgeSec < 60
                      ? BadgeStatusType.fresh
                      : (dataAgeSec < 180
                            ? BadgeStatusType.warning
                            : BadgeStatusType.stale),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.navyPrimary),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.navyDark,
            letterSpacing: -0.2,
          ),
        ),
      ],
    );
  }

  Widget _buildWaterMetricsGrid(dynamic live) {
    final water = live.water;

    // Safe threshold evaluations for demo presentation
    // Configurable assumptions pending domain validation
    String phStatus = 'Unknown';
    BadgeStatusType phType = BadgeStatusType.info;
    if (water.ph != null) {
      if (water.ph! < AppConstants.phMinNormal) {
        phStatus = 'Acidic';
        phType = BadgeStatusType.warning;
      } else if (water.ph! > AppConstants.phMaxNormal) {
        phStatus = 'Alkaline';
        phType = BadgeStatusType.warning;
      } else {
        phStatus = 'Optimal';
        phType = BadgeStatusType.online;
      }
    }

    String turbStatus = 'Normal';
    BadgeStatusType turbType = BadgeStatusType.online;
    if (water.turbidityPct != null &&
        water.turbidityPct! > AppConstants.turbidityMaxNormal) {
      turbStatus = 'Turbid';
      turbType = BadgeStatusType.warning;
    }

    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.05,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        MetricCard(
          title: 'pH Value',
          value: Formatters.formatDecimal(water.ph),
          unit: 'pH',
          icon: Icons.science,
          accentColor: AppColors.aquaPrimary,
          statusLabel: phStatus,
          statusType: phType,
          subtitle: 'Baseline 6.5 - 8.5',
        ),
        MetricCard(
          title: 'Turbidity',
          value: Formatters.formatDecimal(water.turbidityPct, precision: 1),
          unit: '%',
          icon: Icons.opacity,
          accentColor: Colors.deepOrangeAccent,
          statusLabel: turbStatus,
          statusType: turbType,
          subtitle: 'Optical sensor',
        ),
        MetricCard(
          title: 'Water Temp',
          value: Formatters.formatDecimal(water.temperatureC, precision: 1),
          unit: '°C',
          icon: Icons.thermostat,
          accentColor: Colors.teal,
          statusLabel: 'Submersible',
          statusType: BadgeStatusType.info,
          subtitle: 'Sub-surface probe',
        ),
        MetricCard(
          title: 'TDS Mineral',
          value: Formatters.formatDecimal(water.tdsPpm, precision: 0),
          unit: 'ppm',
          icon: Icons.grain,
          accentColor: Colors.indigo,
          statusLabel: 'Normal',
          statusType: BadgeStatusType.online,
          subtitle: 'Conductivity probe',
        ),
      ],
    );
  }

  Widget _buildMeshAndBoatCard(dynamic live, dynamic status) {
    final mesh = live.meshLink;
    final boat = status?.boat001;
    final gateway = status?.gateway;

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
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.aquaPrimary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.router_outlined,
                      size: 18,
                      color: AppColors.aquaDark,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'Node BOAT_001',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navyDark,
                    ),
                  ),
                ],
              ),
              StatusBadge(
                label: boat?.status.toUpperCase() ?? 'ONLINE',
                type: (boat?.isOnline ?? true)
                    ? BadgeStatusType.online
                    : BadgeStatusType.offline,
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildTelemetryParam(
                'RSSI',
                '${Formatters.formatDecimal(mesh.rssi, precision: 0)} dBm',
              ),
              _buildTelemetryParam(
                'SNR',
                '${Formatters.formatDecimal(mesh.snr, precision: 1)} dB',
              ),
              _buildTelemetryParam('Hops', '${mesh.hops} Hop(s)'),
              _buildTelemetryParam(
                'Packets',
                '${boat?.packetCount ?? mesh.sequenceId ?? 0}',
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surfaceVariant,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.route,
                  size: 16,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Route: ${mesh.fullRoute ?? "[BOAT_001 -> GATEWAY]"}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          if (gateway != null) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Base Gateway: ${gateway.wifiIp.isNotEmpty ? gateway.wifiIp : "Connected"} (Heap: ${gateway.freeHeapKb} KB)',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
                Text(
                  'Wi-Fi: ${gateway.wifiRssi} dBm',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildNavigationCard(dynamic live) {
    final nav = live.navigation;
    final att = live.attitude;

    return Column(
      children: [
        BoatMapCard(
          latitude: nav.latitude,
          longitude: nav.longitude,
          gpsValid: nav.gpsValid,
          satellites: nav.satellites,
          speedKmh: nav.speedKmh,
          altitudeM: nav.altitudeM,
        ),
        const SizedBox(height: 12),
        // Boat Attitude & Motion Telemetry (Pitch, Roll, Accel-Z)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
              const Row(
                children: [
                  Icon(
                    Icons.screen_rotation_outlined,
                    size: 16,
                    color: AppColors.navyPrimary,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Boat Attitude & Kinematics',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navyDark,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildTelemetryParam(
                    'Pitch',
                    '${Formatters.formatDecimal(att.pitchDeg, precision: 1)}°',
                  ),
                  _buildTelemetryParam(
                    'Roll',
                    '${Formatters.formatDecimal(att.rollDeg, precision: 1)}°',
                  ),
                  _buildTelemetryParam(
                    'Accel-Z',
                    '${Formatters.formatDecimal(att.accelZG, precision: 2)} g',
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTelemetryParam(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
        ),
      ],
    );
  }

  Widget _buildDisclaimerCard() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.navyPrimary.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.navyPrimary.withValues(alpha: 0.1)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: AppColors.textSecondary),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Research note: Status classifications (e.g. Acidic / Optimal) are configurable demonstration thresholds pending formal scientific domain validation.',
              style: TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingState() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Column(
          children: [
            CircularProgressIndicator(color: AppColors.aquaPrimary),
            SizedBox(height: 16),
            Text(
              'Loading live IoT data from Firebase...',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(String error) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.statusDanger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.statusDanger.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.error_outline,
            size: 40,
            color: AppColors.statusDanger,
          ),
          const SizedBox(height: 10),
          const Text(
            'Unable to Read IoT Telemetry',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.statusDanger,
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
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.navyDark.withValues(alpha: 0.08)),
      ),
      child: const Column(
        children: [
          Icon(
            Icons.sensors_off_outlined,
            size: 48,
            color: AppColors.textMuted,
          ),
          SizedBox(height: 12),
          Text(
            'No Active Telemetry Stream',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.navyDark,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Waiting for LoRa boat or base station gateway to publish records to /live_data.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

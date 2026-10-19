import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../providers/iot_provider.dart';

/// Live Monitoring Tab displaying comprehensive real-time telemetry breakdowns.
class LiveMonitoringTab extends StatelessWidget {
  const LiveMonitoringTab({super.key});

  @override
  Widget build(BuildContext context) {
    final iotProvider = context.watch<IotProvider>();
    final live = iotProvider.liveData;
    final status = iotProvider.deviceStatus;

    if (live == null) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: AppColors.aquaPrimary),
            SizedBox(height: 16),
            Text(
              'Listening for live telemetry streams...',
              style: TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Environmental Telemetry Card
          _buildCategoryCard(
            title: 'Ambient & Meteorological',
            icon: Icons.cloud_outlined,
            children: [
              _buildDataRow(
                'Ambient Air Temperature',
                '${Formatters.formatDecimal(live.environment.temperatureC, precision: 1)} °C',
                'Calibrated thermistor',
                Icons.thermostat_outlined,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Relative Humidity',
                '${Formatters.formatDecimal(live.environment.humidityPct, precision: 1)} %',
                'Hygrometer sensor',
                Icons.water_drop_outlined,
              ),
            ],
          ),
          const SizedBox(height: 14),

          // 2. Sub-surface Water Parameters Card
          _buildCategoryCard(
            title: 'Sub-surface Water Probe Suite',
            icon: Icons.science_outlined,
            children: [
              _buildDataRow(
                'Potential Hydrogen (pH)',
                '${Formatters.formatDecimal(live.water.ph, precision: 2)} pH',
                'Glass electrode analog probe',
                Icons.biotech_outlined,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Water Turbidity',
                '${Formatters.formatDecimal(live.water.turbidityPct, precision: 1)} %',
                'Infrared optical scattering',
                Icons.opacity_outlined,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Submersible Temperature',
                '${Formatters.formatDecimal(live.water.temperatureC, precision: 1)} °C',
                'DS18B20 waterproof probe',
                Icons.device_thermostat_outlined,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Total Dissolved Solids (TDS)',
                '${Formatters.formatDecimal(live.water.tdsPpm, precision: 0)} ppm',
                'Electrical conductivity sensor',
                Icons.grain_outlined,
              ),
            ],
          ),
          const SizedBox(height: 14),

          // 3. LoRa Mesh Link Health Card
          _buildCategoryCard(
            title: 'LoRa Mesh Transmission Link',
            icon: Icons.cell_tower_outlined,
            trailingBadge: StatusBadge(
              label: '${live.meshLink.hops} Hop(s)',
              type: live.meshLink.hops == 0
                  ? BadgeStatusType.fresh
                  : BadgeStatusType.info,
            ),
            children: [
              _buildDataRow(
                'Source Device',
                live.meshLink.sourceId ?? 'BOAT_001',
                'Transmitter node ID',
                Icons.fingerprint,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Last Forwarder',
                live.meshLink.lastForwarder ?? 'Direct',
                'Routing relay',
                Icons.alt_route,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Signal Strength (RSSI)',
                '${Formatters.formatDecimal(live.meshLink.rssi, precision: 0)} dBm',
                'Received signal strength',
                Icons.signal_cellular_alt,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Signal-to-Noise Ratio (SNR)',
                '${Formatters.formatDecimal(live.meshLink.snr, precision: 1)} dB',
                'RF channel quality',
                Icons.graphic_eq,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Mesh Route',
                live.meshLink.fullRoute ?? '[DIRECT]',
                'Multi-hop path string',
                Icons.route_outlined,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Sequence ID',
                '#${live.meshLink.sequenceId ?? "---"}',
                'LoRa packet sequence counter',
                Icons.numbers,
              ),
            ],
          ),
          const SizedBox(height: 14),

          // 4. Mesh Fleet Nodes Overview Card
          if (status != null) ...[
            _buildCategoryCard(
              title: 'Mesh Network Fleet Status',
              icon: Icons.hub_outlined,
              children: status.allMeshNodes.map((node) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(
                            node.nodeName.contains('boat')
                                ? Icons.directions_boat_outlined
                                : Icons.repeat,
                            size: 18,
                            color: AppColors.navyPrimary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            node.nodeName.toUpperCase(),
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                      Row(
                        children: [
                          Text(
                            'Seen: ${Formatters.formatDataAge(node.lastSeenSec)}',
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textMuted,
                            ),
                          ),
                          const SizedBox(width: 8),
                          StatusBadge(
                            label: node.status.toUpperCase(),
                            type: node.isOnline
                                ? BadgeStatusType.online
                                : BadgeStatusType.offline,
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 14),
          ],

          // 5. Kinematics & Attitude
          _buildCategoryCard(
            title: 'Vessel Stability & Dynamics',
            icon: Icons.explore_outlined,
            children: [
              _buildDataRow(
                'Pitch Tilt Angle',
                '${Formatters.formatDecimal(live.attitude.pitchDeg, precision: 1)}°',
                'Longitudinal axis inclination',
                Icons.screen_rotation_outlined,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Roll Tilt Angle',
                '${Formatters.formatDecimal(live.attitude.rollDeg, precision: 1)}°',
                'Lateral axis inclination',
                Icons.swap_horiz,
              ),
              const Divider(height: 16),
              _buildDataRow(
                'Vertical Acceleration (Z)',
                '${Formatters.formatDecimal(live.attitude.accelZG, precision: 2)} g',
                'Buoyancy wave impact',
                Icons.height,
              ),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildCategoryCard({
    required String title,
    required IconData icon,
    Widget? trailingBadge,
    required List<Widget> children,
  }) {
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
              Row(
                children: [
                  Icon(icon, size: 18, color: AppColors.navyPrimary),
                  const SizedBox(width: 8),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navyDark,
                    ),
                  ),
                ],
              ),
              ?trailingBadge,
            ],
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _buildDataRow(
    String label,
    String value,
    String subtitle,
    IconData icon,
  ) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: AppColors.surfaceVariant,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 16, color: AppColors.textSecondary),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.navyDark,
          ),
        ),
      ],
    );
  }
}

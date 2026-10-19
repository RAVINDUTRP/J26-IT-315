import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

enum BadgeStatusType { online, offline, warning, danger, stale, fresh, info }

/// Compact status chip/badge with dot indicator for real-time telemetry states.
class StatusBadge extends StatelessWidget {
  final String label;
  final BadgeStatusType type;
  final bool showDot;

  const StatusBadge({
    super.key,
    required this.label,
    required this.type,
    this.showDot = true,
  });

  Color get _color {
    switch (type) {
      case BadgeStatusType.online:
      case BadgeStatusType.fresh:
        return AppColors.statusOnline;
      case BadgeStatusType.warning:
        return AppColors.statusWarning;
      case BadgeStatusType.danger:
        return AppColors.statusDanger;
      case BadgeStatusType.offline:
        return AppColors.statusOffline;
      case BadgeStatusType.stale:
        return AppColors.statusStale;
      case BadgeStatusType.info:
        return AppColors.aquaDark;
    }
  }

  @override
  Widget build(BuildContext context) {
    final baseColor = _color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: baseColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: baseColor.withValues(alpha: 0.35), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: baseColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              color: baseColor,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

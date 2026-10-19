import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/custom_button.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../providers/auth_provider.dart';
import '../../../routing/app_routes.dart';

/// Basic landing screen for authenticated standard USER accounts (Field Researchers).
/// Strictly isolated from Admin IoT dashboard and configurations.
class UserHomeScreen extends StatelessWidget {
  const UserHomeScreen({super.key});

  Future<void> _handleLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.statusDanger,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      await context.read<AppAuthProvider>().signOut();
      if (context.mounted) {
        Navigator.of(
          context,
        ).pushNamedAndRemoveUntil(AppRoutes.login, (route) => false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AppAuthProvider>();
    final profile = authProvider.userProfile;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppColors.navyDark.withValues(alpha: 0.1),
                ),
              ),
              child: Image.asset(AppConstants.logoPath, fit: BoxFit.contain),
            ),
            const SizedBox(width: 10),
            const Text(
              AppConstants.appName,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.navyDark,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Sign Out',
            icon: const Icon(
              Icons.logout,
              size: 20,
              color: AppColors.textSecondary,
            ),
            onPressed: () => _handleLogout(context),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            children: [
              // Welcome Card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: AppColors.navyGradient,
                  borderRadius: BorderRadius.circular(24),
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
                    const StatusBadge(
                      label: 'ROLE: FIELD RESEARCHER',
                      type: BadgeStatusType.info,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Welcome, ${profile?.fullName ?? "Researcher"}',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      profile?.email ?? authProvider.currentUser?.email ?? '',
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.aquaLight,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Notice Card: Features in development
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppColors.navyDark.withValues(alpha: 0.08),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.navyDark.withValues(alpha: 0.04),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.aquaPrimary.withValues(alpha: 0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.construction_outlined,
                        size: 36,
                        color: AppColors.aquaDark,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Field User Portal in Development',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.navyDark,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Additional user-tier features such as public water quality alerts, regional incident reporting, and localized advisory services are not yet implemented in this research phase.\n\nPrivileged real-time LoRa boat telemetry and sensor dashboard are restricted to verified administrators.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Profile Details
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: AppColors.navyDark.withValues(alpha: 0.08),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Your Profile Details',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.navyDark,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildRow('Full Name', profile?.fullName ?? 'N/A'),
                    const Divider(height: 16),
                    _buildRow('Email', profile?.email ?? 'N/A'),
                    if (profile?.contactNumber != null &&
                        profile!.contactNumber!.isNotEmpty) ...[
                      const Divider(height: 16),
                      _buildRow('Contact', profile.contactNumber!),
                    ],
                    const Divider(height: 16),
                    _buildRow('UID', profile?.uid ?? 'N/A'),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              CustomButton(
                text: 'Sign Out',
                backgroundColor: AppColors.navyPrimary,
                icon: Icons.logout,
                onPressed: () => _handleLogout(context),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
        Flexible(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

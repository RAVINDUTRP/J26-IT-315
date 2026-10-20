import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/custom_button.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../providers/auth_provider.dart';
import '../../../routing/app_routes.dart';

/// Admin profile & settings tab displaying verified role, account details, and logout.
class AdminProfileTab extends StatelessWidget {
  const AdminProfileTab({super.key});

  Future<void> _handleLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Sign Out'),
        content: const Text(
          'Are you sure you want to end your administrative session?',
        ),
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
    final role = authProvider.userRole;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        children: [
          // User Card
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
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppColors.navyPrimary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.admin_panel_settings,
                      size: 40,
                      color: AppColors.navyPrimary,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  profile?.fullName ?? 'Administrator',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navyDark,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  profile?.email ??
                      authProvider.currentUser?.email ??
                      'admin@gmail.com',
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 12),
                StatusBadge(
                  label: 'ROLE: ${role.displayName.toUpperCase()}',
                  type: BadgeStatusType.online,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Account Information Card
          Container(
            padding: const EdgeInsets.all(16),
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
                  'Account Credentials & Node Details',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navyDark,
                  ),
                ),
                const SizedBox(height: 12),
                _buildInfoItem(
                  'User ID (UID)',
                  profile?.uid ?? authProvider.currentUser?.uid ?? 'N/A',
                  Icons.vpn_key_outlined,
                ),
                const Divider(height: 16),
                _buildInfoItem(
                  'Firebase Project',
                  'boat-research-e08fb',
                  Icons.cloud_done_outlined,
                ),
                const Divider(height: 16),
                _buildInfoItem(
                  'RTDB Endpoint',
                  'boat-research-e08fb-default-rtdb',
                  Icons.storage_outlined,
                ),
                const Divider(height: 16),
                _buildInfoItem(
                  'Application Release',
                  AppConstants.appVersion,
                  Icons.info_outline,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Security Protocol Notice
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.navyPrimary.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppColors.navyPrimary.withValues(alpha: 0.08),
              ),
            ),
            child: const Row(
              children: [
                Icon(Icons.security, size: 20, color: AppColors.navyPrimary),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Administrator permissions are authenticated through Firebase Custom Claims and enforced by Realtime Database rules.',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Sign Out Button
          CustomButton(
            text: 'Sign Out Session',
            backgroundColor: AppColors.statusDanger,
            icon: Icons.logout,
            onPressed: () => _handleLogout(context),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildInfoItem(String label, String value, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.textSecondary),
        const SizedBox(width: 10),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.textSecondary,
          ),
        ),
        const Spacer(),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.navyDark,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

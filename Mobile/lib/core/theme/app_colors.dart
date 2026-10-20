import 'package:flutter/material.dart';

/// Centralized color palette for AquaShield.
/// Designed for a professional water monitoring & disaster resilience aesthetic.
class AppColors {
  AppColors._();

  // Primary palette - Deep Navy & Water Aquas
  static const Color navyDark = Color(0xFF08172E);
  static const Color navyPrimary = Color(0xFF0D254C);
  static const Color navySurface = Color(0xFF132F5C);

  static const Color aquaPrimary = Color(0xFF00B4D8);
  static const Color aquaDark = Color(0xFF0077B6);
  static const Color aquaLight = Color(0xFF90E0EF);
  static const Color tealAccent = Color(0xFF2EC4B6);

  // Background & Surfaces
  static const Color background = Color(0xFFF6F9FC);
  static const Color surface = Colors.white;
  static const Color surfaceVariant = Color(0xFFEDF2F7);

  // Status & Telemetry Indicators
  static const Color statusOnline = Color(0xFF10B981);
  static const Color statusWarning = Color(0xFFF59E0B);
  static const Color statusDanger = Color(0xFFEF4444);
  static const Color statusOffline = Color(0xFF6B7280);
  static const Color statusStale = Color(0xFFF97316);

  // Text Colors
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF475569);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color textLight = Colors.white;

  // Gradients
  static const LinearGradient navyGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF08172E), Color(0xFF0F3460)],
  );

  static const LinearGradient aquaGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF00B4D8), Color(0xFF0077B6)],
  );

  static const LinearGradient cardHeaderGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0D254C), Color(0xFF1A3E72)],
  );

  static const LinearGradient meshGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0D254C), Color(0xFF00B4D8)],
  );
}

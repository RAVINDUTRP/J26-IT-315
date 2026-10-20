import 'package:aquashield/core/widgets/custom_button.dart';
import 'package:aquashield/core/widgets/custom_text_field.dart';
import 'package:aquashield/core/widgets/metric_card.dart';
import 'package:aquashield/core/widgets/status_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AquaShield UI Presentation Widgets Tests', () {
    testWidgets('StatusBadge renders label and dot correctly', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: StatusBadge(label: 'RTDB LIVE', type: BadgeStatusType.online),
          ),
        ),
      );

      expect(find.text('RTDB LIVE'), findsOneWidget);
    });

    testWidgets('MetricCard displays value, unit, title, and status', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: MetricCard(
              title: 'pH Value',
              value: '3.16',
              unit: 'pH',
              icon: Icons.science,
              statusLabel: 'Acidic',
              statusType: BadgeStatusType.warning,
            ),
          ),
        ),
      );

      expect(find.text('pH Value'), findsOneWidget);
      expect(find.text('3.16'), findsOneWidget);
      expect(find.text('pH'), findsOneWidget);
      expect(find.text('Acidic'), findsOneWidget);
    });

    testWidgets('CustomButton renders text and triggers callback', (
      WidgetTester tester,
    ) async {
      bool pressed = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CustomButton(
              text: 'Sign In',
              onPressed: () {
                pressed = true;
              },
            ),
          ),
        ),
      );

      expect(find.text('Sign In'), findsOneWidget);
      await tester.tap(find.text('Sign In'));
      await tester.pump();

      expect(pressed, isTrue);
    });

    testWidgets('CustomTextField accepts text input', (
      WidgetTester tester,
    ) async {
      final controller = TextEditingController();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CustomTextField(
              controller: controller,
              label: 'Email Address',
              hint: 'user@example.com',
            ),
          ),
        ),
      );

      expect(find.text('Email Address'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), 'admin@gmail.com');
      expect(controller.text, equals('admin@gmail.com'));
    });
  });
}

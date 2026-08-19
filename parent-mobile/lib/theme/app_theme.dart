import 'package:flutter/material.dart';

class EsColors {
  static const green900 = Color(0xFF0B3A29);
  static const green700 = Color(0xFF0F5138);
  static const green500 = Color(0xFF2E7D5B);
  static const green100 = Color(0xFFE3F0E8);
  static const gold600 = Color(0xFFB08D3A);
  static const gold400 = Color(0xFFC9A227);
  static const cream = Color(0xFFF5F0E4);
  static const sand = Color(0xFFEDE4D2);
  static const ink = Color(0xFF12241C);
  static const muted = Color(0xFF5A6A61);
  static const warn = Color(0xFFD08A24);
  static const danger = Color(0xFFA8443A);
  static const border = Color(0xFFE5DFCF);
}

ThemeData buildLightTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: EsColors.green700,
    brightness: Brightness.light,
    primary: EsColors.green700,
    surface: Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: EsColors.cream,
    appBarTheme: const AppBarTheme(
      backgroundColor: EsColors.green900,
      foregroundColor: EsColors.cream,
      elevation: 0,
    ),
    cardTheme: CardTheme(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: EsColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: EsColors.green700,
        foregroundColor: EsColors.cream,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
    ),
  );
}

ThemeData buildDarkTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: EsColors.green500,
      brightness: Brightness.dark,
      primary: const Color(0xFF57A57F),
      surface: const Color(0xFF10402D),
    ),
    scaffoldBackgroundColor: EsColors.green900,
    appBarTheme: const AppBarTheme(
      backgroundColor: EsColors.green900,
      foregroundColor: EsColors.cream,
    ),
  );
}

Color statusColor(String status) {
  switch (status) {
    case 'paid':
    case 'present':
    case 'graded':
    case 'submitted':
      return EsColors.green700;
    case 'partial':
    case 'late':
    case 'unpaid':
    case 'assigned':
      return EsColors.warn;
    case 'overdue':
    case 'absent':
      return EsColors.danger;
    default:
      return EsColors.muted;
  }
}

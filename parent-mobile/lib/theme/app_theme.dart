import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class EsColors {
  static const green900 = Color(0xFF0B3A29);
  static const green800 = Color(0xFF0C4631);
  static const green700 = Color(0xFF0F5138);
  static const green500 = Color(0xFF2E7D5B);
  static const green300 = Color(0xFF6FA88A);
  static const green100 = Color(0xFFE3F0E8);
  static const green50 = Color(0xFFF1F7F3);
  static const gold600 = Color(0xFFB08D3A);
  static const gold400 = Color(0xFFC9A227);
  static const cream = Color(0xFFF5F0E4);
  static const creamDeep = Color(0xFFEDE6D6);
  static const sand = Color(0xFFEDE4D2);
  static const ink = Color(0xFF12241C);
  static const muted = Color(0xFF5A6A61);
  static const warn = Color(0xFFD08A24);
  static const danger = Color(0xFFA8443A);
  static const border = Color(0xFFE5DFCF);
  static const white = Color(0xFFFFFFFF);
}

TextTheme _esTextTheme(TextTheme base, Color ink) {
  final body = GoogleFonts.figtreeTextTheme(base).apply(bodyColor: ink, displayColor: ink);
  final display = GoogleFonts.frauncesTextTheme(base).apply(bodyColor: ink, displayColor: ink);
  return body.copyWith(
    displayLarge: display.displayLarge?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.5),
    displayMedium: display.displayMedium?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.4),
    displaySmall: display.displaySmall?.copyWith(fontWeight: FontWeight.w600),
    headlineLarge: display.headlineLarge?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.3),
    headlineMedium: display.headlineMedium?.copyWith(fontWeight: FontWeight.w600),
    headlineSmall: display.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
    titleLarge: body.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.2),
    titleMedium: body.titleMedium?.copyWith(fontWeight: FontWeight.w600),
    titleSmall: body.titleSmall?.copyWith(fontWeight: FontWeight.w600),
    labelLarge: body.labelLarge?.copyWith(fontWeight: FontWeight.w600),
  );
}

ThemeData buildLightTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: EsColors.green700,
    brightness: Brightness.light,
    primary: EsColors.green700,
    onPrimary: EsColors.cream,
    secondary: EsColors.gold600,
    onSecondary: EsColors.ink,
    surface: EsColors.white,
    onSurface: EsColors.ink,
    error: EsColors.danger,
  );
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: EsColors.cream,
  );
  return base.copyWith(
    textTheme: _esTextTheme(base.textTheme, EsColors.ink),
    appBarTheme: AppBarTheme(
      backgroundColor: EsColors.green900,
      foregroundColor: EsColors.cream,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: GoogleFonts.figtree(
        color: EsColors.cream,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
    ),
    cardTheme: CardTheme(
      color: EsColors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: EsColors.border),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: EsColors.green50,
      selectedColor: EsColors.green100,
      disabledColor: EsColors.sand,
      labelStyle: GoogleFonts.figtree(fontSize: 13, fontWeight: FontWeight.w600, color: EsColors.ink),
      secondaryLabelStyle: GoogleFonts.figtree(fontSize: 13, fontWeight: FontWeight.w600, color: EsColors.green900),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: const BorderSide(color: EsColors.border),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: EsColors.white,
      indicatorColor: EsColors.green100,
      elevation: 0,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return GoogleFonts.figtree(
          fontSize: 12,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? EsColors.green900 : EsColors.muted,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(color: selected ? EsColors.green700 : EsColors.muted, size: 22);
      }),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: EsColors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: EsColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: EsColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: EsColors.green500, width: 1.5)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: EsColors.green700,
        foregroundColor: EsColors.cream,
        minimumSize: const Size.fromHeight(50),
        elevation: 0,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w700, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: EsColors.green800,
        minimumSize: const Size.fromHeight(44),
        side: const BorderSide(color: EsColors.border),
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600, fontSize: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: EsColors.green900,
      contentTextStyle: GoogleFonts.figtree(color: EsColors.cream),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: const DividerThemeData(color: EsColors.border, thickness: 1, space: 1),
  );
}

ThemeData buildDarkTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: EsColors.green500,
    brightness: Brightness.dark,
    primary: const Color(0xFF57A57F),
    surface: const Color(0xFF10402D),
  );
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: EsColors.green900,
  );
  return base.copyWith(
    textTheme: _esTextTheme(base.textTheme, EsColors.cream),
    appBarTheme: const AppBarTheme(
      backgroundColor: EsColors.green900,
      foregroundColor: EsColors.cream,
    ),
    cardTheme: CardTheme(
      color: EsColors.green800,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: EsColors.green700.withOpacity(0.6)),
      ),
    ),
  );
}

Color statusColor(String status) {
  switch (status) {
    case 'paid':
    case 'present':
    case 'graded':
    case 'submitted':
    case 'collected':
      return EsColors.green700;
    case 'partial':
    case 'late':
    case 'unpaid':
    case 'assigned':
    case 'pending_payment':
      return EsColors.warn;
    case 'overdue':
    case 'absent':
    case 'cancelled':
      return EsColors.danger;
    default:
      return EsColors.muted;
  }
}

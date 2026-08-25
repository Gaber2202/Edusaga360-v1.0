import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/brand_mark.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final settings = ref.watch(settingsProvider);
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.more)),
      body: SoftPageBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            Card(
              child: Column(
                children: [
                  _tile(context, Icons.school_outlined, l10n.studentProgress, () => context.push('/progress')),
                  const Divider(height: 1),
                  _tile(context, Icons.assignment_outlined, l10n.homework, () => context.push('/homework')),
                  const Divider(height: 1),
                  _tile(context, Icons.campaign_outlined, l10n.announcements, () => context.push('/announcements')),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: [
                  _tile(context, Icons.restaurant_outlined, l10n.canteen, () => context.push('/canteen')),
                  const Divider(height: 1),
                  _tile(context, Icons.storefront_outlined, l10n.store, () => context.push('/store')),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: [
                  SwitchListTile(
                    title: Text(settings.themeMode == ThemeMode.dark ? l10n.darkMode : l10n.lightMode),
                    value: settings.themeMode == ThemeMode.dark,
                    activeColor: EsColors.green700,
                    onChanged: (_) => ref.read(settingsProvider.notifier).toggleTheme(),
                  ),
                  const Divider(height: 1),
                  _tile(
                    context,
                    Icons.language,
                    l10n.language,
                    () => ref.read(settingsProvider.notifier).toggleLocale(),
                    subtitle: settings.isRtl ? 'العربية' : 'English',
                  ),
                  const Divider(height: 1),
                  _tile(
                    context,
                    Icons.swap_horiz,
                    l10n.changeSchool,
                    () async => ref.read(sessionProvider.notifier).changeSchool(),
                  ),
                  const Divider(height: 1),
                  _tile(
                    context,
                    Icons.logout,
                    l10n.signOut,
                    () async {
                      await ref.read(sessionProvider.notifier).signOut();
                      if (context.mounted) context.go('/login');
                    },
                    danger: true,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(
    BuildContext context,
    IconData icon,
    String title,
    VoidCallback onTap, {
    String? subtitle,
    bool danger = false,
  }) {
    final color = danger ? EsColors.danger : EsColors.green700;
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: danger ? EsColors.danger : null)),
      subtitle: subtitle == null ? null : Text(subtitle),
      trailing: Icon(Icons.chevron_right, color: EsColors.muted.withOpacity(0.7)),
      onTap: onTap,
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final settings = ref.watch(settingsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.more)),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.school_outlined),
            title: Text(l10n.studentProgress),
            onTap: () => context.push('/progress'),
          ),
          ListTile(
            leading: const Icon(Icons.assignment_outlined),
            title: Text(l10n.homework),
            onTap: () => context.push('/homework'),
          ),
          ListTile(
            leading: const Icon(Icons.campaign_outlined),
            title: Text(l10n.announcements),
            onTap: () => context.push('/announcements'),
          ),
          ListTile(
            leading: const Icon(Icons.restaurant_outlined),
            title: Text(l10n.canteen),
            onTap: () => context.push('/canteen'),
          ),
          ListTile(
            leading: const Icon(Icons.storefront_outlined),
            title: Text(l10n.store),
            onTap: () => context.push('/store'),
          ),
          const Divider(),
          SwitchListTile(
            title: Text(settings.themeMode == ThemeMode.dark ? l10n.darkMode : l10n.lightMode),
            value: settings.themeMode == ThemeMode.dark,
            onChanged: (_) => ref.read(settingsProvider.notifier).toggleTheme(),
          ),
          ListTile(
            leading: const Icon(Icons.language),
            title: Text(l10n.language),
            subtitle: Text(settings.isRtl ? 'العربية' : 'English'),
            onTap: () => ref.read(settingsProvider.notifier).toggleLocale(),
          ),
          ListTile(
            leading: const Icon(Icons.swap_horiz),
            title: Text(l10n.switchSchool),
            onTap: () async {
              await ref.read(sessionProvider.notifier).switchSchool();
              if (context.mounted) context.go('/school');
            },
          ),
          ListTile(
            leading: const Icon(Icons.logout),
            title: Text(l10n.signOut),
            onTap: () async {
              await ref.read(sessionProvider.notifier).signOut(keepSchool: true);
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/empty_state.dart';
import '../parent_data.dart';

class AnnouncementsScreen extends ConsumerWidget {
  const AnnouncementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.schoolAnnouncements)),
      body: ref.watch(announcementsProvider).when(
            data: (rows) {
              if (rows.isEmpty) {
                return EmptyState(title: l10n.announcementsWillAppear, icon: Icons.campaign_outlined);
              }
              return ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: rows.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final item = rows[i];
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (item.priority == 'high')
                            StatusPill(label: l10n.highPriority, color: EsColors.danger),
                          if (item.priority == 'high') const SizedBox(height: 8),
                          Text(item.displayTitle(rtl: rtl), style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          Text(item.displayBody(rtl: rtl)),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
            loading: () => const LoadingCard(),
            error: (err, _) => EmptyState(title: l10n.announcementsWillAppear, subtitle: err.toString()),
          ),
    );
  }
}

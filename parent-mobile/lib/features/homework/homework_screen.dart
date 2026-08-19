import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../filters.dart';
import '../parent_data.dart';

class HomeworkScreen extends ConsumerWidget {
  const HomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    final childId = ref.watch(selectedChildIdProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeworkAssignments)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: ref.watch(childrenProvider).when(
                  data: (children) => ChildPills(
                    children: children,
                    selectedId: childId,
                    allLabel: l10n.allChildren,
                    rtl: rtl,
                    onChanged: (id) => ref.read(selectedChildIdProvider.notifier).state = id,
                  ),
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
          ),
          Expanded(
            child: ref.watch(homeworkProvider).when(
                  data: (rows) {
                    if (rows.isEmpty) return EmptyState(title: l10n.homeworkWillAppear, icon: Icons.assignment_outlined);
                    return ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: rows.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final hw = rows[i];
                        return Card(
                          child: ListTile(
                            title: Text(hw.displayTitle(rtl: rtl)),
                            subtitle: Text([hw.subject, hw.dueDate, hw.teacherName].whereType<String>().where((s) => s.isNotEmpty).join(' · ')),
                            trailing: StatusPill(label: hw.status, color: statusColor(hw.status)),
                          ),
                        );
                      },
                    );
                  },
                  loading: () => const LoadingCard(),
                  error: (err, _) => EmptyState(title: l10n.homeworkWillAppear, subtitle: err.toString()),
                ),
          ),
        ],
      ),
    );
  }
}

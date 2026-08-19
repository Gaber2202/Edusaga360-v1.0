import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../prefs/settings_controller.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../filters.dart';
import '../parent_data.dart';

class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    final childId = ref.watch(selectedChildIdProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.studentProgressTitle)),
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
            child: ref.watch(gradesProvider).when(
                  data: (grades) {
                    if (grades.isEmpty) return EmptyState(title: l10n.progressWillAppear, icon: Icons.school_outlined);
                    return ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: grades.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final g = grades[i];
                        return Card(
                          child: ListTile(
                            title: Text(g.displaySubject(rtl: rtl)),
                            subtitle: Text(g.assessmentName ?? g.term ?? ''),
                            trailing: Text('${g.score.toStringAsFixed(0)}/${g.maxScore.toStringAsFixed(0)}'),
                          ),
                        );
                      },
                    );
                  },
                  loading: () => const LoadingCard(),
                  error: (err, _) => EmptyState(title: l10n.progressWillAppear, subtitle: err.toString()),
                ),
          ),
        ],
      ),
    );
  }
}

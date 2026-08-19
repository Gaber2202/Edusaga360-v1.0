import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../util/metrics.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../filters.dart';
import '../parent_data.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final session = ref.watch(sessionProvider).session;
    final rtl = ref.watch(settingsProvider).isRtl;
    final childrenAsync = ref.watch(childrenProvider);
    final summaryAsync = ref.watch(summaryProvider);
    final attendanceAsync = ref.watch(attendanceProvider);
    final gradesAsync = ref.watch(gradesProvider);
    final homeworkAsync = ref.watch(homeworkProvider);
    final childId = ref.watch(selectedChildIdProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${l10n.welcome}${session?.user.name.isNotEmpty == true ? ', ${session!.user.name}' : ''}'),
            if (session != null)
              Text(session.school.displayName(rtl: rtl), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(summaryProvider);
          ref.invalidate(childrenProvider);
          ref.invalidate(attendanceProvider);
          ref.invalidate(gradesProvider);
          ref.invalidate(homeworkProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            childrenAsync.when(
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
            const SizedBox(height: 16),
            summaryAsync.when(
              data: (summary) => Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _kpi(context, l10n.attendanceRate, summary.attendanceRate == null ? '—' : '${summary.attendanceRate}%'),
                  _kpi(context, l10n.outstandingFees, summary.outstandingFees.toStringAsFixed(2)),
                  _kpi(context, l10n.homeworkOverdue, '${summary.overdueHomework}'),
                  _kpi(context, l10n.notifications, '${summary.unreadNotifications}'),
                ],
              ),
              loading: () => const LoadingCard(),
              error: (err, _) => EmptyState(title: l10n.noDataYet, subtitle: err.toString()),
            ),
            const SizedBox(height: 24),
            Text(l10n.subjectScores, style: Theme.of(context).textTheme.titleMedium),
            gradesAsync.when(
              data: (grades) {
                final scores = latestSubjectScores(grades, rtl: rtl);
                if (scores.isEmpty) return EmptyState(title: l10n.progressWillAppear);
                return Column(
                  children: [
                    for (final score in scores)
                      ListTile(
                        title: Text(score.subject),
                        trailing: Text('${score.score.toStringAsFixed(0)}/${score.max.toStringAsFixed(0)}'),
                      ),
                  ],
                );
              },
              loading: () => const LoadingCard(),
              error: (_, __) => EmptyState(title: l10n.progressWillAppear),
            ),
            const SizedBox(height: 16),
            Text(l10n.attendanceTrend, style: Theme.of(context).textTheme.titleMedium),
            attendanceAsync.when(
              data: (rows) {
                final trend = attendanceTrend(rows);
                if (trend.isEmpty) return EmptyState(title: l10n.attendanceWillAppear);
                return SizedBox(
                  height: 88,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final point in trend)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: FractionallySizedBox(
                              heightFactor: (point.rate / 100).clamp(0.08, 1),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: EsColors.green500,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
              loading: () => const LoadingCard(),
              error: (_, __) => EmptyState(title: l10n.attendanceWillAppear),
            ),
            const SizedBox(height: 16),
            Text(l10n.homeworkSnapshot, style: Theme.of(context).textTheme.titleMedium),
            homeworkAsync.when(
              data: (rows) {
                final counts = homeworkCounts(rows);
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('${l10n.assigned}: ${counts.assigned} · ${l10n.overdue}: ${counts.overdue} · ${l10n.submitted}: ${counts.submitted}'),
                );
              },
              loading: () => const LoadingCard(),
              error: (_, __) => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kpi(BuildContext context, String label, String value) {
    return SizedBox(
      width: 160,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 6),
              Text(value, style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
        ),
      ),
    );
  }
}

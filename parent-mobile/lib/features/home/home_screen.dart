import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../util/metrics.dart';
import '../../widgets/brand_mark.dart';
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
    final nameParts = (session?.user?.name ?? '').trim().split(RegExp(r'\s+'));
    final firstName = nameParts.isNotEmpty && nameParts.first.isNotEmpty ? nameParts.first : null;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SoftPageBackground(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(summaryProvider);
            ref.invalidate(childrenProvider);
            ref.invalidate(attendanceProvider);
            ref.invalidate(gradesProvider);
            ref.invalidate(homeworkProvider);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverAppBar(
                pinned: true,
                expandedHeight: 132,
                backgroundColor: EsColors.green900,
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [EsColors.green800, EsColors.green900],
                      ),
                    ),
                    child: SafeArea(
                      bottom: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              firstName != null && firstName.isNotEmpty
                                  ? '${l10n.welcome}, $firstName'
                                  : l10n.welcome,
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(color: EsColors.cream),
                            ),
                            if (session?.school != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                session!.school!.displayName(rtl: rtl),
                                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                      color: EsColors.cream.withOpacity(0.78),
                                    ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
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
                      data: (summary) => GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 12,
                        crossAxisSpacing: 12,
                        childAspectRatio: 1.35,
                        children: [
                          EsKpiCard(
                            label: l10n.attendanceRate,
                            value: summary.attendanceRate == null ? '—' : '${summary.attendanceRate}%',
                            icon: Icons.event_available_outlined,
                          ),
                          EsKpiCard(
                            label: l10n.outstandingFees,
                            value: summary.outstandingFees.toStringAsFixed(0),
                            icon: Icons.payments_outlined,
                            accent: EsColors.gold600,
                          ),
                          EsKpiCard(
                            label: l10n.homeworkOverdue,
                            value: '${summary.overdueHomework}',
                            icon: Icons.assignment_late_outlined,
                            accent: EsColors.warn,
                          ),
                          EsKpiCard(
                            label: l10n.notifications,
                            value: '${summary.unreadNotifications}',
                            icon: Icons.notifications_none_outlined,
                          ),
                        ],
                      ),
                      loading: () => const LoadingCard(),
                      error: (err, _) => EmptyState(title: l10n.noDataYet, subtitle: err.toString()),
                    ),
                    const SizedBox(height: 22),
                    EsSectionHeader(title: l10n.subjectScores),
                    gradesAsync.when(
                      data: (grades) {
                        final scores = latestSubjectScores(grades, rtl: rtl);
                        if (scores.isEmpty) return EmptyState(title: l10n.progressWillAppear, icon: Icons.school_outlined);
                        return Column(
                          children: [
                            for (final score in scores)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Card(
                                  child: ListTile(
                                    title: Text(score.subject, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    trailing: Text(
                                      '${score.score.toStringAsFixed(0)}/${score.max.toStringAsFixed(0)}',
                                      style: const TextStyle(fontWeight: FontWeight.w700, color: EsColors.green700),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        );
                      },
                      loading: () => const LoadingCard(),
                      error: (_, __) => EmptyState(title: l10n.progressWillAppear),
                    ),
                    const SizedBox(height: 12),
                    EsSectionHeader(title: l10n.attendanceTrend),
                    attendanceAsync.when(
                      data: (rows) {
                        final trend = attendanceTrend(rows);
                        if (trend.isEmpty) return EmptyState(title: l10n.attendanceWillAppear, icon: Icons.bar_chart_outlined);
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
                            child: SizedBox(
                              height: 96,
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  for (final point in trend)
                                    Expanded(
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(horizontal: 3),
                                        child: FractionallySizedBox(
                                          heightFactor: (point.rate / 100).clamp(0.08, 1),
                                          child: DecoratedBox(
                                            decoration: BoxDecoration(
                                              gradient: const LinearGradient(
                                                begin: Alignment.bottomCenter,
                                                end: Alignment.topCenter,
                                                colors: [EsColors.green700, EsColors.green300],
                                              ),
                                              borderRadius: BorderRadius.circular(6),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                      loading: () => const LoadingCard(),
                      error: (_, __) => EmptyState(title: l10n.attendanceWillAppear),
                    ),
                    const SizedBox(height: 12),
                    EsSectionHeader(title: l10n.homeworkSnapshot),
                    homeworkAsync.when(
                      data: (rows) {
                        final counts = homeworkCounts(rows);
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(
                              '${l10n.assigned}: ${counts.assigned} · ${l10n.overdue}: ${counts.overdue} · ${l10n.submitted}: ${counts.submitted}',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.4),
                            ),
                          ),
                        );
                      },
                      loading: () => const LoadingCard(),
                      error: (_, __) => const SizedBox.shrink(),
                    ),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

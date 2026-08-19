import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../util/attendance.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../filters.dart';
import '../parent_data.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  String _status = 'all';
  String _from = '';
  String _to = '';

  String _label(AppLocalizations l10n, String status) {
    switch (status) {
      case 'present':
        return l10n.present;
      case 'absent':
        return l10n.absent;
      case 'late':
        return l10n.late;
      case 'excused':
        return l10n.excused;
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    final childId = ref.watch(selectedChildIdProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.attendanceRecords)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                ref.watch(childrenProvider).when(
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
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final preset in ['7d', '30d', 'month'])
                      ActionChip(
                        label: Text(preset == '7d' ? l10n.last7Days : preset == '30d' ? l10n.last30Days : l10n.thisMonth),
                        onPressed: () {
                          final range = presetRange(preset);
                          setState(() {
                            _from = range.from;
                            _to = range.to;
                          });
                        },
                      ),
                    ActionChip(
                      label: Text(l10n.clearFilters),
                      onPressed: () => setState(() {
                        _status = 'all';
                        _from = '';
                        _to = '';
                      }),
                    ),
                  ],
                ),
                DropdownButton<String>(
                  value: _status,
                  isExpanded: true,
                  items: [
                    DropdownMenuItem(value: 'all', child: Text(l10n.allStatuses)),
                    DropdownMenuItem(value: 'present', child: Text(l10n.present)),
                    DropdownMenuItem(value: 'absent', child: Text(l10n.absent)),
                    DropdownMenuItem(value: 'late', child: Text(l10n.late)),
                    DropdownMenuItem(value: 'excused', child: Text(l10n.excused)),
                  ],
                  onChanged: (value) => setState(() => _status = value ?? 'all'),
                ),
              ],
            ),
          ),
          Expanded(
            child: ref.watch(attendanceProvider).when(
                  data: (rows) {
                    final filtered = applyAttendanceFilters(rows, status: _status, from: _from, to: _to);
                    if (rows.isEmpty) return EmptyState(title: l10n.attendanceWillAppear, icon: Icons.event_available_outlined);
                    if (filtered.isEmpty) return EmptyState(title: l10n.noMatchingAttendance);
                    return ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final row = filtered[i];
                        return Card(
                          child: ListTile(
                            title: Text(row.date),
                            subtitle: row.notes == null || row.notes!.isEmpty ? null : Text(row.notes!),
                            trailing: StatusPill(label: _label(l10n, row.status), color: statusColor(row.status)),
                          ),
                        );
                      },
                    );
                  },
                  loading: () => const LoadingCard(),
                  error: (err, _) => EmptyState(title: l10n.attendanceWillAppear, subtitle: err.toString()),
                ),
          ),
        ],
      ),
    );
  }
}

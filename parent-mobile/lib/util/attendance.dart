String recordDate(String? date) {
  if (date == null || date.isEmpty) return '';
  return date.length >= 10 ? date.substring(0, 10) : date;
}

List<T> applyAttendanceFilters<T extends AttendanceLike>(
  List<T> records, {
  String status = 'all',
  String from = '',
  String to = '',
}) {
  return records.where((row) {
    final date = recordDate(row.date);
    if (status.isNotEmpty && status != 'all' && row.status != status) return false;
    if (from.isNotEmpty && date.isNotEmpty && date.compareTo(from) < 0) return false;
    if (to.isNotEmpty && date.isNotEmpty && date.compareTo(to) > 0) return false;
    return true;
  }).toList();
}

({String from, String to}) presetRange(String preset, {DateTime? now}) {
  final today = now ?? DateTime.now();
  String iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  if (preset == '7d') {
    return (from: iso(today.subtract(const Duration(days: 6))), to: iso(today));
  }
  if (preset == '30d') {
    return (from: iso(today.subtract(const Duration(days: 29))), to: iso(today));
  }
  if (preset == 'month') {
    return (from: iso(DateTime(today.year, today.month, 1)), to: iso(today));
  }
  return (from: '', to: '');
}

abstract class AttendanceLike {
  String get date;
  String get status;
}

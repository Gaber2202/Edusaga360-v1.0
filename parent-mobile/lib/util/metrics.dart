import 'attendance.dart';

int? attendanceRate(List<AttendanceLike> records) {
  if (records.isEmpty) return null;
  final presentish = records.where((r) =>
      r.status == 'present' || r.status == 'late' || r.status == 'excused').length;
  return ((presentish / records.length) * 100).round();
}

class AttendanceCounts {
  const AttendanceCounts({
    required this.present,
    required this.late,
    required this.absent,
    required this.excused,
  });

  final int present;
  final int late;
  final int absent;
  final int excused;
}

AttendanceCounts attendanceBreakdown(List<AttendanceLike> records) {
  var present = 0, late = 0, absent = 0, excused = 0;
  for (final row in records) {
    switch (row.status) {
      case 'present':
        present += 1;
      case 'late':
        late += 1;
      case 'absent':
        absent += 1;
      case 'excused':
        excused += 1;
    }
  }
  return AttendanceCounts(present: present, late: late, absent: absent, excused: excused);
}

class TrendPoint {
  const TrendPoint({required this.date, required this.rate});
  final String date;
  final int rate;
}

List<TrendPoint> attendanceTrend(List<AttendanceLike> records, {int dayCount = 14}) {
  final byDate = <String, ({int total, int presentish})>{};
  for (final row in records) {
    if (row.date.isEmpty) continue;
    final key = row.date.length >= 10 ? row.date.substring(0, 10) : row.date;
    final bucket = byDate[key] ?? (total: 0, presentish: 0);
    final presentish = row.status == 'present' || row.status == 'late' || row.status == 'excused';
    byDate[key] = (
      total: bucket.total + 1,
      presentish: bucket.presentish + (presentish ? 1 : 0),
    );
  }
  final points = byDate.entries.toList()
    ..sort((a, b) => a.key.compareTo(b.key));
  return points
      .skip(points.length > dayCount ? points.length - dayCount : 0)
      .map((e) => TrendPoint(
            date: e.key,
            rate: ((e.value.presentish / e.value.total) * 100).round(),
          ))
      .toList();
}

int? averageScore(List<GradeLike> grades) {
  if (grades.isEmpty) return null;
  var sum = 0.0;
  var count = 0;
  for (final grade in grades) {
    if (grade.maxScore <= 0) continue;
    sum += (grade.score / grade.maxScore) * 100;
    count += 1;
  }
  return count == 0 ? null : (sum / count).round();
}

class SubjectScore {
  const SubjectScore({required this.subject, required this.score, required this.max, required this.pct});
  final String subject;
  final double score;
  final double max;
  final int pct;
}

List<SubjectScore> latestSubjectScores(List<GradeLike> grades, {required bool rtl}) {
  final latest = <String, SubjectScore>{};
  final sorted = [...grades]..sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
  for (final grade in sorted) {
    final key = grade.subject.isNotEmpty ? grade.subject : grade.subjectAr;
    if (key.isEmpty || latest.containsKey(key)) continue;
    final max = grade.maxScore <= 0 ? 100.0 : grade.maxScore;
    latest[key] = SubjectScore(
      subject: rtl
          ? (grade.subjectAr.isNotEmpty ? grade.subjectAr : grade.subject)
          : (grade.subject.isNotEmpty ? grade.subject : grade.subjectAr),
      score: grade.score,
      max: max,
      pct: ((grade.score / max) * 100).round(),
    );
  }
  final values = latest.values.toList()..sort((a, b) => b.pct.compareTo(a.pct));
  return values;
}

class HomeworkCounts {
  const HomeworkCounts({
    required this.assigned,
    required this.submitted,
    required this.graded,
    required this.overdue,
  });
  final int assigned;
  final int submitted;
  final int graded;
  final int overdue;
}

HomeworkCounts homeworkCounts(List<HomeworkLike> rows, {DateTime? now}) {
  final today = now ?? DateTime.now();
  var assigned = 0, submitted = 0, graded = 0, overdue = 0;
  for (final hw in rows) {
    if (hw.status == 'submitted') {
      submitted += 1;
      continue;
    }
    if (hw.status == 'graded') {
      graded += 1;
      continue;
    }
    final due = hw.dueDate != null ? DateTime.tryParse(hw.dueDate!) : null;
    if (due != null && due.isBefore(today) && (hw.status == 'assigned' || hw.status.isEmpty)) {
      overdue += 1;
      continue;
    }
    assigned += 1;
  }
  return HomeworkCounts(assigned: assigned, submitted: submitted, graded: graded, overdue: overdue);
}

List<T> forStudent<T extends StudentScoped>(List<T> rows, String? studentId) {
  if (studentId == null || studentId.isEmpty) return rows;
  return rows.where((row) => row.studentId == studentId).toList();
}

abstract class GradeLike {
  String get subject;
  String get subjectAr;
  double get score;
  double get maxScore;
  String? get createdAt;
}

abstract class HomeworkLike {
  String get status;
  String? get dueDate;
}

abstract class StudentScoped {
  String get studentId;
}

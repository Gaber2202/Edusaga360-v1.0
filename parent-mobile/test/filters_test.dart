import 'package:flutter_test/flutter_test.dart';
import 'package:parent_mobile/util/attendance.dart';
import 'package:parent_mobile/util/invoice.dart';
import 'package:parent_mobile/util/metrics.dart';

class _Inv implements InvoiceLike {
  _Inv({
    required this.totalAmount,
    required this.paidAmount,
    required this.status,
    this.dueDate,
    this.documentType,
  });

  @override
  final double totalAmount;
  @override
  final double paidAmount;
  @override
  final String status;
  @override
  final String? dueDate;
  @override
  String? get issueDate => null;
  @override
  final String? documentType;
}

class _Att implements AttendanceLike {
  _Att(this.date, this.status);
  @override
  final String date;
  @override
  final String status;
}

void main() {
  test('displayStatus derives overdue and partial', () {
    final today = DateTime(2026, 8, 18);
    expect(
      displayStatus(
        _Inv(totalAmount: 100, paidAmount: 0, status: 'unpaid', dueDate: '2026-01-01'),
        today: today,
      ),
      'overdue',
    );
    expect(
      displayStatus(_Inv(totalAmount: 100, paidAmount: 40, status: 'unpaid')),
      'partial',
    );
    expect(
      displayStatus(_Inv(totalAmount: 100, paidAmount: 100, status: 'unpaid')),
      'paid',
    );
  });

  test('applyInvoiceFilters hides receipts and honours status', () {
    final rows = [
      _Inv(totalAmount: 100, paidAmount: 0, status: 'unpaid', dueDate: '2026-09-01'),
      _Inv(totalAmount: 50, paidAmount: 50, status: 'paid', documentType: 'receipt'),
    ];
    expect(applyInvoiceFilters(rows).length, 1);
    expect(applyInvoiceFilters(rows, status: 'paid'), isEmpty);
  });

  test('attendance filters and rate', () {
    final rows = [
      _Att('2026-08-01', 'present'),
      _Att('2026-08-02', 'absent'),
      _Att('2026-08-03', 'late'),
    ];
    expect(attendanceRate(rows), 67);
    expect(applyAttendanceFilters(rows, status: 'absent').length, 1);
    expect(applyAttendanceFilters(rows, from: '2026-08-02').length, 2);
  });

  test('presetRange last 7 days is inclusive', () {
    final range = presetRange('7d', now: DateTime(2026, 8, 18));
    expect(range.from, '2026-08-12');
    expect(range.to, '2026-08-18');
  });
}

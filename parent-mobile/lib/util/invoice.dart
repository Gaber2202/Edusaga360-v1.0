double invoiceBalance(InvoiceLike invoice) {
  final total = invoice.totalAmount;
  final paid = invoice.paidAmount;
  return ((total - paid) * 100).round() / 100;
}

String displayStatus(InvoiceLike invoice, {DateTime? today}) {
  final now = today ?? DateTime.now();
  if (invoice.status == 'cancelled') return 'cancelled';
  final total = invoice.totalAmount;
  final balance = invoiceBalance(invoice);
  if (total > 0 && balance <= 0.01) return 'paid';
  final due = invoice.dueDate;
  if (balance > 0.01 && due != null && due.isNotEmpty) {
    final parsed = DateTime.tryParse(due);
    if (parsed != null && parsed.isBefore(now)) return 'overdue';
  }
  if (invoice.paidAmount > 0.01) return 'partial';
  return 'unpaid';
}

bool isFeeInvoice(InvoiceLike invoice) {
  final type = invoice.documentType;
  return type == null || type == 'invoice';
}

List<T> applyInvoiceFilters<T extends InvoiceLike>(
  List<T> invoices, {
  String status = 'all',
  String from = '',
  String to = '',
}) {
  return invoices.where((invoice) {
    if (!isFeeInvoice(invoice)) return false;
    final display = displayStatus(invoice);
    if (status.isNotEmpty && status != 'all' && display != status) return false;
    final date = invoiceDate(invoice);
    if (from.isNotEmpty && date.isNotEmpty && date.compareTo(from) < 0) return false;
    if (to.isNotEmpty && date.isNotEmpty && date.compareTo(to) > 0) return false;
    return true;
  }).toList();
}

String invoiceDate(InvoiceLike invoice) {
  final raw = invoice.dueDate ?? invoice.issueDate ?? '';
  return raw.length >= 10 ? raw.substring(0, 10) : raw;
}

bool canPayInvoice(InvoiceLike invoice) {
  final status = displayStatus(invoice);
  return status == 'unpaid' || status == 'overdue' || status == 'partial';
}

class InvoiceBreakdown {
  const InvoiceBreakdown({
    required this.unpaid,
    required this.partial,
    required this.paid,
    required this.overdue,
    required this.cancelled,
    required this.outstanding,
  });

  final int unpaid;
  final int partial;
  final int paid;
  final int overdue;
  final int cancelled;
  final double outstanding;
}

InvoiceBreakdown invoiceBreakdown(List<InvoiceLike> invoices) {
  var unpaid = 0, partial = 0, paid = 0, overdue = 0, cancelled = 0;
  var outstanding = 0.0;
  for (final invoice in invoices) {
    final status = displayStatus(invoice);
    switch (status) {
      case 'unpaid':
        unpaid += 1;
      case 'partial':
        partial += 1;
      case 'paid':
        paid += 1;
      case 'overdue':
        overdue += 1;
      case 'cancelled':
        cancelled += 1;
    }
    if (status != 'paid' && status != 'cancelled') {
      outstanding += invoiceBalance(invoice);
    }
  }
  return InvoiceBreakdown(
    unpaid: unpaid,
    partial: partial,
    paid: paid,
    overdue: overdue,
    cancelled: cancelled,
    outstanding: (outstanding * 100).round() / 100,
  );
}

abstract class InvoiceLike {
  double get totalAmount;
  double get paidAmount;
  String get status;
  String? get dueDate;
  String? get issueDate;
  String? get documentType;
}

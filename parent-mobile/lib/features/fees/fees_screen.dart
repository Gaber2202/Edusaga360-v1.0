import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../util/invoice.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../filters.dart';
import '../parent_data.dart';
import 'payment_screen.dart';

class FeesScreen extends ConsumerStatefulWidget {
  const FeesScreen({super.key});

  @override
  ConsumerState<FeesScreen> createState() => _FeesScreenState();
}

class _FeesScreenState extends ConsumerState<FeesScreen> {
  String _status = 'all';
  String? _busyId;

  String _statusLabel(AppLocalizations l10n, String status) {
    switch (status) {
      case 'paid':
        return l10n.paid;
      case 'partial':
        return l10n.partial;
      case 'unpaid':
        return l10n.unpaid;
      case 'overdue':
        return l10n.overdue;
      case 'cancelled':
        return l10n.cancelled;
      default:
        return status;
    }
  }

  Future<void> _download(InvoiceRecord invoice, {required bool receipt}) async {
    final l10n = AppLocalizations.of(context);
    final path = receipt ? invoice.receiptPdf : invoice.pdf;
    if (path == null) return;
    setState(() => _busyId = invoice.id);
    try {
      final file = await ref.read(sessionProvider.notifier).api.downloadPdf(
            path,
            receipt ? 'receipt-${invoice.id}.pdf' : 'invoice-${invoice.id}.pdf',
          );
      await OpenFilex.open(file.path);
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(receipt ? l10n.receiptError : l10n.downloadError)),
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _pay(InvoiceRecord invoice) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busyId = invoice.id);
    try {
      final url = await ref.read(sessionProvider.notifier).api.paymentUrl(invoice.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaymentScreen(url: url)));
      ref.invalidate(invoicesProvider);
      ref.invalidate(summaryProvider);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.payError)));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    final childId = ref.watch(selectedChildIdProvider);
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.feesBilling),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: l10n.tabInvoices),
              Tab(text: l10n.tabPayments),
              Tab(text: l10n.tabContracts),
              Tab(text: l10n.tabAdmissionDocs),
            ],
          ),
        ),
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
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _InvoicesTab(l10n: l10n, childId: childId, status: _status, onStatusChanged: (value) => setState(() => _status = value), busyId: _busyId, onPay: _pay, onDownload: _download),
                  ref.watch(paymentsProvider).when(
                        data: (rows) => rows.isEmpty
                            ? EmptyState(title: l10n.noPayments, icon: Icons.payments_outlined)
                            : ListView(
                                children: [
                                  for (final row in rows)
                                    ListTile(
                                      title: Text('${l10n.invoiceNo} ${row.invoiceNumber ?? '—'}'),
                                      subtitle: Text(row.date ?? '—'),
                                      trailing: Text(row.amount.toStringAsFixed(2)),
                                    ),
                                ],
                              ),
                        loading: () => const LoadingCard(),
                        error: (err, _) => Text(err.toString()),
                      ),
                  ref.watch(contractsProvider).when(
                        data: (rows) => rows.isEmpty
                            ? EmptyState(title: l10n.noContracts, icon: Icons.description_outlined)
                            : ListView(
                                children: [
                                  for (final row in rows)
                                    ListTile(
                                      title: Text(row.templateName ?? l10n.tabContracts),
                                      subtitle: Text(row.status ?? '—'),
                                      trailing: Text(row.signedAt?.split('T').first ?? '—'),
                                    ),
                                ],
                              ),
                        loading: () => const LoadingCard(),
                        error: (err, _) => Text(err.toString()),
                      ),
                  ref.watch(applicationsProvider).when(
                        data: (rows) => rows.isEmpty
                            ? EmptyState(title: l10n.noAdmissionDocs, icon: Icons.folder_open_outlined)
                            : ListView(
                                children: [
                                  for (final app in rows)
                                    ExpansionTile(
                                      title: Text(app.applicationNumber ?? app.id),
                                      subtitle: Text(app.documentStatus ?? app.stage ?? '—'),
                                      children: [
                                        for (final doc in app.documents)
                                          ListTile(
                                            title: Text(rtl ? doc.labelAr : doc.labelEn),
                                            trailing: Text(doc.uploaded ? '✓' : '—'),
                                          ),
                                      ],
                                    ),
                                ],
                              ),
                        loading: () => const LoadingCard(),
                        error: (err, _) => Text(err.toString()),
                      ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InvoicesTab extends ConsumerWidget {
  const _InvoicesTab({
    required this.l10n,
    required this.childId,
    required this.status,
    required this.onStatusChanged,
    required this.busyId,
    required this.onPay,
    required this.onDownload,
  });

  final AppLocalizations l10n;
  final String? childId;
  final String status;
  final ValueChanged<String> onStatusChanged;
  final String? busyId;
  final Future<void> Function(InvoiceRecord) onPay;
  final Future<void> Function(InvoiceRecord, {required bool receipt}) onDownload;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: DropdownButton<String>(
            value: status,
            isExpanded: true,
            items: [
              DropdownMenuItem(value: 'all', child: Text(l10n.allStatuses)),
              DropdownMenuItem(value: 'unpaid', child: Text(l10n.unpaid)),
              DropdownMenuItem(value: 'partial', child: Text(l10n.partial)),
              DropdownMenuItem(value: 'overdue', child: Text(l10n.overdue)),
              DropdownMenuItem(value: 'paid', child: Text(l10n.paid)),
            ],
            onChanged: (value) => onStatusChanged(value ?? 'all'),
          ),
        ),
        Expanded(
          child: ref.watch(invoicesProvider).when(
                data: (invoices) {
                  final filtered = applyInvoiceFilters(invoices, status: status);
                  if (invoices.isEmpty) {
                    return EmptyState(title: l10n.noInvoices, subtitle: l10n.invoicesWillAppear, icon: Icons.payments_outlined);
                  }
                  if (filtered.isEmpty) return EmptyState(title: l10n.noMatchingInvoices);
                  final breakdown = invoiceBreakdown(filtered);
                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text('${l10n.totalOutstanding}: ${breakdown.outstanding.toStringAsFixed(2)}'),
                      const SizedBox(height: 12),
                      for (final invoice in filtered)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(child: Text('${l10n.invoiceNo} ${invoice.invoiceNumber}')),
                                    StatusPill(
                                      label: invoice.status,
                                      color: statusColor(displayStatus(invoice)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text('${l10n.student}: ${invoice.studentName}'),
                                Text('${l10n.due}: ${invoice.dueDate ?? '—'}'),
                                Text('${l10n.balance}: ${invoice.balance.toStringAsFixed(2)}'),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  children: [
                                    if (canPayInvoice(invoice))
                                      FilledButton(
                                        onPressed: busyId == invoice.id ? null : () => onPay(invoice),
                                        child: Text(l10n.payNow),
                                      ),
                                    TextButton(
                                      onPressed: busyId == invoice.id ? null : () => onDownload(invoice, receipt: false),
                                      child: Text(l10n.invoice),
                                    ),
                                    if (displayStatus(invoice) == 'paid')
                                      TextButton(
                                        onPressed: busyId == invoice.id ? null : () => onDownload(invoice, receipt: true),
                                        child: Text(l10n.receipt),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  );
                },
                loading: () => const LoadingCard(),
                error: (err, _) => EmptyState(title: l10n.noInvoices, subtitle: err.toString()),
              ),
        ),
      ],
    );
  }
}

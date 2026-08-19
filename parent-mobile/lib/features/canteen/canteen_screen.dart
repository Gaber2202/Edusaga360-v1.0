import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../filters.dart';
import '../parent_data.dart';
import 'payment_screen.dart';

class CanteenScreen extends ConsumerStatefulWidget {
  const CanteenScreen({super.key});

  @override
  ConsumerState<CanteenScreen> createState() => _CanteenScreenState();
}

class _CanteenScreenState extends ConsumerState<CanteenScreen> {
  double _amount = 50;
  bool _busy = false;
  bool _savingAllergies = false;
  List<String> _allergens = const [];
  String? _allergensForChild;

  static const _keys = ['nuts', 'dairy', 'gluten', 'eggs', 'soy', 'fish', 'shellfish'];

  Future<void> _topUp(String studentId) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final invoiceId = await ref.read(sessionProvider.notifier).api.createCanteenTopup(studentId: studentId, amount: _amount);
      final url = await ref.read(sessionProvider.notifier).api.paymentUrl(invoiceId);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaymentScreen(url: url)));
      ref.invalidate(canteenWalletProvider);
      ref.invalidate(canteenTransactionsProvider);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.payError)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveAllergies(String studentId) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _savingAllergies = true);
    try {
      await ref.read(sessionProvider.notifier).api.updateChildAllergens(studentId: studentId, allergens: _allergens);
      ref.invalidate(childrenProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.canteenAllergiesSaved)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.payError)));
      }
    } finally {
      if (mounted) setState(() => _savingAllergies = false);
    }
  }
    final l10n = AppLocalizations.of(context);
    final childId = ref.watch(selectedChildIdProvider);
    final kids = ref.watch(childrenProvider).value ?? const [];
    final currentId = childId ?? (kids.isNotEmpty ? kids.first.id : null);
    Child? current;
    for (final child in kids) {
      if (child.id == currentId) current = child;
    }
    if (current != null && _allergensForChild != current.id) {
      _allergensForChild = current.id;
      _allergens = List<String>.from(current.canteenAllergens);
    }
    return Scaffold(
      appBar: AppBar(title: Text(l10n.canteen)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: ref.watch(childrenProvider).when(
                  data: (children) => ChildPills(
                    children: children,
                    selectedId: childId,
                    allLabel: l10n.allChildren,
                    rtl: ref.watch(settingsProvider).isRtl,
                    onChanged: (id) => ref.read(selectedChildIdProvider.notifier).state = id,
                  ),
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
          ),
          Expanded(
            child: ref.watch(canteenWalletProvider).when(
                  data: (wallet) => ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text('${l10n.canteenBalance}: ${wallet.balance.toStringAsFixed(2)}'),
                      const SizedBox(height: 12),
                      Slider(
                        value: _amount,
                        min: 10,
                        max: 200,
                        divisions: 19,
                        label: _amount.toStringAsFixed(0),
                        onChanged: (value) => setState(() => _amount = value),
                      ),
                      FilledButton(
                        onPressed: _busy ? null : () => _topUp(childId ?? ref.read(childrenProvider).value?.first.id ?? ''),
                        child: Text(l10n.canteenTopUp),
                      ),
                      const SizedBox(height: 24),
                      Text(l10n.canteenAllergies, style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final key in _keys)
                            FilterChip(
                              label: Text(key),
                              selected: _allergens.contains(key),
                              onSelected: (selected) {
                                setState(() {
                                  _allergens = selected
                                      ? [..._allergens, key]
                                      : _allergens.where((item) => item != key).toList();
                                });
                              },
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: _savingAllergies
                            ? null
                            : () => _saveAllergies(childId ?? ref.read(childrenProvider).value?.first.id ?? ''),
                        child: Text(l10n.saveAllergies),
                      ),
                      const SizedBox(height: 24),
                      Text(l10n.canteenHistory, style: Theme.of(context).textTheme.titleMedium),
                      ref.watch(canteenTransactionsProvider).when(
                            data: (rows) => rows.isEmpty
                                ? EmptyState(title: l10n.noCanteenActivity, icon: Icons.restaurant_outlined)
                                : Column(
                                    children: [
                                      for (final row in rows)
                                        ListTile(
                                          title: Text(row.transactionType),
                                          subtitle: Text(row.transactionDate ?? '—'),
                                          trailing: Text(row.amount.toStringAsFixed(2)),
                                        ),
                                    ],
                                  ),
                            loading: () => const LinearProgressIndicator(),
                            error: (err, _) => Text(err.toString()),
                          ),
                    ],
                  ),
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (err, _) => EmptyState(title: l10n.noCanteenActivity, subtitle: err.toString()),
                ),
          ),
        ],
      ),
    );
  }
}

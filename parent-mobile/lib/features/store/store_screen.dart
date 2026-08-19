import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../widgets/empty_state.dart';
import '../parent_data.dart';
import '../fees/payment_screen.dart';

class StoreScreen extends ConsumerWidget {
  const StoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.store)),
      body: ref.watch(storeProductsProvider).when(
            data: (products) {
              if (products.isEmpty) {
                return EmptyState(title: l10n.noStoreProducts, icon: Icons.storefront_outlined);
              }
              return ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: products.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final product = products[index];
                  return Card(
                    child: ListTile(
                      title: Text(product.displayName(rtl: rtl)),
                      subtitle: Text(product.category),
                      trailing: product.pricePurchase != null
                          ? FilledButton(
                              onPressed: () => _buy(context, ref, product, 'purchase'),
                              child: Text('${l10n.purchase} ${product.pricePurchase!.toStringAsFixed(0)}'),
                            )
                          : product.priceRental != null
                              ? FilledButton(
                                  onPressed: () => _buy(context, ref, product, 'rental'),
                                  child: Text('${l10n.rent} ${product.priceRental!.toStringAsFixed(0)}'),
                                )
                              : null,
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, _) => EmptyState(title: l10n.noStoreProducts, subtitle: err.toString()),
          ),
    );
  }

  Future<void> _buy(BuildContext context, WidgetRef ref, StoreProduct product, String lineType) async {
    final l10n = AppLocalizations.of(context);
    final childId = ref.read(selectedChildIdProvider) ?? ref.read(childrenProvider).value?.first.id;
    if (childId == null) return;
    String? slotStart;
    if (product.isBookable) {
      slotStart = await _pickSlot(context, ref, product);
      if (slotStart == null) return;
    }
    try {
      final result = await ref.read(sessionProvider.notifier).api.createStoreOrder(
            studentId: childId,
            lines: [
              {
                'product_id': product.id,
                'line_type': lineType,
                'quantity': 1,
                if (slotStart != null) 'slot_start': slotStart,
              },
            ],
          );
      final url = await ref.read(sessionProvider.notifier).api.paymentUrl(result.invoiceId);
      if (!context.mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaymentScreen(url: url)));
      ref.invalidate(storeOrdersProvider);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.payError)));
      }
    }
  }

  Future<String?> _pickSlot(BuildContext context, WidgetRef ref, StoreProduct product) async {
    final l10n = AppLocalizations.of(context);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (picked == null || !context.mounted) return null;
    final date =
        '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    final slots = await ref.read(sessionProvider.notifier).api.storeSlots(productId: product.id, date: date);
    final open = slots.where((s) => s.available).toList();
    if (!context.mounted) return null;
    if (open.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.noSlots)));
      return null;
    }
    return showModalBottomSheet<String>(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              ListTile(title: Text(l10n.pickSlot)),
              for (final slot in open)
                ListTile(
                  title: Text(slot.startsAt.length >= 16 ? slot.startsAt.substring(11, 16) : slot.startsAt),
                  onTap: () => Navigator.of(ctx).pop(slot.startsAt),
                ),
            ],
          ),
        );
      },
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../fees/payment_screen.dart';
import '../filters.dart';
import '../parent_data.dart';

class StoreScreen extends ConsumerStatefulWidget {
  const StoreScreen({super.key});

  @override
  ConsumerState<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends ConsumerState<StoreScreen> {
  String? _busyProductId;
  bool _didAutoSelectChild = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    final childId = ref.watch(selectedChildIdProvider);
    final childrenAsync = ref.watch(childrenProvider);
    final productsAsync = ref.watch(storeProductsProvider);
    final categoriesAsync = ref.watch(storeCategoriesProvider);
    final ordersAsync = ref.watch(storeOrdersProvider);
    final categoryFilter = ref.watch(storeCategoryFilterProvider);

    childrenAsync.whenData((children) {
      if (!_didAutoSelectChild && childId == null && children.isNotEmpty) {
        _didAutoSelectChild = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          // Store checkout requires a concrete student — default to first child.
          if (ref.read(selectedChildIdProvider) == null) {
            ref.read(selectedChildIdProvider.notifier).state = children.first.id;
          }
        });
      }
    });

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: Text(l10n.store)),
      body: SoftScaffoldBody(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(storeProductsProvider);
            ref.invalidate(storeOrdersProvider);
            ref.invalidate(storeCategoriesProvider);
            ref.invalidate(childrenProvider);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: childrenAsync.when(
                    data: (children) {
                      if (children.isEmpty) {
                        return EmptyState(
                          title: l10n.noStudentsLinked,
                          subtitle: l10n.contactAdmin,
                          icon: Icons.family_restroom_outlined,
                        );
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.storeForChild,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: EsColors.muted,
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                          const SizedBox(height: 8),
                          ChildPills(
                            children: children,
                            selectedId: childId ?? children.first.id,
                            allLabel: l10n.allChildren,
                            rtl: rtl,
                            requireSelection: true,
                            onChanged: (id) {
                              if (id != null) {
                                ref.read(selectedChildIdProvider.notifier).state = id;
                              }
                            },
                          ),
                        ],
                      );
                    },
                    loading: () => const SizedBox(height: 40, child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: categoriesAsync.when(
                  data: (categories) {
                    if (categories.isEmpty) return const SizedBox(height: 8);
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _CategoryChip(
                              label: l10n.allCategories,
                              selected: categoryFilter == null,
                              onTap: () => ref.read(storeCategoryFilterProvider.notifier).state = null,
                            ),
                            for (final cat in categories)
                              _CategoryChip(
                                label: cat.displayName(rtl: rtl),
                                selected: categoryFilter == cat.slug,
                                onTap: () => ref.read(storeCategoryFilterProvider.notifier).state = cat.slug,
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
              ),
              productsAsync.when(
                data: (products) {
                  if (products.isEmpty) {
                    return SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(
                        title: l10n.noStoreProducts,
                        subtitle: l10n.storeEmptyHint,
                        icon: Icons.storefront_outlined,
                      ),
                    );
                  }
                  return SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    sliver: SliverList.separated(
                      itemCount: products.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final product = products[index];
                        return _ProductCard(
                          product: product,
                          rtl: rtl,
                          l10n: l10n,
                          busy: _busyProductId == product.id,
                          onBuy: product.allowsPurchase && product.inStock
                              ? () => _buy(product, 'purchase')
                              : null,
                          onRent: product.allowsRental && product.inStock
                              ? () => _buy(product, 'rental')
                              : null,
                        );
                      },
                    ),
                  );
                },
                loading: () => const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (err, _) => SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    title: l10n.storeLoadError,
                    subtitle: err.toString(),
                    icon: Icons.error_outline,
                    action: FilledButton(
                      onPressed: () => ref.invalidate(storeProductsProvider),
                      child: Text(l10n.retry),
                    ),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                  child: ordersAsync.when(
                    data: (orders) {
                      if (orders.isEmpty) return const SizedBox.shrink();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          EsSectionHeader(title: l10n.recentOrders),
                          for (final order in orders.take(5))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Card(
                                child: ListTile(
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                                  title: Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w700)),
                                  subtitle: Text(_orderStatusLabel(l10n, order.status)),
                                  trailing: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        order.totalAmount.toStringAsFixed(2),
                                        style: const TextStyle(fontWeight: FontWeight.w700),
                                      ),
                                      const SizedBox(height: 4),
                                      StatusPill(label: order.status, color: statusColor(order.status)),
                                    ],
                                  ),
                                  onTap: order.status == 'pending_payment' && order.invoiceId != null
                                      ? () => _payOrder(order)
                                      : null,
                                ),
                              ),
                            ),
                        ],
                      );
                    },
                    loading: () => const SizedBox.shrink(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _orderStatusLabel(AppLocalizations l10n, String status) {
    switch (status) {
      case 'pending_payment':
        return l10n.payNow;
      case 'paid':
        return l10n.paid;
      case 'cancelled':
        return l10n.cancelled;
      default:
        return status;
    }
  }

  Future<void> _payOrder(StoreOrder order) async {
    final l10n = AppLocalizations.of(context);
    final invoiceId = order.invoiceId;
    if (invoiceId == null) return;
    try {
      final url = await ref.read(sessionProvider.notifier).api.paymentUrl(invoiceId);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaymentScreen(url: url)));
      ref.invalidate(storeOrdersProvider);
    } on ApiException catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message.isNotEmpty ? err.message : l10n.payError)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.payError)));
      }
    }
  }

  Future<void> _buy(StoreProduct product, String lineType) async {
    final l10n = AppLocalizations.of(context);
    final children = ref.read(childrenProvider).value ?? const [];
    final childId = ref.read(selectedChildIdProvider) ?? (children.isNotEmpty ? children.first.id : null);
    if (childId == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.selectChildFirst)));
      return;
    }
    if (!product.inStock) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.outOfStock)));
      return;
    }

    String? slotStart;
    if (product.isBookable) {
      slotStart = await _pickSlot(product);
      if (slotStart == null) return;
    }

    setState(() => _busyProductId = product.id);
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
      if (result.invoiceId.isEmpty) {
        throw ApiException(l10n.payError);
      }
      final url = await ref.read(sessionProvider.notifier).api.paymentUrl(result.invoiceId);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaymentScreen(url: url)));
      ref.invalidate(storeOrdersProvider);
      ref.invalidate(storeProductsProvider);
    } on ApiException catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(err.message.isNotEmpty ? err.message : l10n.payError)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.payError)));
      }
    } finally {
      if (mounted) setState(() => _busyProductId = null);
    }
  }

  Future<String?> _pickSlot(StoreProduct product) async {
    final l10n = AppLocalizations.of(context);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (picked == null || !mounted) return null;
    final date =
        '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';

    List<StoreSlot> slots;
    try {
      slots = await ref.read(sessionProvider.notifier).api.storeSlots(productId: product.id, date: date);
    } on ApiException catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
      }
      return null;
    }

    final open = slots.where((s) => s.available).toList();
    if (!mounted) return null;
    if (open.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.noSlots)));
      return null;
    }
    return showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              ListTile(
                title: Text(l10n.pickSlot, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(date),
              ),
              for (final slot in open)
                ListTile(
                  leading: const Icon(Icons.schedule, color: EsColors.green700),
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

class SoftScaffoldBody extends StatelessWidget {
  const SoftScaffoldBody({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [EsColors.cream, EsColors.creamDeep],
        ),
      ),
      child: child,
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        showCheckmark: false,
        onSelected: (_) => onTap(),
        selectedColor: EsColors.green100,
        backgroundColor: EsColors.white,
        side: BorderSide(color: selected ? EsColors.green500 : EsColors.border),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.rtl,
    required this.l10n,
    required this.busy,
    required this.onBuy,
    required this.onRent,
  });

  final StoreProduct product;
  final bool rtl;
  final AppLocalizations l10n;
  final bool busy;
  final VoidCallback? onBuy;
  final VoidCallback? onRent;

  @override
  Widget build(BuildContext context) {
    final desc = product.displayDescription(rtl: rtl);
    final image = product.imageUrl;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 16 / 7,
            child: image != null && image.isNotEmpty
                ? Image.network(
                    image,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _placeholder(),
                  )
                : _placeholder(),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        product.displayName(rtl: rtl),
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (product.isBookable)
                      StatusPill(label: l10n.bookable, color: EsColors.gold600)
                    else if (!product.inStock)
                      StatusPill(label: l10n.outOfStock, color: EsColors.danger)
                    else
                      StatusPill(label: l10n.inStockCount(product.stockQty), color: EsColors.green700),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  product.category,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: EsColors.muted,
                        fontWeight: FontWeight.w600,
                      ),
                ),
                if (desc != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    desc,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: EsColors.muted, height: 1.35),
                  ),
                ],
                if (product.collectLocation != null && product.collectLocation!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.place_outlined, size: 16, color: EsColors.muted),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          product.collectLocation!,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: EsColors.muted),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 14),
                if (busy)
                  const Center(child: SizedBox(height: 28, width: 28, child: CircularProgressIndicator(strokeWidth: 2.5)))
                else
                  Row(
                    children: [
                      if (onBuy != null)
                        Expanded(
                          child: FilledButton(
                            onPressed: onBuy,
                            child: Text('${l10n.purchase} ${product.pricePurchase!.toStringAsFixed(0)}'),
                          ),
                        ),
                      if (onBuy != null && onRent != null) const SizedBox(width: 8),
                      if (onRent != null)
                        Expanded(
                          child: OutlinedButton(
                            onPressed: onRent,
                            child: Text('${l10n.rent} ${product.priceRental!.toStringAsFixed(0)}'),
                          ),
                        ),
                      if (onBuy == null && onRent == null)
                        Expanded(
                          child: OutlinedButton(
                            onPressed: null,
                            child: Text(product.inStock ? l10n.unavailable : l10n.outOfStock),
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      color: EsColors.green50,
      child: const Center(
        child: Icon(Icons.storefront_outlined, size: 40, color: EsColors.green300),
      ),
    );
  }
}

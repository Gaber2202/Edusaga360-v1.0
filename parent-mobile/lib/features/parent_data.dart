import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../auth/session_controller.dart';
import 'filters.dart';

final childrenProvider = FutureProvider<List<Child>>((ref) {
  ref.watch(sessionProvider.select((s) => s.session?.accessToken));
  return ref.read(sessionProvider.notifier).api.children();
});

final summaryProvider = FutureProvider<DashboardSummary>((ref) {
  ref.watch(sessionProvider.select((s) => s.session?.accessToken));
  return ref.read(sessionProvider.notifier).api.summary();
});

final attendanceProvider = FutureProvider<List<AttendanceRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.attendance(studentId: childId);
});

final gradesProvider = FutureProvider<List<GradeRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.grades(studentId: childId);
});

final invoicesProvider = FutureProvider<List<InvoiceRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.invoices(studentId: childId);
});

final homeworkProvider = FutureProvider<List<HomeworkRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.homework(studentId: childId);
});

final announcementsProvider = FutureProvider<List<AnnouncementRecord>>((ref) {
  return ref.read(sessionProvider.notifier).api.announcements();
});

final messagesProvider = FutureProvider<List<MessageRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.messages(studentId: childId);
});

final notificationsProvider = FutureProvider<List<NotificationRecord>>((ref) {
  return ref.read(sessionProvider.notifier).api.notifications();
});

final paymentsProvider = FutureProvider<List<PaymentRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.payments(studentId: childId);
});

final contractsProvider = FutureProvider<List<ContractRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.contracts(studentId: childId);
});

final applicationsProvider = FutureProvider<List<ApplicationRecord>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  if (childId == null) return Future.value(const []);
  return ref.read(sessionProvider.notifier).api.applications(studentId: childId);
});

final canteenWalletProvider = FutureProvider<CanteenWallet>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  final children = ref.watch(childrenProvider).value ?? const [];
  final studentId = childId ?? (children.isNotEmpty ? children.first.id : '');
  if (studentId.isEmpty) return Future.value(const CanteenWallet(studentId: '', balance: 0));
  return ref.read(sessionProvider.notifier).api.canteenWallet(studentId);
});

final canteenTransactionsProvider = FutureProvider<List<CanteenTransaction>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.canteenTransactions(studentId: childId);
});

final storeCategoryFilterProvider = StateProvider<String?>((ref) => null);

final storeProductsProvider = FutureProvider<List<StoreProduct>>((ref) {
  final category = ref.watch(storeCategoryFilterProvider);
  return ref.read(sessionProvider.notifier).api.storeProducts(category: category);
});

final storeCategoriesProvider = FutureProvider<List<StoreCategory>>((ref) {
  ref.watch(sessionProvider.select((s) => s.session?.accessToken));
  return ref.read(sessionProvider.notifier).api.storeCategories();
});

final storeOrdersProvider = FutureProvider<List<StoreOrder>>((ref) {
  final childId = ref.watch(selectedChildIdProvider);
  return ref.read(sessionProvider.notifier).api.storeOrders(studentId: childId);
});

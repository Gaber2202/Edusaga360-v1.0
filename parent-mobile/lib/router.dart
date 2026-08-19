import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth/session_controller.dart';
import 'features/announcements/announcements_screen.dart';
import 'features/attendance/attendance_screen.dart';
import 'features/auth/access_denied_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/school_code_screen.dart';
import 'features/fees/fees_screen.dart';
import 'features/home/home_screen.dart';
import 'features/homework/homework_screen.dart';
import 'features/messages/messages_screen.dart';
import 'features/more/more_screen.dart';
import 'features/progress/progress_screen.dart';
import 'features/canteen/canteen_screen.dart';
import 'features/store/store_screen.dart';
import 'features/shell/app_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, __) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/school',
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      if (!session.ready) return null;
      final loc = state.matchedLocation;
      final authed = session.isAuthenticated;
      if (session.denied && loc != '/denied') return '/denied';
      if (!authed && session.pendingSchool == null && loc != '/school' && loc != '/denied') {
        return '/school';
      }
      if (!authed && session.pendingSchool != null && loc != '/login' && loc != '/school' && loc != '/denied') {
        return '/login';
      }
      if (authed && (loc == '/school' || loc == '/login' || loc == '/denied')) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/school', builder: (_, __) => const SchoolCodeScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/denied', builder: (_, __) => const AccessDeniedScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/attendance', builder: (_, __) => const AttendanceScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/fees', builder: (_, __) => const FeesScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/messages', builder: (_, __) => const MessagesScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/more', builder: (_, __) => const MoreScreen()),
            GoRoute(path: '/progress', builder: (_, __) => const ProgressScreen()),
            GoRoute(path: '/homework', builder: (_, __) => const HomeworkScreen()),
            GoRoute(path: '/announcements', builder: (_, __) => const AnnouncementsScreen()),
            GoRoute(path: '/canteen', builder: (_, __) => const CanteenScreen()),
            GoRoute(path: '/store', builder: (_, __) => const StoreScreen()),
          ]),
        ],
      ),
    ],
  );
});

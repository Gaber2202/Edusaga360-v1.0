import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/models.dart';
import '../api/parent_api.dart';

const _sessionKey = 'es_parent_session';

class SessionState {
  const SessionState({
    this.session,
    this.ready = false,
    this.denied = false,
  });

  final AuthSession? session;
  final bool ready;
  final bool denied;

  bool get needsSchoolSelection =>
      session != null && (session!.needsSchoolSelection || !session!.isComplete);

  bool get isAuthenticated => session != null && session!.isComplete && !denied;

  SessionState copyWith({
    AuthSession? session,
    bool? ready,
    bool? denied,
    bool clearSession = false,
  }) {
    return SessionState(
      session: clearSession ? null : (session ?? this.session),
      ready: ready ?? this.ready,
      denied: denied ?? this.denied,
    );
  }
}

class SessionController extends StateNotifier<SessionState> {
  SessionController({ParentApi? api, FlutterSecureStorage? storage})
      : _api = api ?? ParentApi(),
        _storage = storage ?? const FlutterSecureStorage(),
        super(const SessionState()) {
    _api.onRefresh = _tryRefresh;
    restore();
  }

  final ParentApi _api;
  final FlutterSecureStorage _storage;

  ParentApi get api {
    _api.accessToken = state.session?.accessToken;
    _api.tenantId = state.session?.school?.id;
    return _api;
  }

  Future<void> _persist(AuthSession session) async {
    _api.accessToken = session.accessToken;
    _api.tenantId = session.school?.id;
    await _storage.write(key: _sessionKey, value: jsonEncode(session.toJson()));
    state = SessionState(session: session, ready: true);
  }

  Future<void> restore() async {
    try {
      final raw = await _storage.read(key: _sessionKey);
      if (raw != null) {
        final session = AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        _api.accessToken = session.accessToken;
        _api.tenantId = session.school?.id;
        state = SessionState(session: session, ready: true);
        return;
      }
    } catch (err) {
      debugPrint('session restore failed: $err');
    }
    state = const SessionState(ready: true);
  }

  Future<void> login(String email, String password) async {
    try {
      final session = await _api.login(email: email.trim(), password: password);
      await _persist(session);
    } on ApiException catch (err) {
      if (err.statusCode == 403 && err.message == 'This API is for parent accounts only') {
        state = state.copyWith(denied: true);
      }
      rethrow;
    }
  }

  Future<void> selectSchool(School school) async {
    final current = state.session;
    if (current == null) throw ApiException('Not authenticated');
    final tenantId = school.id;
    if (tenantId == null || tenantId.isEmpty) {
      throw ApiException('Invalid school');
    }
    final session = await _api.selectSchool(
      refreshToken: current.refreshToken,
      tenantId: tenantId,
    );
    // Keep refresh token if select-school returned empty (reuse login pair).
    final merged = session.copyWith(
      refreshToken: session.refreshToken.isNotEmpty ? session.refreshToken : current.refreshToken,
      schools: session.schools.isNotEmpty ? session.schools : current.schools,
    );
    await _persist(merged);
  }

  Future<bool> _tryRefresh() async {
    final current = state.session;
    if (current == null) return false;
    try {
      final next = await _api.refresh(
        current.refreshToken,
        tenantId: current.school?.id,
      );
      if (!next.isComplete) {
        await _persist(next);
        return false;
      }
      await _persist(next);
      return true;
    } catch (_) {
      await signOut();
      return false;
    }
  }

  Future<void> changeSchool() async {
    final current = state.session;
    if (current == null) return;
    List<School> schools = current.schools;
    if (schools.length < 2) {
      try {
        schools = await api.listSchools();
      } catch (_) {
        /* keep cached */
      }
    }
    if (schools.length <= 1) return;
    final pending = AuthSession(
      accessToken: current.accessToken,
      refreshToken: current.refreshToken,
      schools: schools,
      needsSchoolSelection: true,
    );
    await _persist(pending);
  }

  Future<void> signOut() async {
    await _storage.delete(key: _sessionKey);
    _api.accessToken = null;
    _api.tenantId = null;
    state = const SessionState(ready: true);
  }
}

final sessionProvider = StateNotifierProvider<SessionController, SessionState>((ref) {
  return SessionController();
});

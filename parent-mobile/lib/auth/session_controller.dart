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
    this.pendingSchool,
    this.ready = false,
    this.denied = false,
  });

  final AuthSession? session;
  final School? pendingSchool;
  final bool ready;
  final bool denied;

  bool get isAuthenticated => session != null && !denied;

  SessionState copyWith({
    AuthSession? session,
    School? pendingSchool,
    bool? ready,
    bool? denied,
    bool clearSession = false,
    bool clearSchool = false,
  }) {
    return SessionState(
      session: clearSession ? null : (session ?? this.session),
      pendingSchool: clearSchool ? null : (pendingSchool ?? this.pendingSchool),
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
    return _api;
  }

  Future<void> restore() async {
    try {
      final raw = await _storage.read(key: _sessionKey);
      if (raw != null) {
        final session = AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        _api.accessToken = session.accessToken;
        state = SessionState(session: session, pendingSchool: session.school, ready: true);
        return;
      }
    } catch (err) {
      debugPrint('session restore failed: $err');
    }
    state = const SessionState(ready: true);
  }

  Future<School> lookupSchool(String tenantCode) async {
    final school = await _api.lookupSchool(tenantCode.trim());
    state = state.copyWith(pendingSchool: school, denied: false);
    return school;
  }

  Future<void> login(String email, String password) async {
    final school = state.pendingSchool;
    if (school == null) throw ApiException('A school code is required');
    try {
      final session = await _api.login(email: email.trim(), password: password, school: school);
      _api.accessToken = session.accessToken;
      await _storage.write(key: _sessionKey, value: jsonEncode(session.toJson()));
      state = SessionState(session: session, pendingSchool: school, ready: true);
    } on ApiException catch (err) {
      if (err.statusCode == 403 && err.message == 'This API is for parent accounts only') {
        state = state.copyWith(denied: true);
      }
      rethrow;
    }
  }

  Future<bool> _tryRefresh() async {
    final current = state.session;
    if (current == null) return false;
    try {
      final next = await _api.refresh(current.refreshToken, current.school);
      _api.accessToken = next.accessToken;
      await _storage.write(key: _sessionKey, value: jsonEncode(next.toJson()));
      state = state.copyWith(session: next);
      return true;
    } catch (_) {
      await signOut();
      return false;
    }
  }

  Future<void> signOut({bool keepSchool = false}) async {
    await _storage.delete(key: _sessionKey);
    _api.accessToken = null;
    state = SessionState(
      ready: true,
      pendingSchool: keepSchool ? state.pendingSchool : null,
    );
  }

  Future<void> switchSchool() => signOut(keepSchool: false);
}

final sessionProvider = StateNotifierProvider<SessionController, SessionState>((ref) {
  return SessionController();
});

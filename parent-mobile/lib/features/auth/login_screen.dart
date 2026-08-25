import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/brand_mark.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  bool _busy = false;
  bool _obscure = true;
  String? _selectedSchoolId;
  List<School> _schools = const [];

  @override
  void initState() {
    super.initState();
    _email.addListener(_onCredentialsChanged);
    _password.addListener(_onCredentialsChanged);
    // Restore pending school list if session was mid-selection (e.g. app restart).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final session = ref.read(sessionProvider).session;
      if (session != null && session.needsSchoolSelection && session.schools.isNotEmpty) {
        setState(() {
          _schools = session.schools;
          _selectedSchoolId = session.schools.length == 1 ? session.schools.first.id : null;
        });
      }
    });
  }

  @override
  void dispose() {
    _email.removeListener(_onCredentialsChanged);
    _password.removeListener(_onCredentialsChanged);
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _onCredentialsChanged() {
    if (_schools.isEmpty && ref.read(sessionProvider).session == null) return;
    final pending = ref.read(sessionProvider).session;
    if (pending != null && pending.needsSchoolSelection) {
      ref.read(sessionProvider.notifier).signOut();
    }
    if (_schools.isEmpty && _selectedSchoolId == null && _error == null) return;
    setState(() {
      _schools = const [];
      _selectedSchoolId = null;
      _error = null;
    });
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final sessionState = ref.read(sessionProvider);
      final pending = sessionState.session;
      final hasPendingSchools = pending != null &&
          pending.needsSchoolSelection &&
          pending.schools.isNotEmpty &&
          _schools.isNotEmpty;

      if (hasPendingSchools) {
        if (_selectedSchoolId == null || _selectedSchoolId!.isEmpty) {
          setState(() => _error = l10n.selectSchoolHint);
          return;
        }
        final school = _schools.cast<School?>().firstWhere(
              (s) => s?.id == _selectedSchoolId,
              orElse: () => null,
            );
        if (school == null) {
          setState(() => _error = l10n.selectSchoolHint);
          return;
        }
        await ref.read(sessionProvider.notifier).selectSchool(school);
        return;
      }

      await ref.read(sessionProvider.notifier).login(_email.text, _password.text);
      final after = ref.read(sessionProvider).session;
      if (after != null && after.needsSchoolSelection) {
        final schools = after.schools;
        setState(() {
          _schools = schools;
          _selectedSchoolId = schools.length == 1 ? schools.first.id : null;
          _error = schools.isEmpty ? l10n.loginFailed : null;
        });
        // Single school: finish selection immediately on the same form.
        if (schools.length == 1 && schools.first.id != null) {
          await ref.read(sessionProvider.notifier).selectSchool(schools.first);
        }
      }
    } on ApiException catch (err) {
      if (err.statusCode == 403 && err.message == 'This API is for parent accounts only') {
        if (mounted) context.go('/denied');
        return;
      }
      setState(() => _error = err.message.isNotEmpty ? err.message : l10n.loginFailed);
    } catch (_) {
      setState(() => _error = l10n.loginFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    final showSchool = _schools.isNotEmpty;

    return Scaffold(
      body: SoftPageBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
            children: [
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(
                  onPressed: () => ref.read(settingsProvider.notifier).toggleLocale(),
                  child: Text(rtl ? 'English' : 'العربية'),
                ),
              ),
              const SizedBox(height: 24),
              const BrandMark(size: 76),
              const SizedBox(height: 28),
              Text(
                l10n.parentPortal,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: EsColors.green900),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.loginLead,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: EsColors.muted, height: 1.45),
              ),
              const SizedBox(height: 28),
              Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(l10n.signInSubtitle, style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        enabled: !showSchool || !_busy,
                        decoration: InputDecoration(
                          labelText: l10n.email,
                          prefixIcon: const Icon(Icons.mail_outline),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: const [AutofillHints.password],
                        textInputAction: showSchool ? TextInputAction.next : TextInputAction.done,
                        onSubmitted: (_) {
                          if (!showSchool) _submit();
                        },
                        decoration: InputDecoration(
                          labelText: l10n.password,
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            onPressed: () => setState(() => _obscure = !_obscure),
                            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          ),
                        ),
                      ),
                      if (showSchool) ...[
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          value: _selectedSchoolId,
                          isExpanded: true,
                          decoration: InputDecoration(
                            labelText: l10n.selectSchoolLabel,
                            prefixIcon: const Icon(Icons.school_outlined),
                          ),
                          hint: Text(l10n.selectSchoolHint),
                          items: [
                            for (final school in _schools)
                              if (school.id != null)
                                DropdownMenuItem(
                                  value: school.id,
                                  child: Text(
                                    school.displayName(rtl: rtl),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                          ],
                          onChanged: _busy
                              ? null
                              : (value) => setState(() {
                                    _selectedSchoolId = value;
                                    _error = null;
                                  }),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          l10n.selectSchoolLead,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: EsColors.muted),
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          _error!,
                          style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13),
                        ),
                      ],
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: EsColors.cream),
                              )
                            : Text(showSchool ? l10n.continueLabel : l10n.signIn),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

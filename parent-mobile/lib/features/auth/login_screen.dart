import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';

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

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await ref.read(sessionProvider.notifier).login(_email.text, _password.text);
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
    final session = ref.watch(sessionProvider);
    final rtl = ref.watch(settingsProvider).isRtl;
    final school = session.pendingSchool;
    return Scaffold(
      appBar: AppBar(
        title: Text(school?.displayName(rtl: rtl) ?? l10n.parentPortal),
        actions: [
          TextButton(
            onPressed: () {
              ref.read(sessionProvider.notifier).switchSchool();
              context.go('/school');
            },
            child: Text(l10n.changeSchool, style: const TextStyle(color: EsColors.cream)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(l10n.signInSubtitle, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(l10n.loginLead),
          const SizedBox(height: 24),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: InputDecoration(labelText: l10n.email),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(labelText: l10n.password, errorText: _error),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(l10n.signIn),
          ),
        ],
      ),
    );
  }
}

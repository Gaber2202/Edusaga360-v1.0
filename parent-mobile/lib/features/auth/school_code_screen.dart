import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';

class SchoolCodeScreen extends ConsumerStatefulWidget {
  const SchoolCodeScreen({super.key});

  @override
  ConsumerState<SchoolCodeScreen> createState() => _SchoolCodeScreenState();
}

class _SchoolCodeScreenState extends ConsumerState<SchoolCodeScreen> {
  final _controller = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await ref.read(sessionProvider.notifier).lookupSchool(_controller.text);
      if (mounted) context.go('/login');
    } on ApiException catch (err) {
      setState(() => _error = err.isNotFound ? l10n.schoolNotFound : err.message);
    } catch (_) {
      setState(() => _error = l10n.schoolNotFound);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(
                  onPressed: () => ref.read(settingsProvider.notifier).toggleLocale(),
                  child: Text(ref.watch(settingsProvider).isRtl ? 'English' : 'العربية'),
                ),
              ),
              const Spacer(),
              Text(l10n.parentPortal, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: EsColors.green900)),
              const SizedBox(height: 8),
              Text(l10n.loginLead),
              const SizedBox(height: 24),
              TextField(
                controller: _controller,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  labelText: l10n.schoolCode,
                  hintText: l10n.schoolCodeHint,
                  errorText: _error,
                ),
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(l10n.continueLabel),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}

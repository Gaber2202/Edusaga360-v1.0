import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../../widgets/brand_mark.dart';

class SelectSchoolScreen extends ConsumerStatefulWidget {
  const SelectSchoolScreen({super.key});

  @override
  ConsumerState<SelectSchoolScreen> createState() => _SelectSchoolScreenState();
}

class _SelectSchoolScreenState extends ConsumerState<SelectSchoolScreen> {
  String? _selectedId;
  String? _error;
  bool _busy = false;
  bool _autoStarted = false;

  Future<void> _continue(School school) async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _error = null;
      _busy = true;
      _selectedId = school.id;
    });
    try {
      await ref.read(sessionProvider.notifier).selectSchool(school);
    } on ApiException catch (err) {
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
    final schools = ref.watch(sessionProvider).session?.schools ?? const <School>[];

    if (!_autoStarted && schools.length == 1 && schools.first.id != null) {
      _autoStarted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _continue(schools.first);
      });
    }

    return Scaffold(
      body: SoftPageBackground(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: TextButton(
                    onPressed: _busy ? null : () => ref.read(sessionProvider.notifier).signOut(),
                    child: Text(l10n.signOut),
                  ),
                ),
                const Spacer(),
                const BrandMark(size: 64),
                const SizedBox(height: 28),
                Text(
                  l10n.selectSchoolTitle,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: EsColors.green900),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.selectSchoolLead,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: EsColors.muted),
                ),
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
                    child: Column(
                      children: [
                        DropdownButtonFormField<String>(
                          value: _selectedId,
                          decoration: InputDecoration(labelText: l10n.selectSchoolLabel),
                          items: [
                            for (final school in schools)
                              if (school.id != null)
                                DropdownMenuItem(
                                  value: school.id,
                                  child: Text(school.displayName(rtl: rtl)),
                                ),
                          ],
                          onChanged: _busy
                              ? null
                              : (value) => setState(() {
                                    _selectedId = value;
                                    _error = null;
                                  }),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 8),
                          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                        ],
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _busy
                              ? null
                              : () {
                                  final school = schools.cast<School?>().firstWhere(
                                        (s) => s?.id == _selectedId,
                                        orElse: () => null,
                                      );
                                  if (school == null) {
                                    setState(() => _error = l10n.selectSchoolHint);
                                    return;
                                  }
                                  _continue(school);
                                },
                          child: _busy
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: EsColors.cream),
                                )
                              : Text(l10n.continueLabel),
                        ),
                      ],
                    ),
                  ),
                ),
                const Spacer(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../auth/session_controller.dart';
import '../../prefs/settings_controller.dart';
import '../../widgets/child_pills.dart';
import '../../widgets/empty_state.dart';
import '../filters.dart';
import '../parent_data.dart';

class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  Future<void> _compose() async {
    final l10n = AppLocalizations.of(context);
    final subject = TextEditingController();
    final body = TextEditingController();
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(l10n.sendMessage, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(controller: subject, decoration: InputDecoration(labelText: l10n.subject)),
              const SizedBox(height: 8),
              TextField(controller: body, maxLines: 4, decoration: InputDecoration(labelText: l10n.messageBody)),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: Text(l10n.send),
              ),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
    if (sent != true) return;
    try {
      await ref.read(sessionProvider.notifier).api.sendMessage(
            subject: subject.text,
            content: body.text,
            studentId: ref.read(selectedChildIdProvider),
          );
      ref.invalidate(messagesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.messageSent)));
      }
    } on ApiException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.messageSendFailed)));
      }
    } finally {
      subject.dispose();
      body.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final rtl = ref.watch(settingsProvider).isRtl;
    final childId = ref.watch(selectedChildIdProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.messagesTitle)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _compose,
        label: Text(l10n.sendMessage),
        icon: const Icon(Icons.edit_outlined),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: ref.watch(childrenProvider).when(
                  data: (children) => ChildPills(
                    children: children,
                    selectedId: childId,
                    allLabel: l10n.allChildren,
                    rtl: rtl,
                    onChanged: (id) => ref.read(selectedChildIdProvider.notifier).state = id,
                  ),
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
          ),
          Expanded(
            child: ref.watch(messagesProvider).when(
                  data: (rows) {
                    if (rows.isEmpty) {
                      return EmptyState(title: l10n.noMessagesYet, subtitle: l10n.writeFirstMessage, icon: Icons.chat_bubble_outline);
                    }
                    return ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: rows.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final msg = rows[i];
                        return Card(
                          child: ListTile(
                            title: Text(msg.subject),
                            subtitle: Text('${msg.fromName ?? l10n.from}\n${msg.content}'),
                            isThreeLine: true,
                          ),
                        );
                      },
                    );
                  },
                  loading: () => const LoadingCard(),
                  error: (err, _) => EmptyState(title: l10n.noMessagesYet, subtitle: err.toString()),
                ),
          ),
        ],
      ),
    );
  }
}

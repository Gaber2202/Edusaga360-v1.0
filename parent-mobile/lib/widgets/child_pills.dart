import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme/app_theme.dart';

class ChildPills extends StatelessWidget {
  const ChildPills({
    super.key,
    required this.children,
    required this.selectedId,
    required this.allLabel,
    required this.onChanged,
    required this.rtl,
  });

  final List<Child> children;
  final String? selectedId;
  final String allLabel;
  final ValueChanged<String?> onChanged;
  final bool rtl;

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[
      _pill(context, null, allLabel),
      for (final child in children) _pill(context, child.id, child.displayName(rtl: rtl)),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(children: chips),
    );
  }

  Widget _pill(BuildContext context, String? id, String label) {
    final selected = selectedId == id;
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        selectedColor: EsColors.green100,
        onSelected: (_) => onChanged(id),
      ),
    );
  }
}

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
    this.requireSelection = false,
  });

  final List<Child> children;
  final String? selectedId;
  final String allLabel;
  final ValueChanged<String?> onChanged;
  final bool rtl;

  /// When true, hides the "All children" chip (e.g. store checkout).
  final bool requireSelection;

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[
      if (!requireSelection) _pill(context, null, allLabel),
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
      child: FilterChip(
        label: Text(label),
        selected: selected,
        showCheckmark: false,
        selectedColor: EsColors.green100,
        backgroundColor: EsColors.white,
        side: BorderSide(color: selected ? EsColors.green500 : EsColors.border),
        labelStyle: TextStyle(
          color: selected ? EsColors.green900 : EsColors.ink,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
        ),
        onSelected: (_) => onChanged(id),
      ),
    );
  }
}

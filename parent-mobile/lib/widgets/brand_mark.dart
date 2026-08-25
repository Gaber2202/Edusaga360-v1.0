import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// EduSaga wordmark used on splash and auth surfaces.
class BrandMark extends StatelessWidget {
  const BrandMark({
    super.key,
    this.size = 72,
    this.showWordmark = true,
    this.light = false,
  });

  final double size;
  final bool showWordmark;
  final bool light;

  @override
  Widget build(BuildContext context) {
    final ink = light ? EsColors.cream : EsColors.green900;
    final leaf = light ? EsColors.gold400 : EsColors.green500;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: light
                  ? const [Color(0xFF145C40), EsColors.green900]
                  : const [EsColors.green700, EsColors.green900],
            ),
            boxShadow: [
              BoxShadow(
                color: EsColors.green900.withOpacity(light ? 0.25 : 0.18),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Center(
            child: Icon(Icons.eco_rounded, color: leaf, size: size * 0.48),
          ),
        ),
        if (showWordmark) ...[
          SizedBox(height: size * 0.22),
          Text(
            'EduSaga',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: ink,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.4,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            'Parent',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: light ? EsColors.cream.withOpacity(0.78) : EsColors.muted,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.4,
                ),
          ),
        ],
      ],
    );
  }
}

class SoftPageBackground extends StatelessWidget {
  const SoftPageBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            EsColors.cream,
            EsColors.creamDeep,
            Color(0xFFE8F1EB),
          ],
          stops: [0, 0.55, 1],
        ),
      ),
      child: child,
    );
  }
}

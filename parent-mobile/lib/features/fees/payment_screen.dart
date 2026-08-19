import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:webview_flutter/webview_flutter.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.url});

  final String url;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  late final WebViewController _controller;
  String? _result;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) {
          if (request.url.startsWith('edusaga-parent://')) {
            final pending = request.url.contains('pending');
            setState(() => _result = pending ? 'pending' : 'success');
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (_result != null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.feesBilling)),
        body: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(_result == 'success' ? Icons.check_circle_outline : Icons.hourglass_empty, size: 48),
              const SizedBox(height: 16),
              Text(_result == 'success' ? l10n.paymentComplete : l10n.paymentPending),
              const SizedBox(height: 24),
              FilledButton(onPressed: () => Navigator.pop(context), child: Text(l10n.close)),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(l10n.payNow)),
      body: WebViewWidget(controller: _controller),
    );
  }
}

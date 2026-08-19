import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'models.dart';

class ParentApi {
  ParentApi({Dio? dio, String? baseUrl, this.onRefresh})
      : _dio = dio ?? Dio(BaseOptions(baseUrl: baseUrl ?? defaultBaseUrl, connectTimeout: const Duration(seconds: 20))) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = accessToken;
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401 && onRefresh != null && !_refreshing) {
          _refreshing = true;
          try {
            final ok = await onRefresh!();
            if (ok) {
              final retry = await _dio.fetch(error.requestOptions);
              _refreshing = false;
              return handler.resolve(retry);
            }
          } catch (_) {
            // fall through
          }
          _refreshing = false;
        }
        handler.next(error);
      },
    ));
  }

  final Dio _dio;
  Future<bool> Function()? onRefresh;
  String? accessToken;
  bool _refreshing = false;

  static String get defaultBaseUrl {
    const env = String.fromEnvironment('API_BASE_URL');
    if (env.isNotEmpty) return env;
    if (kDebugMode) {
      if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:3001';
      return 'http://localhost:3001';
    }
    return 'https://api.edusaga360.com';
  }

  ApiException _wrap(DioException error) {
    final data = error.response?.data;
    final message = data is Map && data['message'] is String
        ? data['message'] as String
        : (error.message ?? 'Request failed');
    return ApiException(message, statusCode: error.response?.statusCode);
  }

  Future<T> _get<T>(String path, T Function(dynamic) parse, {Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.get(path, queryParameters: query);
      return parse(res.data);
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<School> lookupSchool(String tenantCode) {
    return _get('/api/public/schools/by-code/${Uri.encodeComponent(tenantCode)}', (data) {
      if (data is! Map<String, dynamic>) throw ApiException('School not found', statusCode: 404);
      return School.fromJson(data);
    });
  }

  Future<AuthSession> login({
    required String email,
    required String password,
    required School school,
  }) async {
    try {
      final res = await _dio.post('/api/parent/auth/login', data: {
        'email': email,
        'password': password,
        'tenant_code': school.tenantCode,
        'slug': school.slug,
      });
      final data = Map<String, dynamic>.from(res.data as Map);
      return AuthSession(
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String,
        user: ParentUser.fromJson(data['user'] as Map<String, dynamic>),
        school: school,
      );
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<AuthSession> refresh(String refreshToken, School school) async {
    try {
      final res = await _dio.post('/api/parent/auth/refresh', data: {
        'refresh_token': refreshToken,
      });
      final data = Map<String, dynamic>.from(res.data as Map);
      return AuthSession(
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String,
        user: ParentUser.fromJson(data['user'] as Map<String, dynamic>),
        school: school,
      );
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<ParentUser> me() => _get('/api/parent/me', (data) => ParentUser.fromJson(data as Map<String, dynamic>));

  Future<DashboardSummary> summary() =>
      _get('/api/parent/summary', (data) => DashboardSummary.fromJson(data as Map<String, dynamic>));

  Future<List<Child>> children() =>
      _get('/api/parent/children', (data) => parseList(data, Child.fromJson));

  Future<List<AttendanceRecord>> attendance({String? studentId}) => _get(
        '/api/parent/attendance',
        (data) => parseList(data, AttendanceRecord.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<GradeRecord>> grades({String? studentId}) => _get(
        '/api/parent/grades',
        (data) => parseList(data, GradeRecord.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<InvoiceRecord>> invoices({String? studentId}) => _get(
        '/api/parent/invoices',
        (data) => parseList(data, InvoiceRecord.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<HomeworkRecord>> homework({String? studentId}) => _get(
        '/api/parent/homework',
        (data) => parseList(data, HomeworkRecord.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<AnnouncementRecord>> announcements() =>
      _get('/api/parent/announcements', (data) => parseList(data, AnnouncementRecord.fromJson));

  Future<List<MessageRecord>> messages({String? studentId}) => _get(
        '/api/parent/messages',
        (data) => parseList(data, MessageRecord.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<MessageRecord> sendMessage({
    required String subject,
    required String content,
    String? studentId,
  }) async {
    try {
      final res = await _dio.post('/api/parent/messages', data: {
        'subject': subject,
        'content': content,
        if (studentId != null) 'student_id': studentId,
      });
      final data = res.data is Map && (res.data as Map)['data'] is Map
          ? Map<String, dynamic>.from((res.data as Map)['data'] as Map)
          : Map<String, dynamic>.from(res.data as Map);
      return MessageRecord.fromJson(data);
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<List<NotificationRecord>> notifications() =>
      _get('/api/parent/notifications', (data) => parseList(data, NotificationRecord.fromJson));

  Future<List<PaymentRecord>> payments({String? studentId}) => _get(
        '/api/parent/payments',
        (data) => parseList(data, PaymentRecord.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<ContractRecord>> contracts({String? studentId}) => _get(
        '/api/parent/contracts',
        (data) => parseList(data, ContractRecord.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<ApplicationRecord>> applications({required String studentId}) => _get(
        '/api/parent/applications',
        (data) => parseList(data, ApplicationRecord.fromJson),
        query: {'student_id': studentId},
      );

  Future<CanteenWallet> canteenWallet(String studentId) async {
    try {
      final res = await _dio.get('/api/parent/canteen/wallet', queryParameters: {'student_id': studentId});
      final body = res.data as Map;
      final data = body['data'] is Map
          ? Map<String, dynamic>.from(body['data'] as Map)
          : <String, dynamic>{'student_id': studentId, 'balance': 0};
      return CanteenWallet.fromJson(data);
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<List<CanteenTransaction>> canteenTransactions({String? studentId}) => _get(
        '/api/parent/canteen/transactions',
        (data) => parseList(data, CanteenTransaction.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<String>> updateChildAllergens({required String studentId, required List<String> allergens}) async {
    try {
      final res = await _dio.patch('/api/parent/children/$studentId/allergens', data: {
        'allergens': allergens,
      });
      final data = res.data is Map && (res.data as Map)['data'] is Map
          ? Map<String, dynamic>.from((res.data as Map)['data'] as Map)
          : Map<String, dynamic>.from(res.data as Map);
      final raw = data['canteen_allergens'];
      return raw is List ? raw.map((e) => e.toString()).toList() : allergens;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<String> createCanteenTopup({required String studentId, required double amount}) async {
    try {
      final res = await _dio.post('/api/parent/canteen/topup', data: {
        'student_id': studentId,
        'amount': amount,
      });
      final data = res.data is Map && (res.data as Map)['data'] is Map
          ? Map<String, dynamic>.from((res.data as Map)['data'] as Map)
          : Map<String, dynamic>.from(res.data as Map);
      return data['invoice_id'] as String;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<List<StoreProduct>> storeProducts({String? category}) => _get(
        '/api/parent/store/products',
        (data) => parseList(data, StoreProduct.fromJson),
        query: {if (category != null) 'category': category},
      );

  Future<List<StoreOrder>> storeOrders({String? studentId}) => _get(
        '/api/parent/store/orders',
        (data) => parseList(data, StoreOrder.fromJson),
        query: {if (studentId != null) 'student_id': studentId},
      );

  Future<List<StoreSlot>> storeSlots({required String productId, required String date}) => _get(
        '/api/parent/store/products/${Uri.encodeComponent(productId)}/slots',
        (data) => parseList(data, StoreSlot.fromJson),
        query: {'date': date},
      );

  Future<StoreCheckoutResult> createStoreOrder({
    required String studentId,
    required List<Map<String, dynamic>> lines,
  }) async {
    try {
      final res = await _dio.post('/api/parent/store/orders', data: {
        'student_id': studentId,
        'lines': lines,
      });
      final data = res.data is Map && (res.data as Map)['data'] is Map
          ? Map<String, dynamic>.from((res.data as Map)['data'] as Map)
          : Map<String, dynamic>.from(res.data as Map);
      return StoreCheckoutResult.fromJson(data);
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<String> paymentUrl(String invoiceId) async {
    try {
      final res = await _dio.get('/api/invoices/$invoiceId/payment-link', queryParameters: {
        'client': 'mobile',
      });
      final data = res.data as Map;
      final url = data['paymentUrl'] ?? data['payment_url'] ?? data['url'];
      if (url is! String || url.isEmpty) throw ApiException('Payment link not created');
      return url;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<File> downloadPdf(String path, String filename) async {
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$filename');
      await _dio.download(path, file.path);
      return file;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }
}

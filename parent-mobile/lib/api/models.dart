import '../util/attendance.dart';
import '../util/invoice.dart';
import '../util/metrics.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isDenied => statusCode == 403;
  bool get isNotFound => statusCode == 404;

  @override
  String toString() => message;
}

class School {
  const School({
    required this.slug,
    required this.tenantCode,
    this.nameEn,
    this.nameAr,
    this.logoUrl,
  });

  final String slug;
  final String tenantCode;
  final String? nameEn;
  final String? nameAr;
  final String? logoUrl;

  String displayName({required bool rtl}) {
    if (rtl) return nameAr?.isNotEmpty == true ? nameAr! : (nameEn ?? slug);
    return nameEn?.isNotEmpty == true ? nameEn! : (nameAr ?? slug);
  }

  factory School.fromJson(Map<String, dynamic> json) {
    return School(
      slug: json['slug'] as String? ?? '',
      tenantCode: json['tenant_code'] as String? ?? '',
      nameEn: json['name_en'] as String?,
      nameAr: json['name_ar'] as String?,
      logoUrl: json['logo_url'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'slug': slug,
        'tenant_code': tenantCode,
        'name_en': nameEn,
        'name_ar': nameAr,
        'logo_url': logoUrl,
      };
}

class ParentUser {
  const ParentUser({
    required this.id,
    required this.email,
    required this.name,
    required this.tenantId,
    required this.linkedStudentIds,
  });

  final String id;
  final String email;
  final String name;
  final String tenantId;
  final List<String> linkedStudentIds;

  factory ParentUser.fromJson(Map<String, dynamic> json) {
    return ParentUser(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      name: json['name'] as String? ?? '',
      tenantId: json['tenant_id'] as String? ?? '',
      linkedStudentIds: [
        for (final id in (json['linked_student_ids'] as List? ?? const []))
          id.toString(),
      ],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'name': name,
        'tenant_id': tenantId,
        'linked_student_ids': linkedStudentIds,
      };
}

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.school,
  });

  final String accessToken;
  final String refreshToken;
  final ParentUser user;
  final School school;

  AuthSession copyWith({
    String? accessToken,
    String? refreshToken,
    ParentUser? user,
    School? school,
  }) {
    return AuthSession(
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      user: user ?? this.user,
      school: school ?? this.school,
    );
  }

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      user: ParentUser.fromJson(json['user'] as Map<String, dynamic>),
      school: School.fromJson(json['school'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() => {
        'access_token': accessToken,
        'refresh_token': refreshToken,
        'user': user.toJson(),
        'school': school.toJson(),
      };
}

class Child {
  const Child({
    required this.id,
    required this.nameEn,
    required this.nameAr,
    required this.grade,
    required this.section,
    this.canteenAllergens = const [],
  });

  final String id;
  final String nameEn;
  final String nameAr;
  final String grade;
  final String section;
  final List<String> canteenAllergens;

  String displayName({required bool rtl}) =>
      rtl ? (nameAr.isNotEmpty ? nameAr : nameEn) : (nameEn.isNotEmpty ? nameEn : nameAr);

  factory Child.fromJson(Map<String, dynamic> json) {
    final raw = json['canteen_allergens'];
    return Child(
      id: json['id'] as String,
      nameEn: json['name_en'] as String? ?? '',
      nameAr: json['name_ar'] as String? ?? '',
      grade: json['grade'] as String? ?? '',
      section: json['section'] as String? ?? '',
      canteenAllergens: raw is List ? raw.map((e) => e.toString()).toList() : const [],
    );
  }
}

class DashboardSummary {
  const DashboardSummary({
    required this.children,
    required this.outstandingFees,
    required this.overdueHomework,
    required this.unreadNotifications,
    this.attendanceRate,
  });

  final int children;
  final double outstandingFees;
  final int overdueHomework;
  final int unreadNotifications;
  final int? attendanceRate;

  factory DashboardSummary.fromJson(Map<String, dynamic> json) {
    return DashboardSummary(
      children: (json['children'] as num?)?.toInt() ?? 0,
      outstandingFees: (json['outstanding_fees'] as num?)?.toDouble() ?? 0,
      overdueHomework: (json['overdue_homework'] as num?)?.toInt() ?? 0,
      unreadNotifications: (json['unread_notifications'] as num?)?.toInt() ?? 0,
      attendanceRate: (json['attendance_rate'] as num?)?.toInt(),
    );
  }
}

class AttendanceRecord implements AttendanceLike, StudentScoped {
  const AttendanceRecord({
    required this.id,
    required this.studentId,
    required this.date,
    required this.status,
    this.notes,
  });

  final String id;
  @override
  final String studentId;
  @override
  final String date;
  @override
  final String status;
  final String? notes;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['id'] as String? ?? '',
      studentId: json['student_id'] as String? ?? '',
      date: (json['date'] as String? ?? '').split('T').first,
      status: json['status'] as String? ?? '',
      notes: json['notes'] as String?,
    );
  }
}

class GradeRecord implements GradeLike, StudentScoped {
  const GradeRecord({
    required this.id,
    required this.studentId,
    required this.subject,
    required this.subjectAr,
    required this.score,
    required this.maxScore,
    this.assessmentName,
    this.term,
    this.createdAt,
  });

  final String id;
  @override
  final String studentId;
  @override
  final String subject;
  @override
  final String subjectAr;
  @override
  final double score;
  @override
  final double maxScore;
  final String? assessmentName;
  final String? term;
  @override
  final String? createdAt;

  String displaySubject({required bool rtl}) =>
      rtl ? (subjectAr.isNotEmpty ? subjectAr : subject) : (subject.isNotEmpty ? subject : subjectAr);

  factory GradeRecord.fromJson(Map<String, dynamic> json) {
    return GradeRecord(
      id: json['id'] as String? ?? '',
      studentId: json['student_id'] as String? ?? '',
      subject: json['subject'] as String? ?? '',
      subjectAr: json['subject_ar'] as String? ?? '',
      score: (json['score'] as num?)?.toDouble() ?? 0,
      maxScore: (json['max_score'] as num?)?.toDouble() ?? 100,
      assessmentName: (json['assessment_name'] as String?) ?? json['assessment_name_ar'] as String?,
      term: json['term'] as String?,
      createdAt: json['created_at'] as String?,
    );
  }
}

class InvoiceRecord implements InvoiceLike {
  const InvoiceRecord({
    required this.id,
    required this.invoiceNumber,
    required this.studentId,
    required this.studentName,
    required this.totalAmount,
    required this.paidAmount,
    required this.balance,
    required this.status,
    this.dueDate,
    this.issueDate,
    this.documentType,
    this.paymentLink,
    this.pdf,
    this.receiptPdf,
  });

  final String id;
  final String invoiceNumber;
  final String studentId;
  final String studentName;
  @override
  final double totalAmount;
  @override
  final double paidAmount;
  final double balance;
  @override
  final String status;
  @override
  final String? dueDate;
  @override
  final String? issueDate;
  @override
  final String? documentType;
  final String? paymentLink;
  final String? pdf;
  final String? receiptPdf;

  factory InvoiceRecord.fromJson(Map<String, dynamic> json) {
    return InvoiceRecord(
      id: json['id'] as String? ?? '',
      invoiceNumber: json['invoice_number'] as String? ?? '',
      studentId: json['student_id'] as String? ?? '',
      studentName: json['student_name'] as String? ?? '',
      totalAmount: (json['total_amount'] as num?)?.toDouble() ?? 0,
      paidAmount: (json['paid_amount'] as num?)?.toDouble() ?? 0,
      balance: (json['balance'] as num?)?.toDouble() ?? 0,
      status: json['status'] as String? ?? 'unpaid',
      dueDate: json['due_date'] as String?,
      issueDate: (json['issue_date'] as String?) ?? json['date'] as String?,
      documentType: json['document_type'] as String?,
      paymentLink: json['payment_link'] as String?,
      pdf: json['pdf'] as String?,
      receiptPdf: json['receipt_pdf'] as String?,
    );
  }
}

class HomeworkRecord implements HomeworkLike, StudentScoped {
  const HomeworkRecord({
    required this.id,
    required this.studentId,
    required this.titleEn,
    required this.titleAr,
    required this.subject,
    required this.status,
    this.dueDate,
    this.teacherName,
  });

  final String id;
  @override
  final String studentId;
  final String titleEn;
  final String titleAr;
  final String subject;
  @override
  final String status;
  @override
  final String? dueDate;
  final String? teacherName;

  String displayTitle({required bool rtl}) =>
      rtl ? (titleAr.isNotEmpty ? titleAr : titleEn) : (titleEn.isNotEmpty ? titleEn : titleAr);

  factory HomeworkRecord.fromJson(Map<String, dynamic> json) {
    return HomeworkRecord(
      id: json['id'] as String? ?? '',
      studentId: json['student_id'] as String? ?? '',
      titleEn: json['title_en'] as String? ?? '',
      titleAr: json['title_ar'] as String? ?? '',
      subject: json['subject'] as String? ?? '',
      status: json['status'] as String? ?? 'assigned',
      dueDate: json['due_date'] as String?,
      teacherName: json['teacher_name'] as String?,
    );
  }
}

class AnnouncementRecord {
  const AnnouncementRecord({
    required this.id,
    required this.titleEn,
    required this.titleAr,
    required this.bodyEn,
    required this.bodyAr,
    required this.priority,
    this.scheduledDate,
  });

  final String id;
  final String titleEn;
  final String titleAr;
  final String bodyEn;
  final String bodyAr;
  final String priority;
  final String? scheduledDate;

  String displayTitle({required bool rtl}) =>
      rtl ? (titleAr.isNotEmpty ? titleAr : titleEn) : (titleEn.isNotEmpty ? titleEn : titleAr);

  String displayBody({required bool rtl}) =>
      rtl ? (bodyAr.isNotEmpty ? bodyAr : bodyEn) : (bodyEn.isNotEmpty ? bodyEn : bodyAr);

  factory AnnouncementRecord.fromJson(Map<String, dynamic> json) {
    return AnnouncementRecord(
      id: json['id'] as String? ?? '',
      titleEn: json['title_en'] as String? ?? '',
      titleAr: json['title_ar'] as String? ?? '',
      bodyEn: json['body_en'] as String? ?? '',
      bodyAr: json['body_ar'] as String? ?? '',
      priority: json['priority'] as String? ?? 'normal',
      scheduledDate: json['scheduled_date'] as String? ?? json['created_at'] as String?,
    );
  }
}

class MessageRecord {
  const MessageRecord({
    required this.id,
    required this.subject,
    required this.content,
    this.fromName,
    this.messageType,
    this.createdAt,
    this.isRead,
  });

  final String id;
  final String subject;
  final String content;
  final String? fromName;
  final String? messageType;
  final String? createdAt;
  final bool? isRead;

  factory MessageRecord.fromJson(Map<String, dynamic> json) {
    return MessageRecord(
      id: json['id'] as String? ?? '',
      subject: json['subject'] as String? ?? '',
      content: json['content'] as String? ?? '',
      fromName: json['from_user_name'] as String?,
      messageType: json['message_type'] as String?,
      createdAt: json['created_at'] as String?,
      isRead: json['is_read'] as bool?,
    );
  }
}

class NotificationRecord {
  const NotificationRecord({
    required this.id,
    required this.title,
    required this.body,
    required this.isRead,
    this.createdAt,
  });

  final String id;
  final String title;
  final String body;
  final bool isRead;
  final String? createdAt;

  factory NotificationRecord.fromJson(Map<String, dynamic> json) {
    return NotificationRecord(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      isRead: json['is_read'] as bool? ?? false,
      createdAt: json['created_at'] as String?,
    );
  }
}

class PaymentRecord {
  const PaymentRecord({
    required this.id,
    required this.amount,
    this.invoiceNumber,
    this.studentName,
    this.date,
    this.status,
  });

  final String id;
  final double amount;
  final String? invoiceNumber;
  final String? studentName;
  final String? date;
  final String? status;

  factory PaymentRecord.fromJson(Map<String, dynamic> json) {
    return PaymentRecord(
      id: json['id'] as String? ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      invoiceNumber: json['invoice_number'] as String?,
      studentName: json['student_name'] as String?,
      date: json['date'] as String?,
      status: json['status'] as String?,
    );
  }
}

class ContractRecord {
  const ContractRecord({
    required this.id,
    required this.studentId,
    this.templateName,
    this.status,
    this.signedAt,
  });

  final String id;
  final String studentId;
  final String? templateName;
  final String? status;
  final String? signedAt;

  factory ContractRecord.fromJson(Map<String, dynamic> json) {
    return ContractRecord(
      id: json['id'] as String? ?? '',
      studentId: json['student_id'] as String? ?? '',
      templateName: json['template_name'] as String?,
      status: json['status'] as String?,
      signedAt: json['signed_at'] as String?,
    );
  }
}

class AdmissionDocument {
  const AdmissionDocument({
    required this.key,
    required this.labelEn,
    required this.labelAr,
    required this.uploaded,
    this.storagePath,
  });

  final String key;
  final String labelEn;
  final String labelAr;
  final bool uploaded;
  final String? storagePath;

  factory AdmissionDocument.fromJson(Map<String, dynamic> json) {
    return AdmissionDocument(
      key: json['key'] as String? ?? '',
      labelEn: json['label_en'] as String? ?? '',
      labelAr: json['label_ar'] as String? ?? '',
      uploaded: json['uploaded'] as bool? ?? false,
      storagePath: json['storage_path'] as String?,
    );
  }
}

class ApplicationRecord {
  const ApplicationRecord({
    required this.id,
    required this.studentId,
    this.applicationNumber,
    this.stage,
    this.documentStatus,
    this.documents = const [],
  });

  final String id;
  final String studentId;
  final String? applicationNumber;
  final String? stage;
  final String? documentStatus;
  final List<AdmissionDocument> documents;

  factory ApplicationRecord.fromJson(Map<String, dynamic> json) {
    return ApplicationRecord(
      id: json['id'] as String? ?? '',
      studentId: json['student_id'] as String? ?? '',
      applicationNumber: json['application_number'] as String?,
      stage: json['stage'] as String?,
      documentStatus: json['document_status'] as String?,
      documents: [
        for (final doc in (json['documents'] as List? ?? const []))
          if (doc is Map<String, dynamic>) AdmissionDocument.fromJson(doc),
      ],
    );
  }
}

class CanteenWallet {
  const CanteenWallet({required this.studentId, required this.balance});

  final String studentId;
  final double balance;

  factory CanteenWallet.fromJson(Map<String, dynamic> json) {
    return CanteenWallet(
      studentId: json['student_id'] as String? ?? '',
      balance: (json['balance'] as num?)?.toDouble() ?? 0,
    );
  }
}

class CanteenTransaction {
  const CanteenTransaction({
    required this.id,
    required this.transactionType,
    required this.amount,
    required this.balanceAfter,
    this.transactionDate,
  });

  final String id;
  final String transactionType;
  final double amount;
  final double balanceAfter;
  final String? transactionDate;

  factory CanteenTransaction.fromJson(Map<String, dynamic> json) {
    return CanteenTransaction(
      id: json['id'] as String? ?? '',
      transactionType: json['transaction_type'] as String? ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      balanceAfter: (json['balance_after'] as num?)?.toDouble() ?? 0,
      transactionDate: json['transaction_date'] as String?,
    );
  }
}

class StoreProduct {
  const StoreProduct({
    required this.id,
    required this.nameEn,
    required this.nameAr,
    required this.category,
    required this.fulfillmentMode,
    this.pricePurchase,
    this.priceRental,
    this.stockQty = 0,
    this.isBookable = false,
  });

  final String id;
  final String nameEn;
  final String nameAr;
  final String category;
  final String fulfillmentMode;
  final double? pricePurchase;
  final double? priceRental;
  final int stockQty;
  final bool isBookable;

  String displayName({required bool rtl}) =>
      rtl ? (nameAr.isNotEmpty ? nameAr : nameEn) : (nameEn.isNotEmpty ? nameEn : nameAr);

  factory StoreProduct.fromJson(Map<String, dynamic> json) {
    return StoreProduct(
      id: json['id'] as String? ?? '',
      nameEn: json['name_en'] as String? ?? '',
      nameAr: json['name_ar'] as String? ?? '',
      category: json['category'] as String? ?? 'other',
      fulfillmentMode: json['fulfillment_mode'] as String? ?? 'purchase',
      pricePurchase: (json['price_purchase'] as num?)?.toDouble(),
      priceRental: (json['price_rental'] as num?)?.toDouble(),
      stockQty: (json['stock_qty'] as num?)?.toInt() ?? 0,
      isBookable: json['is_bookable'] == true,
    );
  }
}

class StoreSlot {
  const StoreSlot({
    required this.startsAt,
    required this.endsAt,
    required this.available,
  });

  final String startsAt;
  final String endsAt;
  final bool available;

  factory StoreSlot.fromJson(Map<String, dynamic> json) {
    return StoreSlot(
      startsAt: json['starts_at'] as String? ?? '',
      endsAt: json['ends_at'] as String? ?? '',
      available: json['available'] == true,
    );
  }
}

class StoreOrder {
  const StoreOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.totalAmount,
    this.invoiceId,
  });

  final String id;
  final String orderNumber;
  final String status;
  final double totalAmount;
  final String? invoiceId;

  factory StoreOrder.fromJson(Map<String, dynamic> json) {
    return StoreOrder(
      id: json['id'] as String? ?? '',
      orderNumber: json['order_number'] as String? ?? '',
      status: json['status'] as String? ?? '',
      totalAmount: (json['total_amount'] as num?)?.toDouble() ?? 0,
      invoiceId: json['invoice_id'] as String?,
    );
  }
}

class StoreCheckoutResult {
  const StoreCheckoutResult({required this.invoiceId, required this.paymentLink});

  final String invoiceId;
  final String paymentLink;

  factory StoreCheckoutResult.fromJson(Map<String, dynamic> json) {
    final invoice = json['invoice'] is Map ? Map<String, dynamic>.from(json['invoice'] as Map) : json;
    return StoreCheckoutResult(
      invoiceId: invoice['id'] as String? ?? '',
      paymentLink: json['payment_link'] as String? ?? '',
    );
  }
}

List<T> parseList<T>(dynamic body, T Function(Map<String, dynamic>) map) {
  final rows = body is Map ? body['data'] : body;
  if (rows is! List) return const [];
  return [
    for (final row in rows)
      if (row is Map<String, dynamic>) map(row),
  ];
}

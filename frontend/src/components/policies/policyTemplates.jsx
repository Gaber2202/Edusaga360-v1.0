// 50+ HR Policy Templates for Saudi Arabian Schools
export const POLICY_TEMPLATES = [
  // === HIRING & ONBOARDING (التوظيف والتعيين) ===
  { category: "hiring_onboarding", title_ar: "سياسة التوظيف والاختيار", title_en: "Recruitment and Selection Policy", body_ar: "تهدف هذه السياسة إلى ضمان عملية توظيف عادلة وشفافة...", body_en: "This policy aims to ensure fair and transparent recruitment...", tags: ["recruitment", "fairness"] },
  { category: "hiring_onboarding", title_ar: "سياسة الاستقدام من الخارج", title_en: "International Recruitment Policy", body_ar: "تنظم هذه السياسة استقدام الموظفين من خارج المملكة...", body_en: "This policy regulates recruitment from outside the Kingdom...", tags: ["international", "visa"] },
  { category: "hiring_onboarding", title_ar: "سياسة التعريف والتدريب", title_en: "Onboarding and Orientation Policy", body_ar: "يجب تزويد جميع الموظفين الجدد بتدريب شامل...", body_en: "All new employees must receive comprehensive orientation...", tags: ["onboarding", "training"] },
  { category: "hiring_onboarding", title_ar: "سياسة التدريب والتطوير", title_en: "Training and Development Policy", body_ar: "تلتزم المدرسة بتطوير مهارات الموظفين بشكل مستمر...", body_en: "The school commits to continuous skill development...", tags: ["development", "training"] },

  // === PROBATION & CONFIRMATION (فترة التجربة) ===
  { category: "probation_confirmation", title_ar: "سياسة فترة التجربة", title_en: "Probation Period Policy", body_ar: "فترة التجربة الأولية مدتها {ProbationMonths} أشهر...", body_en: "The probation period is {ProbationMonths} months...", tags: ["probation", "confirmation"] },
  { category: "probation_confirmation", title_ar: "سياسة التقييم الاختباري", title_en: "Probation Assessment Policy", body_ar: "يتم تقييم أداء الموظف الجديد بشكل دوري...", body_en: "New employee performance is assessed regularly...", tags: ["assessment", "evaluation"] },

  // === WORKING HOURS & ATTENDANCE (ساعات العمل والحضور) ===
  { category: "working_hours_attendance", title_ar: "سياسة ساعات العمل", title_en: "Working Hours Policy", body_ar: "ساعات العمل الرسمية من {WorkingHours}...", body_en: "Official working hours are {WorkingHours}...", tags: ["working_hours", "attendance"] },
  { category: "working_hours_attendance", title_ar: "سياسة الحضور والغياب", title_en: "Attendance and Absence Policy", body_ar: "يجب على جميع الموظفين الالتزام بالحضور في الوقت المحدد...", body_en: "All employees must comply with punctual attendance...", tags: ["attendance", "discipline"] },
  { category: "working_hours_attendance", title_ar: "سياسة الإجازات المرضية", title_en: "Sick Leave Policy", body_ar: "يحق للموظف {SickLeaveDays} أيام إجازة مرضية سنوياً...", body_en: "Employees get {SickLeaveDays} days sick leave annually...", tags: ["sick_leave", "health"] },
  { category: "working_hours_attendance", title_ar: "سياسة التأخر والغياب", title_en: "Lateness and Absence Policy", body_ar: "التأخر المتكرر سيتم معاملته كمخالفة نظامية...", body_en: "Repeated lateness is treated as a disciplinary violation...", tags: ["discipline", "attendance"] },

  // === LEAVE POLICIES (الإجازات) ===
  { category: "leave_policies", title_ar: "سياسة الإجازات السنوية", title_en: "Annual Leave Policy", body_ar: "يحق لكل موظف {LeaveDays} يوماً إجازة سنوية...", body_en: "Every employee gets {LeaveDays} days annual leave...", tags: ["annual_leave", "entitlement"] },
  { category: "leave_policies", title_ar: "سياسة الإجازات العارضة", title_en: "Casual Leave Policy", body_ar: "يمكن للموظف طلب إجازات عارضة بموافقة المدير...", body_en: "Employees may request casual leave with manager approval...", tags: ["casual_leave"] },
  { category: "leave_policies", title_ar: "سياسة إجازات الأمومة والأبوة", title_en: "Maternity and Paternity Leave Policy", body_ar: "الموظفة تستحق إجازة أمومة مدتها 60 يوم...", body_en: "Female employees get 60 days maternity leave...", tags: ["maternity", "family"] },
  { category: "leave_policies", title_ar: "سياسة إجازات الحج والعمرة", title_en: "Hajj and Umrah Leave Policy", body_ar: "الموظف المسلم يحق له إجازة حج مرة واحدة...", body_en: "Muslim employees get Hajj leave once...", tags: ["religious", "leave"] },

  // === PAYROLL & DEDUCTIONS (الرواتب والاستقطاعات) ===
  { category: "payroll_deductions", title_ar: "سياسة الرواتب والمكافآت", title_en: "Salary and Compensation Policy", body_ar: "يتم صرف الرواتب في الموعد المحدد...", body_en: "Salaries are paid on scheduled date...", tags: ["payroll", "compensation"] },
  { category: "payroll_deductions", title_ar: "سياسة الخصومات من الراتب", title_en: "Salary Deduction Policy", body_ar: "لا يجوز خصم أكثر من 50% من الراتب الشهري...", body_en: "No more than 50% monthly salary may be deducted...", tags: ["deductions", "payroll"] },
  { category: "payroll_deductions", title_ar: "سياسة المكافآت والحوافز", title_en: "Incentives and Bonus Policy", body_ar: "قد يحصل الموظف على مكافآت بناءً على الأداء...", body_en: "Employees may receive bonuses based on performance...", tags: ["incentives", "bonus"] },

  // === OVERTIME (العمل الإضافي) ===
  { category: "overtime", title_ar: "سياسة العمل الإضافي", title_en: "Overtime Policy", body_ar: "يتم دفع العمل الإضافي بمعدل زيادة 50%...", body_en: "Overtime is paid at 50% above hourly rate...", tags: ["overtime", "compensation"] },
  { category: "overtime", title_ar: "سياسة الراحة المعوضة", title_en: "Compensatory Time Off Policy", body_ar: "يمكن للموظف اختيار الراحة المعوضة بدلاً من المكافأة...", body_en: "Employees may opt for compensatory time instead of payment...", tags: ["overtime", "rest"] },

  // === DISCIPLINARY & VIOLATIONS (الجزاءات والمخالفات) ===
  { category: "disciplinary_violations", title_ar: "سياسة الانضباط الوظيفي", title_en: "Disciplinary Policy", body_ar: "المخالفات تتدرج من تحذير إلى إنهاء الخدمة...", body_en: "Violations range from warning to termination...", tags: ["discipline", "violations"] },
  { category: "disciplinary_violations", title_ar: "سياسة المخالفات الخفيفة", title_en: "Minor Violations Policy", body_ar: "المخالفات الخفيفة تشمل التأخر والملابس غير الملائمة...", body_en: "Minor violations include late arrival and improper dress...", tags: ["violations", "discipline"] },
  { category: "disciplinary_violations", title_ar: "سياسة المخالفات الخطيرة", title_en: "Serious Violations Policy", body_ar: "المخالفات الخطيرة قد تؤدي للإنهاء الفوري...", body_en: "Serious violations may result in immediate termination...", tags: ["violations", "serious"] },

  // === REMOTE/HYBRID (العمل عن بُعد) ===
  { category: "remote_hybrid", title_ar: "سياسة العمل عن بُعد والهجين", title_en: "Remote and Hybrid Work Policy", body_ar: "بعض الأدوار قد تسمح بالعمل من المنزل...", body_en: "Some roles may allow working from home...", tags: ["remote", "hybrid"] },

  // === CODE OF CONDUCT (مدونة السلوك) ===
  { category: "code_of_conduct", title_ar: "مدونة السلوك والأخلاقيات", title_en: "Code of Conduct and Ethics", body_ar: "يجب على جميع الموظفين الالتزام بأعلى معايير السلوك...", body_en: "All employees must maintain highest conduct standards...", tags: ["ethics", "conduct"] },

  // === DATA PRIVACY & CONFIDENTIALITY (السرية وحماية البيانات) ===
  { category: "data_privacy", title_ar: "سياسة حماية البيانات والسرية", title_en: "Data Protection and Confidentiality Policy", body_ar: "جميع البيانات محمية بموجب القوانين...", body_en: "All data is protected by law...", tags: ["privacy", "confidentiality"] },

  // === COMPLAINTS & GRIEVANCES (الشكاوى والتظلمات) ===
  { category: "complaints_grievances", title_ar: "سياسة التعامل مع الشكاوى", title_en: "Grievance and Complaint Resolution Policy", body_ar: "لكل موظف الحق في تقديم شكوى رسمية...", body_en: "Every employee has right to file formal complaint...", tags: ["grievance", "complaints"] },

  // === TERMINATION & EOSB (إنهاء الخدمة ومكافأة نهاية الخدمة) ===
  { category: "termination_eosb", title_ar: "سياسة إنهاء الخدمة", title_en: "Termination of Employment Policy", body_ar: "يجب اتباع إجراءات محددة عند الإنهاء...", body_en: "Specific procedures must be followed for termination...", tags: ["termination", "eosb"] },
  { category: "termination_eosb", title_ar: "سياسة مكافأة نهاية الخدمة", title_en: "End of Service Benefits Policy", body_ar: "يحق للموظف مكافأة نهاية الخدمة حسب القانون...", body_en: "Employees are entitled to EOSB per law...", tags: ["eosb", "benefits"] },

  // === CHILD PROTECTION & SAFEGUARDING (حماية الطفل) ===
  { category: "child_protection", title_ar: "سياسة حماية الطفل والسلامة", title_en: "Child Protection and Safeguarding Policy", body_ar: "سلامة الأطفال هي أولويتنا الأساسية...", body_en: "Child safety is our primary priority...", tags: ["child_protection", "safeguarding"] },
  { category: "child_protection", title_ar: "سياسة فحص الموظفين", title_en: "Staff Screening and Vetting Policy", body_ar: "جميع الموظفين يخضعون للفحص الأمني...", body_en: "All employees undergo security screening...", tags: ["screening", "vetting"] },

  // === STAFF BENEFITS & DISCOUNTS (خصومات الموظفين ورسوم الأبناء) ===
  { category: "staff_benefits", title_ar: "سياسة خصومات الموظفين على الرسوم", title_en: "Staff Tuition Discount Policy", body_ar: "موظفو المدرسة يحصلون على خصم {StaffDiscountPercentage}%...", body_en: "Staff get {StaffDiscountPercentage}% discount on tuition...", tags: ["benefits", "discount"] },
  { category: "staff_benefits", title_ar: "سياسة التأمين الصحي", title_en: "Employee Health Insurance Policy", body_ar: "المدرسة توفر تأميناً صحياً شاملاً للموظفين...", body_en: "School provides comprehensive health insurance...", tags: ["insurance", "health"] },

  // === SAUDIZATION & NATIONALIZATION (السعودة والتوطين) ===
  { category: "saudization", title_ar: "سياسة التوطين (السعودة)", title_en: "Saudization / Nitaqat Compliance Policy", body_ar: "تلتزم المدرسة بتحقيق نسب السعودة المطلوبة حسب نظام نطاقات...", body_en: "The school commits to meeting Nitaqat Saudization ratios...", tags: ["saudization", "nitaqat"] },
  { category: "saudization", title_ar: "سياسة تطوير الكوادر الوطنية", title_en: "National Talent Development Policy", body_ar: "تدريب وتأهيل الموظفين السعوديين للمناصب القيادية...", body_en: "Training and qualifying Saudi employees for leadership positions...", tags: ["development", "saudization"] },

  // === HEALTH & SAFETY (الصحة والسلامة) ===
  { category: "health_safety", title_ar: "سياسة الصحة والسلامة المهنية", title_en: "Occupational Health and Safety Policy", body_ar: "توفير بيئة عمل آمنة وصحية لجميع العاملين...", body_en: "Providing a safe and healthy working environment...", tags: ["health", "safety"] },
  { category: "health_safety", title_ar: "سياسة الطوارئ والإخلاء", title_en: "Emergency and Evacuation Policy", body_ar: "خطة الطوارئ والإخلاء في حالات الحريق والزلازل...", body_en: "Emergency and evacuation plan for fire and earthquake...", tags: ["emergency", "safety"] },
  { category: "health_safety", title_ar: "سياسة الوقاية من الأوبئة", title_en: "Pandemic Prevention Policy", body_ar: "إجراءات الوقاية والتعامل مع الأوبئة والأمراض المعدية...", body_en: "Procedures for pandemic prevention and infectious disease management...", tags: ["pandemic", "health"] },

  // === PROFESSIONAL DEVELOPMENT (التطوير المهني) ===
  { category: "professional_development", title_ar: "سياسة التطوير المهني المستمر", title_en: "Continuous Professional Development Policy", body_ar: "يلتزم كل موظف بإكمال عدد محدد من ساعات التطوير المهني سنوياً...", body_en: "Each employee must complete specified CPD hours annually...", tags: ["cpd", "development"] },
  { category: "professional_development", title_ar: "سياسة الابتعاث والدراسة", title_en: "Study Leave and Scholarship Policy", body_ar: "يمكن للموظف التقدم لبرنامج الابتعاث الداخلي...", body_en: "Employees may apply for internal scholarship program...", tags: ["scholarship", "education"] },
  { category: "professional_development", title_ar: "سياسة حضور المؤتمرات", title_en: "Conference Attendance Policy", body_ar: "الموافقة على حضور المؤتمرات التعليمية المحلية والدولية...", body_en: "Approval for attending local and international education conferences...", tags: ["conference", "development"] },

  // === COMMUNICATION (التواصل) ===
  { category: "communication", title_ar: "سياسة التواصل الداخلي", title_en: "Internal Communication Policy", body_ar: "قنوات التواصل الرسمية المعتمدة في المدرسة...", body_en: "Official approved communication channels in the school...", tags: ["communication", "internal"] },
  { category: "communication", title_ar: "سياسة استخدام وسائل التواصل الاجتماعي", title_en: "Social Media Policy", body_ar: "ضوابط استخدام وسائل التواصل الاجتماعي المتعلقة بالمدرسة...", body_en: "Guidelines for school-related social media usage...", tags: ["social_media", "communication"] },
  { category: "communication", title_ar: "سياسة التواصل مع أولياء الأمور", title_en: "Parent Communication Policy", body_ar: "آليات ومعايير التواصل مع أولياء الأمور...", body_en: "Mechanisms and standards for parent communication...", tags: ["parents", "communication"] },

  // === TRAVEL & EXPENSES (السفر والمصروفات) ===
  { category: "travel_expenses", title_ar: "سياسة السفر والانتقال", title_en: "Travel and Transportation Policy", body_ar: "ضوابط وإجراءات سفر الموظفين لأغراض العمل...", body_en: "Guidelines and procedures for business travel...", tags: ["travel", "transportation"] },
  { category: "travel_expenses", title_ar: "سياسة المصروفات والسلف", title_en: "Expense Reimbursement Policy", body_ar: "إجراءات طلب واسترداد المصروفات والسلف النقدية...", body_en: "Procedures for requesting and reimbursing expenses...", tags: ["expenses", "reimbursement"] },
  { category: "travel_expenses", title_ar: "سياسة بدل الإنتقال والسكن", title_en: "Housing and Transport Allowance Policy", body_ar: "استحقاقات بدلات الإنتقال والسكن للموظفين...", body_en: "Entitlements for housing and transport allowances...", tags: ["allowance", "housing"] },

  // === IT & TECHNOLOGY (تقنية المعلومات) ===
  { category: "it_technology", title_ar: "سياسة استخدام أجهزة الكمبيوتر", title_en: "Computer and IT Equipment Policy", body_ar: "ضوابط استخدام أجهزة الكمبيوتر والمعدات التقنية...", body_en: "Guidelines for computer and IT equipment usage...", tags: ["it", "equipment"] },
  { category: "it_technology", title_ar: "سياسة أمن المعلومات", title_en: "Information Security Policy", body_ar: "حماية المعلومات والبيانات الإلكترونية للمدرسة...", body_en: "Protecting electronic information and school data...", tags: ["security", "information"] },

  // === DRESS CODE (الزي والمظهر) ===
  { category: "dress_code", title_ar: "سياسة الزي والمظهر العام", title_en: "Dress Code and Appearance Policy", body_ar: "المعايير المطلوبة للمظهر والزي في بيئة العمل...", body_en: "Required standards for appearance and dress at work...", tags: ["dress_code", "appearance"] },

  // === ADDITIONAL SAUDI-SPECIFIC ===
  { category: "leave_policies", title_ar: "سياسة إجازة الزواج", title_en: "Marriage Leave Policy", body_ar: "يحق للموظف إجازة زواج مدتها 5 أيام مدفوعة...", body_en: "Employees get 5 days paid marriage leave...", tags: ["marriage", "leave"] },
  { category: "leave_policies", title_ar: "سياسة إجازة الوفاة", title_en: "Bereavement Leave Policy", body_ar: "يحق للموظف 5 أيام إجازة وفاة للأقارب من الدرجة الأولى...", body_en: "5 days bereavement leave for first-degree relatives...", tags: ["bereavement", "leave"] },
  { category: "leave_policies", title_ar: "سياسة الإجازة بدون راتب", title_en: "Unpaid Leave Policy", body_ar: "يجوز للموظف طلب إجازة بدون راتب بموافقة الإدارة...", body_en: "Employees may request unpaid leave with management approval...", tags: ["unpaid", "leave"] },
  { category: "code_of_conduct", title_ar: "سياسة مكافحة التحرش", title_en: "Anti-Harassment Policy", body_ar: "عدم التسامح مطلقاً مع أي شكل من أشكال التحرش...", body_en: "Zero tolerance for any form of harassment...", tags: ["harassment", "conduct"] },
  { category: "code_of_conduct", title_ar: "سياسة تضارب المصالح", title_en: "Conflict of Interest Policy", body_ar: "يجب على الموظفين الإفصاح عن أي تضارب محتمل في المصالح...", body_en: "Employees must disclose any potential conflicts of interest...", tags: ["conflict", "ethics"] },
  { category: "staff_benefits", title_ar: "سياسة المكافآت السنوية", title_en: "Annual Bonus Policy", body_ar: "معايير وشروط استحقاق المكافأة السنوية...", body_en: "Criteria and conditions for annual bonus eligibility...", tags: ["bonus", "benefits"] },
  { category: "staff_benefits", title_ar: "سياسة بدل التعليم لأبناء الموظفين", title_en: "Employee Children Education Allowance", body_ar: "بدل تعليم لأبناء الموظفين في مدارس أخرى...", body_en: "Education allowance for employee children at other schools...", tags: ["education", "benefits"] },
  { category: "termination_eosb", title_ar: "سياسة الاستقالة وفترة الإشعار", title_en: "Resignation and Notice Period Policy", body_ar: "فترة الإشعار المطلوبة للاستقالة وإجراءات المغادرة...", body_en: "Required notice period and exit procedures...", tags: ["resignation", "notice"] },
  { category: "termination_eosb", title_ar: "سياسة إخلاء الطرف", title_en: "Clearance and Exit Policy", body_ar: "إجراءات إخلاء الطرف وتسليم العهد...", body_en: "Clearance procedures and handover of responsibilities...", tags: ["clearance", "exit"] },
  { category: "child_protection", title_ar: "سياسة الرقابة والمراقبة", title_en: "Supervision and Monitoring Policy", body_ar: "متطلبات الإشراف والمراقبة خلال الأنشطة المدرسية...", body_en: "Supervision requirements during school activities...", tags: ["supervision", "monitoring"] },
  { category: "data_privacy", title_ar: "سياسة استخدام البريد الإلكتروني", title_en: "Email Usage Policy", body_ar: "ضوابط استخدام البريد الإلكتروني الرسمي للمدرسة...", body_en: "Guidelines for using official school email...", tags: ["email", "privacy"] }
];

export const POLICY_CATEGORIES = {
  hiring_onboarding: { ar: "التوظيف والتعيين", en: "Hiring & Onboarding" },
  probation_confirmation: { ar: "فترة التجربة", en: "Probation & Confirmation" },
  working_hours_attendance: { ar: "ساعات العمل والحضور", en: "Working Hours & Attendance" },
  leave_policies: { ar: "الإجازات", en: "Leave Policies" },
  payroll_deductions: { ar: "الرواتب والاستقطاعات", en: "Payroll & Deductions" },
  overtime: { ar: "العمل الإضافي", en: "Overtime" },
  disciplinary_violations: { ar: "الجزاءات والمخالفات", en: "Disciplinary & Violations" },
  remote_hybrid: { ar: "العمل عن بُعد", en: "Remote/Hybrid Work" },
  code_of_conduct: { ar: "مدونة السلوك", en: "Code of Conduct" },
  data_privacy: { ar: "السرية وحماية البيانات", en: "Data Privacy & Confidentiality" },
  complaints_grievances: { ar: "الشكاوى والتظلمات", en: "Complaints & Grievances" },
  termination_eosb: { ar: "إنهاء الخدمة ومكافأة نهاية الخدمة", en: "Termination & EOSB" },
  child_protection: { ar: "حماية الطفل", en: "Child Protection & Safeguarding" },
  staff_benefits: { ar: "خصومات الموظفين والمزايا", en: "Staff Benefits" },
  saudization: { ar: "السعودة والتوطين", en: "Saudization & Nationalization" },
  health_safety: { ar: "الصحة والسلامة", en: "Health & Safety" },
  professional_development: { ar: "التطوير المهني", en: "Professional Development" },
  communication: { ar: "التواصل", en: "Communication" },
  travel_expenses: { ar: "السفر والمصروفات", en: "Travel & Expenses" },
  it_technology: { ar: "تقنية المعلومات", en: "IT & Technology" },
  dress_code: { ar: "الزي والمظهر", en: "Dress Code" }
};

export const COMPLIANCE_CHECKLIST_ITEMS = [
  { key: "leave_entitlements", ar: "استحقاقات الإجازات", en: "Leave Entitlements" },
  { key: "working_hours", ar: "ساعات العمل", en: "Working Hours" },
  { key: "overtime_rules", ar: "قواعد العمل الإضافي", en: "Overtime Rules" },
  { key: "termination_process", ar: "عملية الإنهاء", en: "Termination Process" },
  { key: "eosb_references", ar: "مراجع مكافأة نهاية الخدمة", en: "EOSB References" },
  { key: "ksa_labour_law", ar: "قانون العمل السعودي", en: "KSA Labour Law Compliant" },
  { key: "child_safety", ar: "سلامة الطفل", en: "Child Safety Standards" },
  { key: "data_protection", ar: "حماية البيانات", en: "Data Protection" }
];
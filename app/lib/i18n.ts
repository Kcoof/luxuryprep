// M7 — bilingual AR/EN i18n helpers (client-safe, no hooks).
//
// Default locale: Arabic (RTL). Preference persists in localStorage under
// `luxuryprep_locale` ("ar" | "en"). Incremental scope: everything shipped
// or touched in M7 (login gateway, cashier dashboard + closing wizard
// chrome, IT ticket modal, admin ticket queue). The auditor portal stays
// Arabic-only this round by decision — do not blanket-translate it here.
//
// R3 (F1): `admin.status.in_progress` added alongside the camelCase key so
// DB snake_case enum interpolation can never render a raw key.
//
// R4 (F3): stable runtime codes end-to-end. /api/analyze-closing-image
// returns `code` values matching wizard.ai.err.* keys; closings.ts pushes
// wizard.warn.* warning keys and throws wizard.saveError.* keys as
// Error.message. `hasTranslation()` lets callers distinguish a stable code
// from arbitrary prose without regex sniffing.

export type Locale = "ar" | "en";

export const LOCALE_STORAGE_KEY = "luxuryprep_locale";
export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: unknown): value is Locale {
  return value === "ar" || value === "en";
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // storage unavailable — session-only preference
  }
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

type Entry = { ar: string; en: string };

const DICTIONARY: Record<string, Entry> = {
  // -- common ----------------------------------------------------------
  "common.logout": { ar: "تسجيل الخروج", en: "Log out" },
  "common.cancel": { ar: "إلغاء", en: "Cancel" },
  "common.close": { ar: "إغلاق", en: "Close" },
  "common.save": { ar: "حفظ", en: "Save" },
  "common.saving": { ar: "جارٍ الحفظ…", en: "Saving…" },
  "common.refresh": { ar: "تحديث", en: "Refresh" },
  "common.retry": { ar: "إعادة المحاولة", en: "Try again" },
  "common.next": { ar: "التالي", en: "Next" },
  "common.back": { ar: "السابق", en: "Back" },
  "common.branch": { ar: "الفرع", en: "Branch" },
  "common.branchPlaceholder": {
    ar: "— اختر الفرع —",
    en: "— Select branch —",
  },
  "common.branchesLoading": {
    ar: "جارٍ تحميل الفروع…",
    en: "Loading branches…",
  },
  "common.branchesError": {
    ar: "تعذّر تحميل قائمة الفروع من Supabase.",
    en: "Could not load branches from Supabase.",
  },
  "common.checkingSession": {
    ar: "جارٍ التحقق من الجلسة…",
    en: "Checking session…",
  },

  // -- login -----------------------------------------------------------
  "login.title": {
    ar: "بوابة الإغلاق المالي والمراجعة",
    en: "Financial Closing & Audit Gateway",
  },
  "login.subtitle": { ar: "تسجيل الدخول", en: "Sign in" },
  "login.portalHint": {
    ar: "اختر بوابتك للمتابعة",
    en: "Choose your portal to continue",
  },
  "login.tab.cashier": { ar: "الفرع / الكاشير", en: "Branch / Cashier" },
  "login.tab.finance": { ar: "المراجعة المالية", en: "Finance Audit" },
  "login.tab.it": { ar: "مسؤول IT", en: "IT Admin" },
  "login.role.cashier": { ar: "كاشير الفرع", en: "Branch Cashier" },
  "login.role.manager": { ar: "مدير الفرع", en: "Branch Manager" },
  "login.role.auditor": { ar: "المراجعة المالية", en: "Financial Auditor" },
  "login.role.admin": { ar: "مسؤول IT", en: "IT Admin" },
  "login.sessionActive": { ar: "جلسة نشطة:", en: "Active session:" },
  "login.continue": { ar: "متابعة", en: "Continue" },
  "login.branchIdLabel": { ar: "أو أدخل رقم الفرع", en: "Or enter branch ID" },
  "login.branchIdHint": {
    ar: "يجب أن يطابق فرعًا من القائمة (B01…) — يُتحقق من الرقم مقابل قائمة الفروع.",
    en: "Must match a branch from the list (B01…) — the ID is validated against the branch list.",
  },
  "login.username": { ar: "اسم المستخدم", en: "Username" },
  "login.password": { ar: "كلمة المرور", en: "Password" },
  "login.showPassword": { ar: "إظهار كلمة المرور", en: "Show password" },
  "login.hidePassword": { ar: "إخفاء كلمة المرور", en: "Hide password" },
  "login.signingIn": { ar: "جارٍ الدخول…", en: "Signing in…" },
  "login.submit.cashier": { ar: "دخول الكاشير", en: "Cashier sign in" },
  "login.submit.finance": {
    ar: "دخول المراجعة المالية",
    en: "Finance sign in",
  },
  "login.submit.it": { ar: "دخول مسؤول IT", en: "IT admin sign in" },
  "login.error.enterCredentials": {
    ar: "أدخل اسم المستخدم وكلمة المرور.",
    en: "Enter username and password.",
  },
  "login.error.invalid": { ar: "بيانات الدخول غير صحيحة.", en: "Invalid credentials." },
  "login.error.pickBranch": {
    ar: "اختر فرعًا من القائمة أو أدخل رقمه الصحيح (مثل B01).",
    en: "Pick a branch from the list or enter a valid ID (e.g. B01).",
  },
  "login.demoFooter": {
    ar: "وضع تجريبي — المراجعة المالية: finance / finance · مسؤول IT: admin / admin",
    en: "Demo mode — Finance: finance / finance · IT admin: admin / admin",
  },

  // -- cashier dashboard -------------------------------------------------
  "cashier.dashboard.title": { ar: "شاشة الفرع", en: "Branch Screen" },

  "cashier.home.greetingMorning": { ar: "صباح الخير", en: "Good morning" },
  "cashier.home.greetingAfternoon": { ar: "طاب يومك", en: "Good afternoon" },
  "cashier.home.greetingEvening": { ar: "مساء الخير", en: "Good evening" },
  "cashier.home.question": {
    ar: "كيف حالة الأجهزة والأنظمة في فرعك اليوم؟",
    en: "How are your devices and systems at your branch today?",
  },
  "cashier.home.card.checklist.title": {
    ar: "قائمة ما قبل الإقفال",
    en: "Pre-close checklist",
  },
  "cashier.home.card.it.title": { ar: "الدعم الفني", en: "IT support" },
  "cashier.home.card.it.cta": {
    ar: "فتح تذكرة دعم فني",
    en: "Open an IT ticket",
  },
  "cashier.home.closing.title": {
    ar: "الإقفال المالي اليومي",
    en: "Daily financial closing",
  },
  "cashier.home.closing.subtitle": {
    ar: "ابدأ خطوات الإقفال الثلاث وأرسل التقرير اليومي",
    en: "Start the 3-step closing and submit today's report",
  },
  "cashier.home.closing.cta": { ar: "ابدأ الإقفال", en: "Start closing" },
  "cashier.prep.title": {
    ar: "تحضيرات ما قبل الإقفال",
    en: "Pre-closing prep",
  },
  "cashier.openTicket": { ar: "فتح تذكرة IT", en: "Open IT ticket" },
  "cashier.checklist.title": {
    ar: "قائمة التحقق قبل الإغلاق",
    en: "Pre-close Checklist",
  },
  "cashier.checklist.progress": {
    ar: "{done} من {total} مكتملة",
    en: "{done} of {total} complete",
  },
  "cashier.checklist.reset": { ar: "إعادة تعيين", en: "Reset" },
  "cashier.checklist.note": {
    ar: "تُحفظ محليًا لهذا الفرع والتاريخ فقط — لا تُرسل إلى النظام.",
    en: "Saved locally for this branch and date only — never sent to the system.",
  },
  "cashier.checklist.item.cashCounted": {
    ar: "تم عدّ النقدية ومطابقتها مع النظام",
    en: "Cash counted and reconciled against the system",
  },
  "cashier.checklist.item.zReport": {
    ar: "تقرير Z جاهز ومرفوع",
    en: "Z-report ready and uploaded",
  },
  "cashier.checklist.item.mada": {
    ar: "تسوية مدى مكتملة",
    en: "Mada settlement completed",
  },
  "cashier.checklist.item.tips": { ar: "البقشيش مسجّل", en: "Tips recorded" },
  "cashier.checklist.item.safeDrop": {
    ar: "تم إيداع فائض النقدية في الخزنة",
    en: "Safe drop completed",
  },
  "cashier.checklist.item.manager": {
    ar: "تم إبلاغ مدير الفرع",
    en: "Manager notified",
  },
  "cashier.itstatus.title": { ar: "حالة الأنظمة (IT)", en: "System Status (IT)" },
  "cashier.itstatus.demo": {
    ar: "عرض توضيحي ثابت — غير متصل بأنظمة حقيقية.",
    en: "Static demo sample — not connected to live systems.",
  },
  "cashier.itstatus.foodics": { ar: "نقاط البيع Foodics", en: "Foodics POS" },
  "cashier.itstatus.mada": { ar: "أجهزة مدى", en: "Mada terminals" },
  "cashier.itstatus.printer": { ar: "الطابعة", en: "Receipt printer" },
  "cashier.itstatus.ok": { ar: "تعمل", en: "Operational" },
  "cashier.itstatus.watch": { ar: "تحت المراقبة", en: "Attention" },

  // -- IT ticket modal ----------------------------------------------------
  "ticket.title": { ar: "فتح تذكرة IT", en: "Open IT Ticket" },
  "ticket.branch": { ar: "الفرع", en: "Branch" },
  "ticket.category": { ar: "التصنيف", en: "Category" },
  "ticket.category.pos": { ar: "نقاط البيع", en: "POS" },
  "ticket.category.mada": { ar: "مدى", en: "Mada" },
  "ticket.category.printer": { ar: "الطابعة", en: "Printer" },
  "ticket.category.network": { ar: "الشبكة", en: "Network" },
  "ticket.category.foodics": { ar: "Foodics", en: "Foodics" },
  "ticket.category.other": { ar: "أخرى", en: "Other" },
  "ticket.priority": { ar: "الأولوية", en: "Priority" },
  "ticket.priority.low": { ar: "منخفضة", en: "Low" },
  "ticket.priority.normal": { ar: "عادية", en: "Normal" },
  "ticket.priority.high": { ar: "عالية", en: "High" },
  "ticket.priority.urgent": { ar: "عاجلة", en: "Urgent" },
  "ticket.subject": { ar: "الموضوع", en: "Subject" },
  "ticket.subjectPlaceholder": {
    ar: "مثال: الطابعة لا تطبع تقرير Z",
    en: "e.g. Printer not printing the Z-report",
  },
  "ticket.description": { ar: "الوصف", en: "Description" },
  "ticket.descriptionPlaceholder": {
    ar: "اشرح المشكلة بالتفصيل…",
    en: "Describe the issue in detail…",
  },
  "ticket.submit": { ar: "إرسال التذكرة", en: "Submit Ticket" },
  "ticket.submitting": { ar: "جارٍ الإرسال…", en: "Submitting…" },
  "ticket.error.required": {
    ar: "الموضوع والوصف مطلوبان.",
    en: "Subject and description are required.",
  },
  "ticket.error.notConfigured": {
    ar: "قاعدة البيانات غير مُهيّأة (Supabase) — تعذّر إرسال التذكرة.",
    en: "Database (Supabase) is not configured — could not submit the ticket.",
  },
  "ticket.error.request": {
    ar: "تعذّر إرسال التذكرة. حاول مرة أخرى.",
    en: "Could not submit the ticket. Try again.",
  },
  "ticket.success.title": { ar: "تم إنشاء التذكرة", en: "Ticket Created" },
  "ticket.success.id": { ar: "رقم التذكرة:", en: "Ticket ID:" },
  "ticket.success.note": {
    ar: "سيتابعها مسؤول IT من لوحة الإدارة.",
    en: "The IT admin will follow up from the admin console.",
  },

  // -- closing wizard chrome (M2–M6 logic untouched, strings localized) ----
  "wizard.title": {
    ar: "شاشة الكاشير — الإغلاق اليومي",
    en: "Cashier Screen — Daily Closing",
  },
  "wizard.steps.status": {
    ar: "الخطوة {current} من {total}",
    en: "Step {current} of {total}",
  },
  "wizard.step1.title": {
    ar: "الخطوة ١: اختيار الفرع والتاريخ",
    en: "Step 1: Branch & Date",
  },
  "wizard.step2.title": {
    ar: "الخطوة ٢: البيانات المالية",
    en: "Step 2: Financial Figures",
  },
  "wizard.branch.change": { ar: "تغيير الفرع", en: "Change branch" },
  "wizard.branch.changeConfirm": {
    ar: "تغيير الفرع؟ سيتم فقدان البيانات المدخلة.",
    en: "Change branch? Entered data will be lost.",
  },
  "wizard.branchesError": {
    ar: "تعذّر تحميل قائمة الفروع",
    en: "Could not load branches",
  },
  "wizard.date": { ar: "تاريخ العمل", en: "Business date" },
  "wizard.zreport": {
    ar: "صورة تقرير Z (اختياري)",
    en: "Z-report image (optional)",
  },
  "wizard.proofs": {
    ar: "صور إثبات الدفع (اختياري)",
    en: "Payment proof images (optional)",
  },
  "wizard.field.grossSales": { ar: "إجمالي المبيعات", en: "Gross sales" },
  "wizard.field.netSales": { ar: "صافي المبيعات", en: "Net sales" },
  "wizard.field.cashSystem": {
    ar: "النقدية حسب النظام",
    en: "Cash per system",
  },
  "wizard.field.actualCash": { ar: "النقدية الفعلية", en: "Actual cash" },
  "wizard.field.cashHanded": {
    ar: "النقدية المسلّمة",
    en: "Cash handed over",
  },
  "wizard.field.span": { ar: "سبان", en: "SPAN" },
  "wizard.field.deliveryApps": {
    ar: "تطبيقات التوصيل",
    en: "Delivery apps",
  },
  "wizard.field.reversals": {
    ar: "حركات مرتجعة",
    en: "Reversals & refunds",
  },
  "wizard.field.shortageExcess": {
    ar: "العجز / الزيادة",
    en: "Shortage / Excess",
  },
  "wizard.manualCash": {
    ar: "إدخال النقدية الفعلية يدويًا",
    en: "Enter actual cash manually",
  },
  "wizard.currency": { ar: "ر.س", en: "SAR" },
  "wizard.badge.ai": { ar: "ذكاء اصطناعي", en: "AI" },
  "wizard.badge.manual": { ar: "معدّل يدويًا", en: "Edited" },
  "wizard.field.invalid": { ar: "قيمة غير صحيحة", en: "Invalid value" },
  "wizard.fixValues": {
    ar: "صحّح القيم غير الصحيحة قبل الحفظ.",
    en: "Fix invalid values before saving.",
  },
  "wizard.fixValuesShort": {
    ar: "صحّح القيم غير الصحيحة قبل الحفظ",
    en: "Fix invalid values before saving",
  },
  "wizard.save": { ar: "حفظ الإقفال", en: "Save Closing" },
  "wizard.ai.title": {
    ar: "تحليل بالذكاء الاصطناعي",
    en: "AI Extraction",
  },
  "wizard.ai.desc": {
    ar: "يستخرج القيم من صورة تقرير Z تلقائيًا. يمكنك دائمًا تعديل أي قيمة بعد الاستخراج.",
    en: "Extracts values from the Z-report image automatically. You can always adjust any value after extraction.",
  },
  "wizard.ai.analyze": {
    ar: "تحليل صورة تقرير Z",
    en: "Analyze Z-report Image",
  },
  "wizard.ai.analyzing": { ar: "جارٍ التحليل…", en: "Analyzing…" },
  "wizard.ai.noImage": {
    ar: "عُد للخطوة السابقة لرفع صورة تقرير Z أولًا.",
    en: "Go back one step to upload a Z-report image first.",
  },
  "wizard.ai.filled": {
    ar: "تمت تعبئة {filled} حقل من تحليل الصورة. يمكنك مراجعتها وتعديلها.",
    en: "Filled {filled} field(s) from the image analysis. Review and adjust as needed.",
  },
  "wizard.ai.noValues": {
    ar: "لم يستطع النموذج استخراج قيم واضحة. يُرجى الإدخال يدويًا.",
    en: "The model could not extract clear values. Please enter them manually.",
  },
  "wizard.ai.error": {
    ar: "تعذّر تحليل الصورة. يُرجى الإدخال يدويًا.",
    en: "Could not analyze the image. Please enter values manually.",
  },

  // -- F3 (R4): stable runtime codes -------------------------------------
  // wizard.ai.err.* — `code` values returned by /api/analyze-closing-image.
  // The Arabic entries are byte-for-byte the prose the route returned
  // before codes existed, so Arabic behavior is unchanged.
  "wizard.ai.err.notConfigured": {
    ar: "خدمة تحليل الصور غير مُهيّأة. يُرجى التواصل مع الإدارة.",
    en: "The image analysis service is not configured. Please contact the administration.",
  },
  "wizard.ai.err.badRequest": {
    ar: "صيغة الطلب غير صحيحة.",
    en: "Invalid request format.",
  },
  "wizard.ai.err.noImage": {
    ar: "لم يتم توفير صورة.",
    en: "No image was provided.",
  },
  "wizard.ai.err.badImageFormat": {
    ar: "صيغة الصورة غير صحيحة.",
    en: "Invalid image format.",
  },
  "wizard.ai.err.unsupportedMime": {
    ar: "الملف المُرفق ليس صورة مدعومة.",
    en: "The attached file is not a supported image type.",
  },
  "wizard.ai.err.tooLarge": {
    ar: "حجم الصورة كبير جدًا (الحد الأقصى ١٠ ميجابايت).",
    en: "The image is too large (10 MB maximum).",
  },
  "wizard.ai.err.providerFailure": {
    ar: "تعذّر تحليل الصورة من مزوّد الخدمة.",
    en: "The image could not be analyzed by the provider.",
  },
  "wizard.ai.err.emptyExtract": {
    ar: "لم يتم استخراج أي بيانات من الصورة.",
    en: "No data could be extracted from the image.",
  },
  "wizard.ai.err.parseFailure": {
    ar: "تعذّر تفسير نتيجة التحليل.",
    en: "Could not interpret the analysis result.",
  },
  "wizard.ai.err.timeout": {
    ar: "انتهت مهلة تحليل الصورة. يُرجى المحاولة مرة أخرى.",
    en: "The image analysis timed out. Please try again.",
  },
  "wizard.ai.err.unexpected": {
    ar: "حدث خطأ غير متوقّع أثناء التحليل.",
    en: "An unexpected error occurred during analysis.",
  },

  // wizard.saveError.* — thrown by closings.ts saveClosing() with the key
  // AS Error.message; the cashier translates via t(locale, err.message).
  "wizard.saveError.storageFull": {
    ar: "تعذّر الحفظ محليًا (مساحة التخزين ممتلئة). يُرجى تحرير مساحة أو المحاولة مرة أخرى.",
    en: "Could not save locally (device storage is full). Free up space or try again.",
  },
  "wizard.saveError.server": {
    ar: "تعذّر حفظ الإقفال في الخادم. يُرجى المحاولة مرة أخرى.",
    en: "Could not save the closing to the server. Please try again.",
  },

  // wizard.warn.* — warning keys pushed into ClosingResult.warnings by
  // closings.ts; the cashier renders them via t(locale, key).
  "wizard.warn.offlineQueued": {
    ar: "تم الحفظ محليًا (وضع عدم الاتصال). يُرجى إعادة الإرسال يدويًا عند توفّر الاتصال.",
    en: "Saved locally (offline mode). Please resend manually once the connection is back.",
  },
  "wizard.warn.imagesStripped": {
    ar: "لم يتم الاحتفاظ بالصور المرفقة على هذا الجهاز لضمان حفظ بيانات الإقفال. يُرجى إعادة رفع الصور عند توفّر الاتصال.",
    en: "The attached images could not be kept on this device so the closing data could be saved. Please re-upload the images once the connection is back.",
  },
  "wizard.warn.zImageInvalid": {
    ar: "صورة تقرير Z غير صالحة أو بصيغة غير مدعومة. يُرجى إعادة رفع الصورة.",
    en: "The Z-report image is invalid or in an unsupported format. Please re-upload the image.",
  },
  "wizard.warn.proofImageInvalid": {
    ar: "إحدى صور الإثبات غير صالحة أو بصيغة غير مدعومة. يُرجى إعادة رفع الصورة.",
    en: "One of the payment proof images is invalid or in an unsupported format. Please re-upload it.",
  },
  "wizard.warn.zStorageFull": {
    ar: "تعذّر حفظ صورة تقرير Z على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
    en: "Could not keep the Z-report image on this device (local storage is full). Please re-upload the image.",
  },
  "wizard.warn.proofStorageFull": {
    ar: "تعذّر حفظ إحدى صور الإثبات على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
    en: "Could not keep one of the payment proof images on this device (local storage is full). Please re-upload it.",
  },
  "wizard.warn.zUploadFailed": {
    ar: "تعذّر رفع صورة تقرير Z ولم يتم حفظها على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
    en: "Could not upload the Z-report image, and it could not be kept on this device (local storage is full). Please re-upload the image.",
  },
  "wizard.warn.proofUploadFailed": {
    ar: "تعذّر رفع إحدى صور الإثبات ولم يتم حفظها على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
    en: "Could not upload one of the payment proof images, and it could not be kept on this device (local storage is full). Please re-upload it.",
  },
  "wizard.warn.zUploadLocalOnly": {
    ar: "تعذّر رفع صورة تقرير Z. تم حفظها على هذا الجهاز فقط ويُرجى إعادة رفعها لاحقًا.",
    en: "Could not upload the Z-report image. It was kept on this device only — please re-upload it later.",
  },
  "wizard.warn.proofUploadLocalOnly": {
    ar: "تعذّر رفع إحدى صور الإثبات. تم حفظها على هذا الجهاز فقط ويُرجى إعادة رفعها لاحقًا.",
    en: "Could not upload one of the payment proof images. It was kept on this device only — please re-upload it later.",
  },
  "wizard.warn.auditLogFailed": {
    ar: "تعذّر تسجيل سجل المراجعة — يتم متابعة الحفظ على أي حال.",
    en: "Could not record the audit log — the closing was saved anyway.",
  },

  "wizard.duplicateConfirm": {
    ar: "يوجد إقفال لهذا الفرع في هذا التاريخ. هل تريد المتابعة؟",
    en: "A closing already exists for this branch and date. Continue anyway?",
  },
  "wizard.saveError": { ar: "حدث خطأ أثناء الحفظ", en: "Error while saving" },
  "wizard.success.title": { ar: "تم إنشاء الإقفال", en: "Closing Created" },
  "wizard.success.id": { ar: "رقم الإقفال:", en: "Closing ID:" },
  "wizard.offlineNotice": {
    ar: "تم الحفظ محليًا (وضع عدم الاتصال). يُرجى إعادة الإرسال يدويًا عند توفّر الاتصال.",
    en: "Saved locally (offline mode). Please resend manually once the connection is back.",
  },
  "wizard.warnings": { ar: "تنبيهات:", en: "Warnings:" },
  "wizard.awaiting": {
    ar: "بانتظار اعتماد الإدارة المالية",
    en: "Awaiting finance approval",
  },
  "wizard.newClosing": { ar: "بدء إقفال جديد", en: "Start New Closing" },
  "wizard.backToGateway": { ar: "العودة للبوابة", en: "Back to Gateway" },

  // -- admin ---------------------------------------------------------------
  "admin.title": { ar: "لوحة مسؤول IT", en: "IT Admin Console" },
  "admin.subtitle": {
    ar: "بوابة الإغلاق المالي والمراجعة — متابعة تذاكر الدعم الفني من الفروع.",
    en: "Financial closing & audit gateway — triage branch IT support tickets.",
  },
  "admin.queue.title": {
    ar: "طابور تذاكر الدعم الفني",
    en: "IT Support Ticket Queue",
  },
  "admin.queue.loading": {
    ar: "جارٍ تحميل التذاكر…",
    en: "Loading tickets…",
  },
  "admin.queue.error": {
    ar: "تعذّر تحميل التذاكر.",
    en: "Could not load tickets.",
  },
  "admin.queue.notConfigured": {
    ar: "قاعدة البيانات غير مُهيّأة (Supabase) — لا يمكن عرض التذاكر.",
    en: "Database (Supabase) is not configured — tickets cannot be listed.",
  },
  "admin.queue.empty.title": { ar: "لا توجد تذاكر بعد", en: "No tickets yet" },
  "admin.queue.empty.body": {
    ar: "ستظهر هنا التذاكر التي يفتحها الكاشير من شاشة الفرع.",
    en: "Tickets opened by cashiers from the branch screen will appear here.",
  },
  "admin.filter.all": { ar: "الكل", en: "All" },
  "admin.filter.open": { ar: "مفتوحة", en: "Open" },
  "admin.filter.inProgress": { ar: "قيد المعالجة", en: "In progress" },
  "admin.filter.resolved": { ar: "تم الحل", en: "Resolved" },
  "admin.filter.closed": { ar: "مغلقة", en: "Closed" },
  "admin.status": { ar: "الحالة", en: "Status" },
  "admin.status.open": { ar: "مفتوحة", en: "Open" },
  "admin.status.inProgress": { ar: "قيد المعالجة", en: "In progress" },
  // F1 (R3): snake_case alias — the DB enum value is `in_progress`, and
  // template interpolation of that enum must resolve to real copy.
  "admin.status.in_progress": { ar: "قيد المعالجة", en: "In progress" },
  "admin.status.resolved": { ar: "تم الحل", en: "Resolved" },
  "admin.status.closed": { ar: "مغلقة", en: "Closed" },
  "admin.description": { ar: "الوصف", en: "Description" },
  "admin.createdBy": { ar: "أُنشئت بواسطة", en: "Created by" },
  "admin.adminNote": { ar: "ملاحظة IT", en: "IT note" },
  "admin.adminNotePlaceholder": {
    ar: "رد IT أو ملاحظة المتابعة…",
    en: "IT reply or follow-up note…",
  },
  "admin.saveError": {
    ar: "تعذّر حفظ التعديلات.",
    en: "Could not save changes.",
  },
  "admin.session.title": { ar: "الجلسة الحالية", en: "Current Session" },
  "admin.session.role": { ar: "الدور", en: "Role" },
  "admin.session.loginAt": { ar: "تسجيل الدخول", en: "Sign-in" },
  "admin.supabase.title": { ar: "حالة Supabase", en: "Supabase Status" },
  "admin.supabase.envVars": {
    ar: "متغيرات البيئة",
    en: "Environment variables",
  },
  "admin.supabase.configured": { ar: "مُهيّأة", en: "Configured" },
  "admin.supabase.notConfigured": { ar: "غير مُهيّأة", en: "Not configured" },
  "admin.supabase.note": {
    ar: "قراءة فقط لوجود متغيرات NEXT_PUBLIC_SUPABASE_* — لا يُفتح أي اتصال من هذه البطاقة.",
    en: "Read-only check for NEXT_PUBLIC_SUPABASE_* vars — no connection is opened from this card.",
  },
};

/**
 * Translate `key` for `locale`. Unknown keys fall back to the key itself
 * (never crash). Optional `{vars}` interpolation: t(l, "x", { done: 2 })
 * replaces every `{done}` placeholder in the string.
 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = DICTIONARY[key];
  let text = entry ? entry[locale] : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/**
 * F3 (R4): does `key` have a real dictionary entry? Callers use this to
 * distinguish stable i18n codes (analyze API `code` values, closings
 * warning keys, thrown save-error keys) from arbitrary prose — no regex
 * sniffing of message text.
 */
export function hasTranslation(key: string): boolean {
  return (
    typeof key === "string" &&
    Object.prototype.hasOwnProperty.call(DICTIONARY, key)
  );
}

/**
 * F3 (R4): the stable codes emitted by /api/analyze-closing-image. Kept
 * next to the dictionary so the code list and the copy cannot drift.
 */
export const ANALYZE_ERROR_CODES = [
  "wizard.ai.err.notConfigured",
  "wizard.ai.err.badRequest",
  "wizard.ai.err.noImage",
  "wizard.ai.err.badImageFormat",
  "wizard.ai.err.unsupportedMime",
  "wizard.ai.err.tooLarge",
  "wizard.ai.err.providerFailure",
  "wizard.ai.err.emptyExtract",
  "wizard.ai.err.parseFailure",
  "wizard.ai.err.timeout",
  "wizard.ai.err.unexpected",
] as const;

export type AnalyzeErrorCode = (typeof ANALYZE_ERROR_CODES)[number];

// Fail fast in dev if the code list and the dictionary ever drift apart.
if (process.env.NODE_ENV !== "production") {
  for (const code of ANALYZE_ERROR_CODES) {
    if (!hasTranslation(code)) {
      throw new Error(
        `i18n: ANALYZE_ERROR_CODES entry missing from DICTIONARY: ${code}`,
      );
    }
  }
}

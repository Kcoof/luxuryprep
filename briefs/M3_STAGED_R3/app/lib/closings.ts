import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  DailyClosing,
  FieldConfidence,
  FinancialFields,
} from "../types";

const QUEUE_KEY = "cashier_offline_closings_queue";
const PENDING_UPLOADS_KEY = "cashier_pending_uploads";
// C1 + M1: the ONLY bucket that exists is `closing-images` (private, created
// by migration 003). Do NOT create new buckets. Z-reports and payment proofs
// are separated by path prefix under the same bucket.
const CLOSING_IMAGES_BUCKET = "closing-images";
const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

// Align with migration 003 allowed_mime_types. GIF is rejected by the bucket
// and would always fail on upload.
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

export interface SaveClosingInput {
  branchId: string;
  businessDate: string;
  reviewedData: FinancialFields;
  manualActualCash?: number;
  zReportImageUrl?: string;
  paymentProofImageUrls?: string[];
  aiExtractedData?: Partial<FinancialFields>;
  aiConfidence?: FieldConfidence;
  manuallyModifiedFields?: (keyof FinancialFields)[];
}

export interface ClosingResult {
  closing: DailyClosing;
  source: "supabase" | "local-queued";
  warnings: string[];
}

interface PendingUpload {
  closingId: string;
  type: "z_report" | "payment_proof";
  dataUrl: string;
  createdAt: string;
}

function dataUrlToBytes(
  dataUrl: string,
): { bytes: Uint8Array; mime: string; ext: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  // Reject MIME types the storage bucket does not allow.
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mime)) return null;
  const base64 = m[2];
  let ext = "jpg";
  if (mime === "image/png") ext = "png";
  else if (mime === "image/webp") ext = "webp";
  else if (mime === "image/heic") ext = "heic";
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, mime, ext };
  } catch {
    return null;
  }
}

function genId(): string {
  return `close-${Date.now()}`;
}

function readQueue(): SaveClosingInput[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SaveClosingInput[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: SaveClosingInput[]): boolean {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function readPendingUploads(): PendingUpload[] {
  try {
    const raw = localStorage.getItem(PENDING_UPLOADS_KEY);
    return raw ? (JSON.parse(raw) as PendingUpload[]) : [];
  } catch {
    return [];
  }
}

function writePendingUploads(items: PendingUpload[]): boolean {
  try {
    localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function pushPendingUpload(entry: PendingUpload): boolean {
  const items = readPendingUploads();
  items.push(entry);
  return writePendingUploads(items);
}

function legacyDuplicateKey(branchId: string, businessDate: string): string {
  return `closing_${branchId}_${businessDate}`;
}

function localHasClosing(
  branchId: string,
  businessDate: string,
): boolean {
  try {
    if (localStorage.getItem(legacyDuplicateKey(branchId, businessDate))) {
      return true;
    }
  } catch {
    // ignore storage access errors
  }
  return readQueue().some(
    (c) => c.branchId === branchId && c.businessDate === businessDate,
  );
}

function markLocalClosing(
  branchId: string,
  businessDate: string,
): void {
  try {
    localStorage.setItem(legacyDuplicateKey(branchId, businessDate), "1");
  } catch {
    // best-effort
  }
}

export async function checkDuplicateClosing(
  branchId: string,
  businessDate: string,
): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("daily_closings")
        .select("id")
        .eq("branch_id", branchId)
        .eq("business_date", businessDate)
        .maybeSingle();
      if (!error) {
        if (data) return true;
        return localHasClosing(branchId, businessDate);
      }
    } catch {
      // fall through to local-only check
    }
  }
  return localHasClosing(branchId, businessDate);
}

// B5: resolve a stored image value to a viewable URL. The column holds two
// possible representations:
//   - Legacy (M2): full public URLs from getPublicUrl() — return as-is.
//   - New (M3): object paths within the closing-images bucket — generate a
//     short-lived signed URL via createSignedUrl.
// Never returns an unchecked string; always checks createSignedUrl's error.
export async function resolveImageUrl(
  storedValue: string | null | undefined,
): Promise<string | null> {
  if (!storedValue) return null;

  // Legacy rows from applied M2 code store absolute URLs.
  if (
    storedValue.startsWith("http://") ||
    storedValue.startsWith("https://")
  ) {
    return storedValue;
  }

  // New rows store object paths within the private bucket.
  if (!isSupabaseConfigured) return null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(CLOSING_IMAGES_BUCKET)
      .createSignedUrl(storedValue, SIGNED_URL_EXPIRY_SECONDS);

    if (error || !data?.signedUrl) {
      console.error(
        "[closings] createSignedUrl failed",
        error?.message,
      );
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function resolveImageUrls(
  storedValues: string[] | null | undefined,
): Promise<string[]> {
  if (!storedValues || storedValues.length === 0) return [];
  const results = await Promise.all(
    storedValues.map((v) => resolveImageUrl(v)),
  );
  return results.filter((url): url is string => url !== null);
}

interface UploadOutcome {
  path: string | null;
  warning: string | null;
}

async function tryUploadImage(
  dataUrl: string,
  pathPrefix: string,
  closingId: string,
  type: "z_report" | "payment_proof",
): Promise<UploadOutcome> {
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed) {
    // Do not queue a malformed or rejected-MIME data URL — it can never
    // decode later and only wastes storage quota.
    return {
      path: null,
      warning:
        type === "z_report"
          ? "صورة تقرير Z غير صالحة أو بصيغة غير مدعومة. يُرجى إعادة رفع الصورة."
          : "إحدى صور الإثبات غير صالحة أو بصيغة غير مدعومة. يُرجى إعادة رفع الصورة.",
    };
  }

  // Offline / unconfigured: try to retain the image locally so it is
  // not lost. The pending-uploads queue is the only fallback.
  if (!isSupabaseConfigured) {
    const queued = pushPendingUpload({
      closingId,
      type,
      dataUrl,
      createdAt: new Date().toISOString(),
    });
    if (!queued) {
      return {
        path: null,
        warning:
          type === "z_report"
            ? "تعذّر حفظ صورة تقرير Z على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة."
            : "تعذّر حفظ إحدى صور الإثبات على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
      };
    }
    return { path: null, warning: null };
  }

  const objectPath = `${pathPrefix}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${parsed.ext}`;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(CLOSING_IMAGES_BUCKET)
      .upload(objectPath, parsed.bytes, {
        contentType: parsed.mime,
        upsert: false,
      });
    if (error || !data) {
      const queued = pushPendingUpload({
        closingId,
        type,
        dataUrl,
        createdAt: new Date().toISOString(),
      });
      if (!queued) {
        return {
          path: null,
          warning:
            type === "z_report"
              ? "تعذّر رفع صورة تقرير Z ولم يتم حفظها على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة."
              : "تعذّر رفع إحدى صور الإثبات ولم يتم حفظها على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
        };
      }
      return {
        path: null,
        warning:
          type === "z_report"
            ? "تعذّر رفع صورة تقرير Z. تم حفظها على هذا الجهاز فقط ويُرجى إعادة رفعها لاحقًا."
            : "تعذّر رفع إحدى صور الإثبات. تم حفظها على هذا الجهاز فقط ويُرجى إعادة رفعها لاحقًا.",
      };
    }
    // M1: persist the object PATH returned by Supabase, not a public URL.
    return { path: data.path, warning: null };
  } catch {
    const queued = pushPendingUpload({
      closingId,
      type,
      dataUrl,
      createdAt: new Date().toISOString(),
    });
    if (!queued) {
      return {
        path: null,
        warning:
          type === "z_report"
            ? "تعذّر رفع صورة تقرير Z ولم يتم حفظها على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة."
            : "تعذّر رفع إحدى صور الإثبات ولم يتم حفظها على هذا الجهاز (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
      };
    }
    return {
      path: null,
      warning:
        type === "z_report"
          ? "تعذّر رفع صورة تقرير Z. تم حفظها على هذا الجهاز فقط ويُرجى إعادة رفعها لاحقًا."
          : "تعذّر رفع إحدى صور الإثبات. تم حفظها على هذا الجهاز فقط ويُرجى إعادة رفعها لاحقًا.",
    };
  }
}

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export async function saveClosing(
  input: SaveClosingInput,
): Promise<ClosingResult> {
  const id = genId();
  const warnings: string[] = [];
  const now = new Date().toISOString();

  const baseClosing: DailyClosing = {
    id,
    branchId: input.branchId,
    businessDate: input.businessDate,
    status: "pending",
    reviewedData: { ...input.reviewedData },
    manualActualCash: input.manualActualCash,
    aiExtractedData: input.aiExtractedData,
    aiConfidence: input.aiConfidence,
    manuallyModifiedFields: input.manuallyModifiedFields,
    createdAt: now,
    updatedAt: now,
  };

  // B3: offline branch. Never let image bytes block a closing from being
  // saved. A multi-megabyte data URL can exhaust the ~5 MB localStorage
  // quota and prevent ALL closings from being recorded offline. The
  // closing itself is a few hundred bytes and must always be retained.
  if (!isSupabaseConfigured || !isOnline()) {
    const queue = readQueue();
    const hasImages =
      !!input.zReportImageUrl ||
      (!!input.paymentProofImageUrls &&
        input.paymentProofImageUrls.length > 0);

    // First attempt: include the full payload (small images may fit).
    queue.push({ ...input });
    let persisted = writeQueue(queue);
    let imagesStripped = false;

    if (!persisted && hasImages) {
      // Retry: strip image data URLs. They are the likely cause of the
      // quota failure. The closing data itself is tiny.
      const stripped: SaveClosingInput = { ...input };
      stripped.zReportImageUrl = undefined;
      stripped.paymentProofImageUrls = undefined;
      queue[queue.length - 1] = stripped;
      persisted = writeQueue(queue);
      if (persisted) {
        imagesStripped = true;
      }
    }

    if (!persisted) {
      throw new Error(
        "تعذّر الحفظ محليًا (مساحة التخزين ممتلئة). يُرجى تحرير مساحة أو المحاولة مرة أخرى.",
      );
    }

    markLocalClosing(input.branchId, input.businessDate);

    const offlineWarnings: string[] = [
      "تم الحفظ محليًا (وضع عدم الاتصال). يُرجى إعادة الإرسال يدويًا عند توفّر الاتصال.",
    ];
    if (imagesStripped) {
      offlineWarnings.push(
        "لم يتم الاحتفاظ بالصور المرفقة على هذا الجهاز لضمان حفظ بيانات الإقفال. يُرجى إعادة رفع الصور عند توفّر الاتصال.",
      );
    }

    return {
      closing: {
        ...baseClosing,
        zReportImageUrl: imagesStripped
          ? undefined
          : input.zReportImageUrl,
        paymentProofImageUrls: imagesStripped
          ? undefined
          : input.paymentProofImageUrls,
      },
      source: "local-queued",
      warnings: offlineWarnings,
    };
  }

  // Online path: upload images to the private bucket, then insert the row.
  let uploadedZ: string | null = null;
  const uploadedProofs: string[] = [];

  if (input.zReportImageUrl) {
    const r = await tryUploadImage(
      input.zReportImageUrl,
      `${input.branchId}/z-report`,
      id,
      "z_report",
    );
    uploadedZ = r.path;
    if (r.warning) warnings.push(r.warning);
  }

  if (input.paymentProofImageUrls && input.paymentProofImageUrls.length > 0) {
    for (const dataUrl of input.paymentProofImageUrls) {
      const r = await tryUploadImage(
        dataUrl,
        `${input.branchId}/proofs`,
        id,
        "payment_proof",
      );
      if (r.path) {
        uploadedProofs.push(r.path);
      } else if (r.warning) {
        if (!warnings.includes(r.warning)) warnings.push(r.warning);
      }
    }
  }

  const supabase = getSupabase();
  const insertRow = {
    id,
    branch_id: input.branchId,
    business_date: input.businessDate,
    status: "pending",
    reviewed_data: input.reviewedData,
    manual_actual_cash: input.manualActualCash ?? null,
    // M1: persist the storage object PATH, not a URL. The column name is
    // historical (z_report_image_url); a follow-up migration may rename it.
    z_report_image_url: uploadedZ,
    payment_proof_image_urls:
      uploadedProofs.length > 0 ? uploadedProofs : null,
    ai_extracted_data: input.aiExtractedData ?? null,
    ai_confidence: input.aiConfidence ?? null,
    manually_modified_fields: input.manuallyModifiedFields ?? null,
  };

  const { error: insertError } = await supabase
    .from("daily_closings")
    .insert(insertRow);
  if (insertError) {
    // M3: an insert failure is NOT a silent queue. Throw the Arabic error
    // so saveError shows and the cashier stays on step 2 to retry.
    console.error(
      "[closings] daily_closings insert failed",
      insertError.message,
    );
    throw new Error(
      "تعذّر حفظ الإقفال في الخادم. يُرجى المحاولة مرة أخرى.",
    );
  }

  markLocalClosing(input.branchId, input.businessDate);

  // Audit logs: ai_extracted (if AI populated data) then cashier_confirmed.
  const logs: Array<{
    closing_id: string;
    actor_role: string;
    action: string;
  }> = [];
  if (
    input.aiExtractedData &&
    Object.keys(input.aiExtractedData).length > 0
  ) {
    logs.push({
      closing_id: id,
      actor_role: "ai",
      action: "ai_extracted",
    });
  }
  logs.push({
    closing_id: id,
    actor_role: "cashier",
    action: "cashier_confirmed",
  });
  // M4: supabase-js RESOLVES with { data, error } and does not reject,
  // so inspect the returned error and surface a non-fatal warning.
  const { error: auditError } = await supabase
    .from("daily_closing_audit_logs")
    .insert(logs);
  if (auditError) {
    console.error(
      "[closings] audit log insert failed",
      auditError.message,
    );
    warnings.push(
      "تعذّر تسجيل سجل المراجعة — يتم متابعة الحفظ على أي حال.",
    );
  }

  return {
    closing: {
      ...baseClosing,
      zReportImageUrl: uploadedZ ?? undefined,
      paymentProofImageUrls:
        uploadedProofs.length > 0 ? uploadedProofs : undefined,
    },
    source: "supabase",
    warnings,
  };
}
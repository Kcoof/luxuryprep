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
  const base64 = m[2];
  let ext = "jpg";
  if (mime === "image/png") ext = "png";
  else if (mime === "image/webp") ext = "webp";
  else if (mime === "image/gif") ext = "gif";
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

// M3 (M3): returns a boolean so callers know whether the queue write actually
// persisted. A failure here must surface to the user, not be swallowed.
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

// M3 (M5): returns a boolean. localStorage quota is the EXPECTED failure mode
// for the multi-megabyte data URLs we store here (~13 MB base64 for a 10 MB
// image vs. a typical ~5 MB quota) — that case must be observable.
function writePendingUploads(items: PendingUpload[]): boolean {
  try {
    localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

// M3 (M5): returns boolean indicating whether the upload was actually
// persisted to the pending queue.
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
  // M3 (M2): inspect BOTH the legacy single-shot key AND the offline queue
  // (the queue is what we actually write today).
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
  // M3 (M2): write the legacy key on every save so the next attempt can
  // detect a duplicate even if the queue was cleared / lost.
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
  // M3 (M2): trust the remote result ONLY when there is no error. On any
  // PostgREST error, RLS denial, exception, or missing config, fall through
  // to the local check. Never silently report "no duplicate".
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
        // No remote duplicate; also honor a local duplicate so an offline
        // queue from a previous attempt is surfaced.
        return localHasClosing(branchId, businessDate);
      }
      // error set: fall through to local-only check.
    } catch {
      // exception: fall through to local-only check.
    }
  }
  return localHasClosing(branchId, businessDate);
}

// M3 (C1 + M1): upload to the single private `closing-images` bucket, scoped
// by path prefix. Persist the storage OBJECT PATH (not a URL): the bucket is
// private so getPublicUrl() returns a URL that 400s forever. A signed URL is
// short-lived and dies at expiry, so we do NOT persist one — callers obtain a
// fresh signed URL at read time.
//
// On upload failure OR a queue-write failure, returns a warning describing
// the situation. The caller decides what to do with the row.
interface UploadOutcome {
  path: string | null;
  warning: string | null;
  // true if the image was either uploaded OR successfully retained in the
  // pending queue; false if it has been lost.
  retained: boolean;
}

async function tryUploadImage(
  dataUrl: string,
  pathPrefix: string,
  closingId: string,
  type: "z_report" | "payment_proof",
): Promise<UploadOutcome> {
  // M3 (Minor): warn + queue when the data URL is malformed.
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed) {
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
            ? "تعذّر قراءة صورة تقرير Z ولم يتم حفظها محليًا. يُرجى إعادة رفع الصورة."
            : "تعذّر قراءة إحدى صور الإثبات ولم يتم حفظها محليًا. يُرجى إعادة رفع الصورة.",
        retained: false,
      };
    }
    return {
      path: null,
      warning:
        type === "z_report"
          ? "صورة تقرير Z غير صالحة وسيُعاد الرفع لاحقًا."
          : "إحدى صور الإثبات غير صالحة وسيُعاد الرفع لاحقًا.",
      retained: true,
    };
  }

  // Offline / unconfigured: we cannot upload, but try to retain the image
  // locally so it is not lost. Distinct warning if the queue write fails.
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
            ? "تعذّر حفظ صورة تقرير Z محليًا (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة."
            : "تعذّر حفظ إحدى صور الإثبات محليًا (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
        retained: false,
      };
    }
    return { path: null, warning: null, retained: true };
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
      // Upload failed (network, RLS, bucket, etc.). Try to retain locally.
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
              ? "تعذّر رفع صورة تقرير Z ولم يتم حفظها محليًا (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة."
              : "تعذّر رفع إحدى صور الإثبات ولم يتم حفظها محليًا (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
          retained: false,
        };
      }
      return {
        path: null,
        warning:
          type === "z_report"
            ? "تعذّر رفع صورة تقرير Z وتم حفظها محليًا لإعادة المحاولة لاحقًا."
            : "تعذّر رفع إحدى صور الإثبات وتم حفظها محليًا لإعادة المحاولة لاحقًا.",
        retained: true,
      };
    }
    // M1: persist the object PATH returned by Supabase, not a public URL.
    // The path is later resolved to a short-lived signed URL at read time.
    return { path: data.path, warning: null, retained: true };
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
            ? "تعذّر رفع صورة تقرير Z ولم يتم حفظها محليًا (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة."
            : "تعذّر رفع إحدى صور الإثبات ولم يتم حفظها محليًا (مساحة التخزين ممتلئة). يُرجى إعادة رفع الصورة.",
        retained: false,
      };
    }
    return {
      path: null,
      warning:
        type === "z_report"
          ? "تعذّر رفع صورة تقرير Z وتم حفظها محليًا لإعادة المحاولة لاحقًا."
          : "تعذّر رفع إحدى صور الإثبات وتم حفظها محليًا لإعادة المحاولة لاحقًا.",
      retained: true,
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

  // M3 (M3): the genuinely-offline branch is the ONLY path that may return
  // local-queued, and only when the queue write is confirmed persisted.
  if (!isSupabaseConfigured || !isOnline()) {
    const queue = readQueue();
    queue.push({ ...input });
    const persisted = writeQueue(queue);
    if (!persisted) {
      // Queue write failed: do NOT report success. Throw the Arabic error so
      // the cashier stays on step 2 and can retry.
      throw new Error(
        "تعذّر الحفظ محليًا (مساحة التخزين ممتلئة). يُرجى تحرير مساحة أو المحاولة مرة أخرى.",
      );
    }
    markLocalClosing(input.branchId, input.businessDate);
    return {
      closing: {
        ...baseClosing,
        zReportImageUrl: input.zReportImageUrl,
        paymentProofImageUrls: input.paymentProofImageUrls,
      },
      source: "local-queued",
      warnings: [
        "تم الحفظ محليًا (وضع عدم الاتصال). يُرجى إعادة الإرسال يدويًا عند توفّر الاتصال.",
      ],
    };
  }

  // Online path: attempt Storage uploads to the single private bucket,
  // scoped by path prefix. On failure, retain the data URL in the pending
  // uploads queue — but NEVER persist a data: URL into the URL column, and
  // surface a distinct warning when even the queue write fails.
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
        // Avoid duplicating the identical localized warning string.
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
    // M3 (M3): an insert failure is NOT a silent queue. Throw the Arabic
    // error (as M2 did) so saveError shows and the cashier stays on step 2.
    // We do not promise automatic retry because no code drains the queue.
    console.error(
      "[closings] daily_closings insert failed",
      insertError.message,
    );
    throw new Error(
      "تعذّر حفظ الإقفال في الخادم. يُرجى المحاولة مرة أخرى.",
    );
  }

  // Insert succeeded — record the duplicate marker so the next attempt
  // (online or offline) can detect it.
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
  // M3 (M4): supabase-js RESOLVES with { data, error } and does not reject,
  // so the previous try/catch could never observe a failure. Inspect the
  // returned error and surface a non-fatal Arabic warning.
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
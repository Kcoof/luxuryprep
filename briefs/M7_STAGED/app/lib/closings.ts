// F3 (R4): cashier-facing runtime strings are stable i18n keys now.
// `ClosingResult.warnings` entries are wizard.warn.* keys, and the two
// throws on the cashier save path use wizard.saveError.* keys AS
// Error.message — the cashier page translates them via
// t(locale, err.message) after hasTranslation(). Auditor-only helpers
// (listClosings / getClosing / listAuditLogs / approve / reject) keep
// their Arabic prose: the auditor portal is Arabic-only this round and
// never renders these keys.
import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  AuditAction,
  ClosingStatus,
  DailyClosing,
  DailyClosingAuditLog,
  FieldConfidence,
  FinancialFields,
  UserRole,
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
  /** i18n keys (wizard.warn.*) — render with t(locale, key). */
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
//   - Legacy (M2): full public URLs from getPublicUrl() — the bucket is now
//     private so those URLs return 400. Where the URL contains
//     /closing-images/, extract the object path and sign it.
//   - New (M3): object paths within the closing-images bucket — generate a
//     short-lived signed URL via createSignedUrl.
// Never returns an unchecked string; always checks createSignedUrl's error.
export async function resolveImageUrl(
  storedValue: string | null | undefined,
): Promise<string | null> {
  if (!storedValue) return null;

  let objectPath: string;

  if (
    storedValue.startsWith("http://") ||
    storedValue.startsWith("https://")
  ) {
    // Legacy rows from applied M2 code store absolute getPublicUrl() URLs.
    // The bucket is now private, so those URLs return 400. Extract the
    // object path from the URL and sign it.
    const prefix = "/closing-images/";
    const idx = storedValue.indexOf(prefix);
    if (idx < 0) return null;
    objectPath = storedValue.slice(idx + prefix.length);
    if (!objectPath) return null;
  } else {
    // New rows store object paths directly.
    objectPath = storedValue;
  }

  if (!isSupabaseConfigured) return null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(CLOSING_IMAGES_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

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
  /** i18n key (wizard.warn.*) — render with t(locale, key). */
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
          ? "wizard.warn.zImageInvalid"
          : "wizard.warn.proofImageInvalid",
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
            ? "wizard.warn.zStorageFull"
            : "wizard.warn.proofStorageFull",
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
              ? "wizard.warn.zUploadFailed"
              : "wizard.warn.proofUploadFailed",
        };
      }
      return {
        path: null,
        warning:
          type === "z_report"
            ? "wizard.warn.zUploadLocalOnly"
            : "wizard.warn.proofUploadLocalOnly",
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
            ? "wizard.warn.zUploadFailed"
            : "wizard.warn.proofUploadFailed",
      };
    }
    return {
      path: null,
      warning:
        type === "z_report"
          ? "wizard.warn.zUploadLocalOnly"
          : "wizard.warn.proofUploadLocalOnly",
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
      // F3 (R4): Error.message IS the i18n key — the cashier translates it
      // via t(locale, err.message) after hasTranslation(err.message).
      throw new Error("wizard.saveError.storageFull");
    }

    markLocalClosing(input.branchId, input.businessDate);

    const offlineWarnings: string[] = ["wizard.warn.offlineQueued"];
    if (imagesStripped) {
      offlineWarnings.push("wizard.warn.imagesStripped");
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
    // M3: an insert failure is NOT a silent queue. Throw the i18n key
    // (F3 R4) so saveError shows and the cashier stays on step 2 to retry.
    console.error(
      "[closings] daily_closings insert failed",
      insertError.message,
    );
    throw new Error("wizard.saveError.server");
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
    warnings.push("wizard.warn.auditLogFailed");
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

// ============================================================================
// M4: Auditor portal helpers — list / fetch / approve / reject / audit logs.
// All use lazy getSupabase(). No module-scope client.
// F3 (R4): these are auditor-only paths — the cashier never renders these
// throws — so they keep their Arabic prose (auditor portal is Arabic-only).
// ============================================================================

interface ClosingRow {
  id: string;
  branch_id: string;
  business_date: string;
  status: string;
  z_report_image_url: string | null;
  payment_proof_image_urls: string[] | null;
  reviewed_data: Partial<FinancialFields> | null;
  manual_actual_cash: number | null;
  ai_extracted_data: Partial<FinancialFields> | null;
  ai_confidence: FieldConfidence | null;
  manually_modified_fields: (keyof FinancialFields)[] | null;
  auditor_id: string | null;
  auditor_comment: string | null;
  auditor_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  branches?: { name: string; city: string } | null;
}

interface AuditLogRow {
  id: string;
  closing_id: string;
  actor_role: string;
  actor_id: string | null;
  action: string;
  comment: string | null;
  timestamp: string;
}

export interface ClosingWithBranch extends DailyClosing {
  branchName: string;
  branchCity: string;
}

function mapRow(row: ClosingRow): ClosingWithBranch {
  return {
    id: row.id,
    branchId: row.branch_id,
    businessDate: row.business_date,
    status: row.status as ClosingStatus,
    zReportImageUrl: row.z_report_image_url ?? undefined,
    paymentProofImageUrls: row.payment_proof_image_urls ?? undefined,
    reviewedData: row.reviewed_data ?? undefined,
    manualActualCash: row.manual_actual_cash ?? undefined,
    aiExtractedData: row.ai_extracted_data ?? undefined,
    aiConfidence: row.ai_confidence ?? undefined,
    manuallyModifiedFields: row.manually_modified_fields ?? undefined,
    auditorId: row.auditor_id ?? undefined,
    auditorComment: row.auditor_comment ?? undefined,
    auditorReviewedAt: row.auditor_reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    branchName: row.branches?.name ?? "—",
    branchCity: row.branches?.city ?? "",
  };
}

export async function listClosings(
  statusFilter: "all" | ClosingStatus = "all",
): Promise<ClosingWithBranch[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = getSupabase();
  let query = supabase
    .from("daily_closings")
    .select("*, branches(name, city)")
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[closings] listClosings failed", error.message);
    throw new Error("تعذّر تحميل قائمة الإقفالات.");
  }
  return ((data ?? []) as ClosingRow[]).map(mapRow);
}

export async function getClosing(
  id: string,
): Promise<ClosingWithBranch | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("daily_closings")
    .select("*, branches(name, city)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[closings] getClosing failed", error.message);
    throw new Error("تعذّر تحميل بيانات الإقفال.");
  }
  if (!data) return null;
  return mapRow(data as ClosingRow);
}

export async function countPendingClosings(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("daily_closings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    console.error("[closings] countPendingClosings failed", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function listAuditLogs(filters?: {
  closingId?: string;
  action?: AuditAction;
}): Promise<DailyClosingAuditLog[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = getSupabase();
  let query = supabase
    .from("daily_closing_audit_logs")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(500);
  if (filters?.closingId && filters.closingId.trim()) {
    query = query.eq("closing_id", filters.closingId.trim());
  }
  if (filters?.action) {
    query = query.eq("action", filters.action);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[closings] listAuditLogs failed", error.message);
    throw new Error("تعذّر تحميل سجل التدقيق.");
  }
  return ((data ?? []) as AuditLogRow[]).map((r) => ({
    id: r.id,
    closingId: r.closing_id,
    actorRole: r.actor_role as UserRole,
    actorId: r.actor_id ?? undefined,
    action: r.action as AuditAction,
    comment: r.comment ?? undefined,
    timestamp: r.timestamp,
  }));
}

export async function approveClosing(
  id: string,
  comment?: string,
  auditorId?: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("لم يتم إعداد Supabase بعد.");
  }
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const trimmed = comment?.trim();
  const { error } = await supabase
    .from("daily_closings")
    .update({
      status: "approved",
      auditor_comment: trimmed ? trimmed : null,
      auditor_id: auditorId ?? null,
      auditor_reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id);
  if (error) {
    console.error("[closings] approve update failed", error.message);
    throw new Error("تعذّر تحديث حالة الإقفال.");
  }
  const { error: auditError } = await supabase
    .from("daily_closing_audit_logs")
    .insert({
      closing_id: id,
      actor_role: "auditor",
      actor_id: auditorId ?? null,
      action: "approved",
      comment: trimmed ? trimmed : null,
    });
  if (auditError) {
    console.error(
      "[closings] approve audit insert failed",
      auditError.message,
    );
    throw new Error(
      "تم تحديث حالة الإقفال إلى «معتمد»، لكن تعذّر تسجيل سجل التدقيق.",
    );
  }
}

export async function rejectClosing(
  id: string,
  comment: string,
  auditorId?: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("لم يتم إعداد Supabase بعد.");
  }
  const trimmed = comment.trim();
  if (!trimmed) {
    throw new Error("سبب الرفض مطلوب.");
  }
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("daily_closings")
    .update({
      status: "rejected",
      auditor_comment: trimmed,
      auditor_id: auditorId ?? null,
      auditor_reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id);
  if (error) {
    console.error("[closings] reject update failed", error.message);
    throw new Error("تعذّر تحديث حالة الإقفال.");
  }
  const { error: auditError } = await supabase
    .from("daily_closing_audit_logs")
    .insert({
      closing_id: id,
      actor_role: "auditor",
      actor_id: auditorId ?? null,
      action: "rejected",
      comment: trimmed,
    });
  if (auditError) {
    console.error(
      "[closings] reject audit insert failed",
      auditError.message,
    );
    throw new Error(
      "تم تحديث حالة الإقفال إلى «مرفوض»، لكن تعذّر تسجيل سجل التدقيق.",
    );
  }
}

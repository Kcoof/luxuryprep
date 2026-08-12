import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  DailyClosing,
  FieldConfidence,
  FinancialFields,
} from "../types";

const QUEUE_KEY = "cashier_offline_closings_queue";
const PENDING_UPLOADS_KEY = "cashier_pending_uploads";
const Z_REPORT_BUCKET = "z-reports";
const PROOF_BUCKET = "payment-proofs";

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

function writeQueue(items: SaveClosingInput[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota / privacy errors
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

function writePendingUploads(items: PendingUpload[]): void {
  try {
    localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function pushPendingUpload(entry: PendingUpload): void {
  const items = readPendingUploads();
  items.push(entry);
  writePendingUploads(items);
}

export async function checkDuplicateClosing(
  branchId: string,
  businessDate: string,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("daily_closings")
      .select("id")
      .eq("branch_id", branchId)
      .eq("business_date", businessDate)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function tryUploadImage(
  dataUrl: string,
  bucket: string,
  pathPrefix: string,
): Promise<{ url: string | null; warning: string | null }> {
  if (!isSupabaseConfigured) {
    return { url: null, warning: null };
  }
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed) {
    return { url: null, warning: null };
  }
  try {
    const fileName = `${pathPrefix}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${parsed.ext}`;
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, parsed.bytes, {
        contentType: parsed.mime,
        upsert: false,
      });
    if (error || !data) {
      return {
        url: null,
        warning: "تعذّر رفع إحدى الصور إلى التخزين — سيُعاد المحاولة لاحقًا.",
      };
    }
    const { data: pub } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);
    return { url: pub.publicUrl, warning: null };
  } catch {
    return {
      url: null,
      warning: "تعذّر رفع إحدى الصور إلى التخزين — سيُعاد المحاولة لاحقًا.",
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

  // Offline path: keep full input (including data URLs) in the local queue.
  if (!isSupabaseConfigured || !isOnline()) {
    const queue = readQueue();
    queue.push({ ...input });
    writeQueue(queue);
    return {
      closing: {
        ...baseClosing,
        zReportImageUrl: input.zReportImageUrl,
        paymentProofImageUrls: input.paymentProofImageUrls,
      },
      source: "local-queued",
      warnings: ["تم الحفظ محليًا وسيُرفع لاحقًا عند توفّر الاتصال."],
    };
  }

  // Online path: attempt Storage uploads. On failure, retain the data URL
  // in a pending uploads queue (M3 fix for M2 waived defect — never persist
  // a data: URL into the URL column, but never drop the image silently).
  let uploadedZ: string | null = null;
  const uploadedProofs: string[] = [];

  if (input.zReportImageUrl) {
    const r = await tryUploadImage(
      input.zReportImageUrl,
      Z_REPORT_BUCKET,
      input.branchId,
    );
    uploadedZ = r.url;
    if (!r.url && r.warning) {
      warnings.push(r.warning);
      pushPendingUpload({
        closingId: id,
        type: "z_report",
        dataUrl: input.zReportImageUrl,
        createdAt: now,
      });
    }
  }

  if (input.paymentProofImageUrls && input.paymentProofImageUrls.length > 0) {
    for (const dataUrl of input.paymentProofImageUrls) {
      const r = await tryUploadImage(
        dataUrl,
        PROOF_BUCKET,
        input.branchId,
      );
      if (r.url) {
        uploadedProofs.push(r.url);
      } else if (r.warning) {
        // Only push the warning once per batch to avoid spam.
        if (!warnings.includes(r.warning)) warnings.push(r.warning);
        pushPendingUpload({
          closingId: id,
          type: "payment_proof",
          dataUrl,
          createdAt: now,
        });
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
    z_report_image_url: uploadedZ,
    payment_proof_image_urls:
      uploadedProofs.length > 0 ? uploadedProofs : null,
    ai_extracted_data: input.aiExtractedData ?? null,
    ai_confidence: input.aiConfidence ?? null,
    manually_modified_fields: input.manuallyModifiedFields ?? null,
  };

  const { error } = await supabase.from("daily_closings").insert(insertRow);
  if (error) {
    // Row insert failed: fall back to offline queue so nothing is lost.
    const queue = readQueue();
    queue.push({ ...input });
    writeQueue(queue);
    return {
      closing: {
        ...baseClosing,
        zReportImageUrl: input.zReportImageUrl,
        paymentProofImageUrls: input.paymentProofImageUrls,
      },
      source: "local-queued",
      warnings: [
        ...warnings,
        "تعذّر الحفظ في الخادم — تم الحفظ محليًا وسيُعاد الرفع لاحقًا.",
      ],
    };
  }

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
  try {
    await supabase.from("daily_closing_audit_logs").insert(logs);
  } catch {
    // Non-fatal: audit failures should not block the closing flow.
    warnings.push("تعذّر تسجيل سجل المراجعة — يتم متابعة الحفظ على أي حال.");
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
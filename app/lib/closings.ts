import { DailyClosing, FinancialFields } from "../types";
import { getSupabase, isSupabaseConfigured } from "./supabase";

export interface ClosingInput {
  branchId: string;
  businessDate: string;
  reviewedData?: Partial<FinancialFields>;
  manualActualCash?: number;
  zReportImageUrl?: string;
  paymentProofImageUrls?: string[];
}

export interface ClosingResult {
  closing: DailyClosing;
  source: "supabase" | "local-queued";
  warnings: string[];
}

/**
 * Attempt to upload an image to Supabase Storage.
 * Returns the public URL on success, or null on failure (we will NOT
 * store multi-MB base64 data URLs in Postgres text columns — Major #4).
 */
async function tryUploadImage(
  dataUrl: string,
  closingId: string,
  index: number,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = getSupabase();
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const path = `${closingId}/${index}_${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("closing-images")
      .upload(path, blob, { contentType: blob.type });
    if (error) return null;
    const { data } = supabase.storage
      .from("closing-images")
      .getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch {
    return null;
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
        return Boolean(data);
      }
      // On query error, fall through to localStorage check below (Major #2).
    } catch {
      // Network / unexpected error → fall back to local check.
    }
  }
  // Local fallback — never assert "no duplicate" on query error.
  if (typeof window !== "undefined") {
    try {
      const key = `closing_${branchId}_${businessDate}`;
      return Boolean(window.localStorage.getItem(key));
    } catch {
      return false;
    }
  }
  return false;
}

export async function saveClosing(
  input: ClosingInput,
): Promise<ClosingResult> {
  const now = new Date().toISOString();
  const timestamp = Date.now().toString();
  const id = `close-${timestamp}`;
  const warnings: string[] = [];

  // Upload images if Supabase Storage is configured.
  // On failure we keep them out of the DB to avoid storing
  // multi-MB base64 strings in Postgres text columns (Major #4).
  let zReportUrl: string | null = null;
  let proofUrls: string[] | null = null;

  if (input.zReportImageUrl) {
    zReportUrl = await tryUploadImage(input.zReportImageUrl, id, 0);
    if (!zReportUrl) {
      warnings.push(
        "تعذّر رفع صورة تقرير Z — لم تُحفظ في قاعدة البيانات.",
      );
    }
  }
  if (input.paymentProofImageUrls && input.paymentProofImageUrls.length > 0) {
    const uploaded: string[] = [];
    for (let i = 0; i < input.paymentProofImageUrls.length; i++) {
      const url = await tryUploadImage(
        input.paymentProofImageUrls[i],
        id,
        i + 1,
      );
      if (url) uploaded.push(url);
    }
    if (uploaded.length < input.paymentProofImageUrls.length) {
      warnings.push(
        `تعذّر رفع ${
          input.paymentProofImageUrls.length - uploaded.length
        } من صور إثبات الدفع.`,
      );
    }
    proofUrls = uploaded.length > 0 ? uploaded : null;
  }

  const closing: DailyClosing = {
    id,
    branchId: input.branchId,
    businessDate: input.businessDate,
    status: "pending",
    zReportImageUrl: zReportUrl ?? undefined,
    paymentProofImageUrls: proofUrls ?? undefined,
    reviewedData: input.reviewedData,
    manualActualCash: input.manualActualCash,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    const row = {
      id: closing.id,
      branch_id: closing.branchId,
      business_date: closing.businessDate,
      status: closing.status,
      z_report_image_url: closing.zReportImageUrl ?? null,
      payment_proof_image_urls: closing.paymentProofImageUrls ?? null,
      reviewed_data: closing.reviewedData ?? null,
      manual_actual_cash: closing.manualActualCash ?? null,
      created_at: closing.createdAt,
      updated_at: closing.updatedAt,
    };
    const { data, error } = await supabase
      .from("daily_closings")
      .insert(row)
      .select()
      .single();
    if (error) {
      // Major #1: do NOT pretend success. Surface Arabic error to caller.
      throw new Error(
        `تعذّر حفظ الإقفال في قاعدة البيانات: ${error.message}`,
      );
    }
    if (data) {
      return {
        closing: mapRowToClosing(data),
        source: "supabase",
        warnings,
      };
    }
    throw new Error("تعذّر حفظ الإقفال — لم يُرجع السيرفر أي سجل.");
  }

  // Supabase not configured → offline queue
  // (Major #1: explicitly mark in UI via source = "local-queued")
  if (typeof window !== "undefined") {
    try {
      const key = `closing_${input.branchId}_${input.businessDate}`;
      window.localStorage.setItem(key, JSON.stringify(closing));
    } catch {
      // ignore quota / privacy errors
    }
  }
  return {
    closing,
    source: "local-queued",
    warnings,
  };
}

function mapRowToClosing(row: Record<string, unknown>): DailyClosing {
  return {
    id: row.id as string,
    branchId: row.branch_id as string,
    businessDate: row.business_date as string,
    status: row.status as DailyClosing["status"],
    zReportImageUrl: row.z_report_image_url as string | undefined,
    paymentProofImageUrls:
      row.payment_proof_image_urls as string[] | undefined,
    reviewedData: row.reviewed_data as Partial<FinancialFields> | undefined,
    manualActualCash: row.manual_actual_cash as number | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

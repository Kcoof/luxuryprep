// M3: GLM vision OCR for Z-report images.
// Server-only route — never bundle GLM secrets into the client.
// Constitution rule: never reference NEXT_PUBLIC_ for GLM env vars.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB decoded
const UPSTREAM_TIMEOUT_MS = 60_000;

const ALLOWED_FIELDS = [
  "grossSales",
  "netSales",
  "cashSystem",
  "spanSystem",
  "deliveryAppsSystem",
  "reversedTransactions",
  "cashActualHanded",
] as const;

type ExtractableField = (typeof ALLOWED_FIELDS)[number];
type ExtractedFields = Partial<Record<ExtractableField, number>>;

interface AnalyzeResponse {
  fields: ExtractedFields;
  finishReason: string | null;
  model: string;
}

function buildPrompt(): string {
  return [
    "You are an OCR assistant that extracts financial values from an Arabic Z-report (daily point-of-sale closing report) image.",
    "Return ONLY raw JSON. Do not include prose, markdown, or code fences.",
    "If a value is missing, illegible, or ambiguous, return null for that key.",
    "Strip thousands separators (commas or spaces) and use a dot (.) as the decimal separator.",
    "Do not invent values. Do not compute shortage/excess.",
    "",
    "Return exactly these keys (Arabic label in parentheses for guidance):",
    '- "grossSales": إجمالي المبيعات',
    '- "netSales": صافي المبيعات',
    '- "cashSystem": النقدية حسب النظام',
    '- "spanSystem": سبان',
    '- "deliveryAppsSystem": تطبيقات التوصيل',
    '- "reversedTransactions": حركات مرتجعة',
    '- "cashActualHanded": النقدية المسلّمة فعليًا',
    "",
    'Example output: {"grossSales": 1234.56, "netSales": 1100.00, "cashSystem": 500.00, "spanSystem": 200.00, "deliveryAppsSystem": 150.00, "reversedTransactions": 25.00, "cashActualHanded": 498.00}',
  ].join("\n");
}

function stripCodeFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}

function coerceFields(parsed: unknown): ExtractedFields {
  const out: ExtractedFields = {};
  if (!parsed || typeof parsed !== "object") return out;
  const obj = parsed as Record<string, unknown>;
  for (const key of ALLOWED_FIELDS) {
    const v = obj[key];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function decodeBase64Length(base64: string): number {
  // Buffer.from never throws on invalid base64 input — it produces lossy output.
  // Approximation is unnecessary; byteLength is exact and safe.
  return Buffer.from(base64, "base64").byteLength;
}

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env.GLM_API_KEY;
  const baseUrlRaw = process.env.GLM_BASE_URL;
  const visionModel = process.env.GLM_VISION_MODEL;

  if (!apiKey || !baseUrlRaw || !visionModel) {
    return NextResponse.json(
      { error: "خدمة تحليل الصور غير مُهيّأة. يُرجى التواصل مع الإدارة." },
      { status: 503 },
    );
  }

  // Normalize base URL: a trailing slash would yield "//chat/completions".
  const baseUrl = baseUrlRaw.replace(/\/$/, "");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "صيغة الطلب غير صحيحة." },
      { status: 400 },
    );
  }

  const { imageBase64 } = (body ?? {}) as { imageBase64?: unknown };
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return NextResponse.json(
      { error: "لم يتم توفير صورة." },
      { status: 400 },
    );
  }

  let mime = "image/jpeg";
  let dataUrl: string;
  if (imageBase64.startsWith("data:")) {
    const m = imageBase64.match(/^data:([^;]+);base64,/);
    if (!m) {
      return NextResponse.json(
        { error: "صيغة الصورة غير صحيحة." },
        { status: 400 },
      );
    }
    mime = m[1];
    dataUrl = imageBase64;
  } else {
    dataUrl = `data:${mime};base64,${imageBase64}`;
  }

  if (!mime.startsWith("image/")) {
    return NextResponse.json(
      { error: "الملف المُرفق ليس صورة مدعومة." },
      { status: 415 },
    );
  }

  const rawBase64 = dataUrl.split(",")[1] ?? "";
  const byteLength = decodeBase64Length(rawBase64);
  if (byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "حجم الصورة كبير جدًا (الحد الأقصى ١٠ ميجابايت)." },
      { status: 413 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: visionModel,
        temperature: 0,
        max_tokens: 2048,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt() },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      // Log server-side only; never echo upstream details to the browser.
      const text = await upstream.text().catch(() => "");
      console.error(
        "[analyze-closing-image] upstream non-ok",
        upstream.status,
        text.slice(0, 500),
      );
      return NextResponse.json(
        { error: "تعذّر تحليل الصورة من مزوّد الخدمة." },
        { status: 502 },
      );
    }

    const data = (await upstream.json()) as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
    };

    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    const finishReason = choice?.finish_reason ?? null;

    if (!content.trim()) {
      return NextResponse.json(
        {
          error: "لم يتم استخراج أي بيانات من الصورة.",
          finishReason,
        },
        { status: 502 },
      );
    }

    const cleaned = stripCodeFence(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error(
        "[analyze-closing-image] failed to parse model JSON",
        cleaned.slice(0, 500),
        e,
      );
      return NextResponse.json(
        {
          error: "تعذّر تفسير نتيجة التحليل.",
          finishReason,
        },
        { status: 502 },
      );
    }

    const fields = coerceFields(parsed);
    const payload: AnalyzeResponse = { fields, finishReason, model: visionModel };
    return NextResponse.json(payload);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return NextResponse.json(
        { error: "انتهت مهلة تحليل الصورة. يُرجى المحاولة مرة أخرى." },
        { status: 504 },
      );
    }
    console.error("[analyze-closing-image] unexpected error", err);
    return NextResponse.json(
      { error: "حدث خطأ غير متوقّع أثناء التحليل." },
      { status: 500 },
    );
  } finally {
    clearTimeout(timer);
  }
}
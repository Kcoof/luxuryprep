// M1 type contracts per FOUNDATION.md
// Currency: SAR. All numeric fields are decimal monetary values.
// M7: added ItSupportTicket contracts (migration 006).

export interface Branch {
  id: string;
  name: string;
  city: string;
}

export interface FinancialFields {
  grossSales: number;
  netSales: number;
  cashSystem: number;
  cashActualHanded: number;
  spanSystem: number;
  deliveryAppsSystem: number;
  reversedTransactions: number;
  shortageOrExcess: number;
}

export type FieldConfidence = {
  grossSales?: number;
  netSales?: number;
  cashSystem?: number;
  cashActualHanded?: number;
  spanSystem?: number;
  deliveryAppsSystem?: number;
  reversedTransactions?: number;
  shortageOrExcess?: number;
};

export type ClosingStatus = "pending" | "approved" | "rejected";

export type UserRole = "cashier" | "manager" | "auditor" | "ai";

export type AuditAction =
  | "uploaded"
  | "ai_extracted"
  | "cashier_confirmed"
  | "approved"
  | "rejected"
  | "modified";

export interface DailyClosing {
  id: string;
  branchId: string;
  businessDate: string; // ISO date (yyyy-mm-dd)
  status: ClosingStatus;
  zReportImageUrl?: string;
  paymentProofImageUrls?: string[];
  aiExtractedData?: Partial<FinancialFields>;
  aiConfidence?: FieldConfidence;
  reviewedData?: Partial<FinancialFields>;
  manuallyModifiedFields?: (keyof FinancialFields)[];
  manualActualCash?: number;
  auditorId?: string;
  auditorComment?: string;
  auditorReviewedAt?: string; // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

export interface DailyClosingAuditLog {
  id: string;
  closingId: string;
  actorRole: UserRole;
  actorId?: string;
  action: AuditAction;
  comment?: string;
  timestamp: string; // ISO timestamp
}

// -- M7: IT support tickets (supabase/migrations/006_it_support_tickets.sql)

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type TicketCategory =
  | "pos"
  | "mada"
  | "printer"
  | "network"
  | "foodics"
  | "other";

export interface ItSupportTicket {
  id: string;
  branchId: string;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  status: TicketStatus;
  createdByRole: string;
  createdByLabel?: string;
  adminNote?: string;
  resolvedAt?: string; // ISO timestamp
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export const EMPTY_FINANCIAL_FIELDS: FinancialFields = {
  grossSales: 0,
  netSales: 0,
  cashSystem: 0,
  cashActualHanded: 0,
  spanSystem: 0,
  deliveryAppsSystem: 0,
  reversedTransactions: 0,
  shortageOrExcess: 0,
};

/**
 * Compute shortage/excess = cashActualHanded - cashSystem
 * Positive => excess (زيادة), Negative => shortage (عجز).
 */
export function computeShortageOrExcess(
  cashActualHanded: number,
  cashSystem: number,
): number {
  const actual = Number.isFinite(cashActualHanded) ? cashActualHanded : 0;
  const system = Number.isFinite(cashSystem) ? cashSystem : 0;
  return Number((actual - system).toFixed(2));
}

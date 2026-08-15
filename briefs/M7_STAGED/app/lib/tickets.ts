// M7 — IT support tickets data access (Supabase only).
//
// Thin helper over public.it_support_tickets (migration 006), matching the
// closings style: lazy getSupabase(); when env vars are missing we throw a
// sentinel error the UI maps to a bilingual message. No offline queue in
// v1 — tickets require a live connection, and the UI surfaces a clear
// error instead of inventing a second persistence path.
//
// R3 (F4): updateTicket computes resolved_at from real status transitions
// — set only when entering resolved/closed, cleared when reopening back to
// open/in_progress, and never refreshed while the status is unchanged
// (note-only patches and resolved<->closed moves keep the timestamp).

import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  ItSupportTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../types";

/** Sentinel thrown when NEXT_PUBLIC_SUPABASE_* env vars are missing. */
export const TICKETS_NOT_CONFIGURED = "TICKETS_SUPABASE_NOT_CONFIGURED";

export interface CreateTicketInput {
  branchId: string;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  createdByRole?: string;
  createdByLabel?: string;
}

export interface UpdateTicketInput {
  id: string;
  status?: TicketStatus;
  adminNote?: string;
}

function ensureSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(TICKETS_NOT_CONFIGURED);
  }
  return getSupabase();
}

interface TicketRow {
  id: string;
  branch_id: string;
  category: string | null;
  priority: string | null;
  subject: string;
  description: string;
  status: string | null;
  created_by_role: string | null;
  created_by_label: string | null;
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];
const TICKET_PRIORITIES: TicketPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];
const TICKET_CATEGORIES: TicketCategory[] = [
  "pos",
  "mada",
  "printer",
  "network",
  "foodics",
  "other",
];

function pickEnum<T extends string>(
  allowed: T[],
  value: string | null | undefined,
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function mapRow(row: TicketRow): ItSupportTicket {
  return {
    id: row.id,
    branchId: row.branch_id,
    category: pickEnum(TICKET_CATEGORIES, row.category, "other"),
    priority: pickEnum(TICKET_PRIORITIES, row.priority, "normal"),
    subject: row.subject,
    description: row.description,
    status: pickEnum(TICKET_STATUSES, row.status, "open"),
    createdByRole: row.created_by_role ?? "cashier",
    createdByLabel: row.created_by_label ?? undefined,
    adminNote: row.admin_note ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

/** `ticket-<timestamp>-<rand4>` per the locked M7 schema decision. */
export function newTicketId(): string {
  return `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<ItSupportTicket> {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("it_support_tickets")
    .insert({
      id: newTicketId(),
      branch_id: input.branchId,
      category: input.category,
      priority: input.priority,
      subject: input.subject,
      description: input.description,
      status: "open",
      created_by_role: input.createdByRole ?? "cashier",
      created_by_label: input.createdByLabel ?? null,
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "insert it_support_tickets failed");
  }
  return mapRow(data as TicketRow);
}

export async function listTickets(): Promise<ItSupportTicket[]> {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("it_support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRow(row as TicketRow));
}

export async function updateTicket(
  input: UpdateTicketInput,
): Promise<ItSupportTicket> {
  const supabase = ensureSupabase();

  // F4 (R3): reject empty patches up front with a clear error.
  if (input.status === undefined && input.adminNote === undefined) {
    throw new Error(
      "updateTicket: empty patch — provide status and/or adminNote",
    );
  }

  const patch: Record<string, unknown> = {};

  if (input.status !== undefined) {
    // F4 (R3): fetch the current status first so resolved_at follows real
    // transitions only. Set the timestamp when entering resolved/closed
    // from open/in_progress; clear it when reopening; leave it untouched
    // when the status is unchanged or moves within resolved<->closed.
    const { data: current, error: fetchError } = await supabase
      .from("it_support_tickets")
      .select("status")
      .eq("id", input.id)
      .single();
    if (fetchError || !current) {
      throw new Error(fetchError?.message ?? "ticket not found");
    }
    const currentStatus = pickEnum(
      TICKET_STATUSES,
      (current as { status: string | null }).status,
      "open",
    );
    if (input.status !== currentStatus) {
      patch.status = input.status;
      const entersResolved =
        input.status === "resolved" || input.status === "closed";
      const leavesResolved =
        currentStatus === "resolved" || currentStatus === "closed";
      if (entersResolved && !leavesResolved) {
        patch.resolved_at = new Date().toISOString();
      } else if (!entersResolved && leavesResolved) {
        patch.resolved_at = null;
      }
      // resolved <-> closed: keep the original resolved_at (no refresh).
    }
    // Status unchanged: do not touch status or resolved_at (note-only).
  }

  if (input.adminNote !== undefined) {
    const trimmed = input.adminNote.trim();
    patch.admin_note = trimmed === "" ? null : trimmed;
  }

  if (Object.keys(patch).length === 0) {
    // Status identical and no note change — nothing to write. Return the
    // current row instead of issuing an empty UPDATE.
    const { data, error: fetchError } = await supabase
      .from("it_support_tickets")
      .select("*")
      .eq("id", input.id)
      .single();
    if (fetchError || !data) {
      throw new Error(fetchError?.message ?? "ticket not found");
    }
    return mapRow(data as TicketRow);
  }

  const { data, error } = await supabase
    .from("it_support_tickets")
    .update(patch)
    .eq("id", input.id)
    .select()
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "update it_support_tickets failed");
  }
  return mapRow(data as TicketRow);
}


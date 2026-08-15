// M6 — demo login gateway & session helpers.
//
// Single source of truth: localStorage key `luxuryprep_session`.
//
// v1 scope (per brief): DEMO credentials only — no real user store, no
// Supabase Auth tables. The cashier/branch tab validates against the
// branch list loaded from Supabase (public.branches) before a session is
// created. Supabase Auth replaces the credential checks in a later
// milestone. Do NOT treat anything here as real security.

export type SessionRole = "cashier" | "manager" | "auditor" | "admin";

export interface Session {
  role: SessionRole;
  branchId?: string;
  branchName?: string;
  at: string; // ISO timestamp of login
}

/** New M6 session key (single source of truth). */
export const SESSION_STORAGE_KEY = "luxuryprep_session";

/**
 * Legacy key the cashier page (M2–M4) reads to lock the branch.
 * On cashier login we write BOTH keys so existing wizard behavior
 * (branch restore + lock) keeps working untouched.
 */
export const CASHIER_BRANCH_STORAGE_KEY = "cashier_selected_branch";

// Demo credentials v1 (NOT secrets — safe defaults, overridable via env).
// See .env.local.example. Supabase Auth replaces these later.
const DEMO_FINANCE_USER =
  process.env.NEXT_PUBLIC_LOGIN_FINANCE_USER ?? "finance";
const DEMO_FINANCE_PASSWORD =
  process.env.NEXT_PUBLIC_LOGIN_FINANCE_PASSWORD ?? "finance";
const DEMO_ADMIN_USER = process.env.NEXT_PUBLIC_LOGIN_ADMIN_USER ?? "admin";
const DEMO_ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_LOGIN_ADMIN_PASSWORD ?? "admin";

const VALID_ROLES: SessionRole[] = ["cashier", "manager", "auditor", "admin"];

function isSessionRole(value: unknown): value is SessionRole {
  return (
    typeof value === "string" &&
    (VALID_ROLES as string[]).includes(value)
  );
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const v = value as Partial<Session>;
    if (!isSessionRole(v.role)) return null;
    if (typeof v.at !== "string" || v.at === "") return null;
    const session: Session = { role: v.role, at: v.at };
    if (typeof v.branchId === "string" && v.branchId !== "") {
      session.branchId = v.branchId;
    }
    if (typeof v.branchName === "string" && v.branchName !== "") {
      session.branchName = v.branchName;
    }
    return session;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    return parseSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch {
    return; // storage full / privacy mode — nothing else to do
  }
  // Keep the cashier branch lock (M2–M4) in sync so the existing wizard
  // restores the branch exactly as before.
  if (
    (session.role === "cashier" || session.role === "manager") &&
    session.branchId &&
    session.branchName
  ) {
    try {
      window.localStorage.setItem(
        CASHIER_BRANCH_STORAGE_KEY,
        JSON.stringify({ id: session.branchId, name: session.branchName }),
      );
    } catch {
      // ignore
    }
  }
}

/**
 * Cashier/branch login. The branch object MUST come from the validated
 * Supabase branch list (public.branches) — the login form enforces this.
 */
export function startCashierSession(
  branch: { id: string; name: string },
  role: Extract<SessionRole, "cashier" | "manager"> = "cashier",
): Session {
  const session: Session = {
    role,
    branchId: branch.id,
    branchName: branch.name,
    at: new Date().toISOString(),
  };
  setSession(session);
  return session;
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    // Also drop the legacy branch lock so a shared device cannot bounce
    // straight back into a stale cashier context.
    window.localStorage.removeItem(CASHIER_BRANCH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Returns the session only when its role is one of `roles`. */
export function requireRole(...roles: SessionRole[]): Session | null {
  const session = getSession();
  if (!session) return null;
  return roles.includes(session.role) ? session : null;
}

/** Home route per role (used by the gateway "continue" action). */
export function sessionHomeFor(role: SessionRole): string {
  switch (role) {
    case "auditor":
      return "/auditor";
    case "admin":
      return "/admin";
    default:
      return "/cashier";
  }
}

function credentialsMatch(
  user: string,
  password: string,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  return (
    user.trim().toLowerCase() === expectedUser.trim().toLowerCase() &&
    password === expectedPassword
  );
}

/** Demo v1 check for the «المراجعة المالية» tab. */
export function checkFinanceCredentials(
  user: string,
  password: string,
): boolean {
  return credentialsMatch(
    user,
    password,
    DEMO_FINANCE_USER,
    DEMO_FINANCE_PASSWORD,
  );
}

/** Demo v1 check for the «مسؤول IT» tab. */
export function checkAdminCredentials(
  user: string,
  password: string,
): boolean {
  return credentialsMatch(user, password, DEMO_ADMIN_USER, DEMO_ADMIN_PASSWORD);
}
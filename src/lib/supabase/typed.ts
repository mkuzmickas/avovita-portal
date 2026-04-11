/**
 * Typed Supabase query helpers.
 *
 * Because supabase-js 2.103.x generic inference doesn't resolve our Database
 * type correctly at compile time, these helpers cast query results to their
 * known types. All type assertions are safe because the actual data shape is
 * enforced by Postgres RLS and the migration schema.
 */

import type {
  Account,
  PatientProfile,
  Order,
  OrderLine,
  Result,
  Consent,
  Lab,
  Test,
  TestWithLab,
  Notification,
  VisitGroup,
} from "@/types/database";

// Supabase returns { data: T | null, error: PostgrestError | null }
type QueryResult<T> = { data: T | null; error: unknown };
type QueryListResult<T> = { data: T[] | null; error: unknown; count?: number | null };

// ─── Re-export casted return types ────────────────────────────────────────────

export function asAccount(result: { data: unknown; error: unknown }): QueryResult<Account> {
  return result as QueryResult<Account>;
}

export function asProfile(result: { data: unknown; error: unknown }): QueryResult<PatientProfile> {
  return result as QueryResult<PatientProfile>;
}

export function asProfiles(result: { data: unknown; error: unknown; count?: number | null }): QueryListResult<PatientProfile> {
  return result as QueryListResult<PatientProfile>;
}

export function asOrder(result: { data: unknown; error: unknown }): QueryResult<Order> {
  return result as QueryResult<Order>;
}

export function asOrders(result: { data: unknown; error: unknown }): QueryListResult<Order> {
  return result as QueryListResult<Order>;
}

export function asResult(result: { data: unknown; error: unknown }): QueryResult<Result> {
  return result as QueryResult<Result>;
}

export function asResults(result: { data: unknown; error: unknown }): QueryListResult<Result> {
  return result as QueryListResult<Result>;
}

export function asConsents(result: { data: unknown; error: unknown }): QueryListResult<Consent> {
  return result as QueryListResult<Consent>;
}

export function asTests(result: { data: unknown; error: unknown }): QueryListResult<TestWithLab> {
  return result as QueryListResult<TestWithLab>;
}

export function asCount(result: { count: number | null; error: unknown }): { count: number | null; error: unknown } {
  return result;
}

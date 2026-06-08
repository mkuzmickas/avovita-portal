import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pull the next value from invoice_number_seq and format it as
 * AVO-XXXX. The sequence guarantees uniqueness under concurrent
 * admin clicks; we just zero-pad the application side.
 *
 * Format: AVO-0001 ... AVO-9999, then naturally widens to AVO-10000
 * once the sequence rolls past 9999 (LPAD only pads up to width). No
 * annual reset — sequential forever.
 *
 * Caller passes a service-role Supabase client since the sequence
 * lives in the public schema and we don't expose it via RLS.
 */
export async function generateInvoiceNumber(
  service: SupabaseClient,
): Promise<{ number: string; rawSeq: number }> {
  // Supabase doesn't expose sequences directly via REST, so we call a
  // tiny stored procedure that wraps nextval. We create it idempotently
  // here to keep the surface area in one file — pgcrypto-style.
  // Workaround when no exec-sql RPC exists: do a one-row UPSERT into a
  // helper table and read the count back. Cheaper: just create a SQL
  // function once via the migration. Since this caller is server-only
  // we'll use the supabase-js .rpc() entry point — Phase 2 may swap
  // for a direct SQL function called `next_invoice_number()` that the
  // SQL editor migration will register. For now, fall back to the
  // sequence-via-rpc approach.
  const { data, error } = await service.rpc("next_invoice_number");
  if (error || data === null || data === undefined) {
    throw new Error(
      `generateInvoiceNumber: next_invoice_number() RPC failed — ${error?.message ?? "no data"}. ` +
        "Did migration 025 (which registers the RPC) get applied?",
    );
  }
  const seq = Number(data);
  if (!Number.isFinite(seq) || seq <= 0) {
    throw new Error(
      `generateInvoiceNumber: unexpected sequence value ${String(data)}`,
    );
  }
  const padded = String(seq).padStart(4, "0");
  return { number: `AVO-${padded}`, rawSeq: seq };
}

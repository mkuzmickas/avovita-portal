/**
 * Unit tests for portalQueries — uses a fake supabase chain so we never
 * hit Postgres in CI. Each test asserts both the query shape (table,
 * filters) and the returned count.
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAdminAccountIds,
  getPortalSessions,
  getEventCount,
  getCompletedOrderCount,
  COMPLETED_ORDER_STATUSES,
  type PortalQueryContext,
} from "@/lib/analytics/portalQueries";

interface QueryRecord {
  table: string;
  select?: { columns: string; opts?: unknown };
  filters: Array<{ op: string; field?: string; value?: unknown }>;
  /** Set when the chain ends with `await` returning {count} or {data}. */
  result: { data?: unknown; error?: unknown; count?: number };
}

function makeFakeSupabase(scripted: QueryRecord[]): {
  client: SupabaseClient;
  records: QueryRecord[];
} {
  const records: QueryRecord[] = [];
  let cursor = 0;

  const fromImpl = (table: string) => {
    const script = scripted[cursor++];
    if (!script) throw new Error(`Unexpected fake supabase call to ${table}`);
    const rec: QueryRecord = {
      table,
      filters: [],
      result: script.result,
    };
    records.push(rec);

    const builder: Record<string, unknown> = {};
    const ret = () => builder;

    builder.select = (columns: string, opts?: unknown) => {
      rec.select = { columns, opts };
      return ret();
    };
    builder.eq = (field: string, value: unknown) => {
      rec.filters.push({ op: "eq", field, value });
      return ret();
    };
    builder.gte = (field: string, value: unknown) => {
      rec.filters.push({ op: "gte", field, value });
      return ret();
    };
    builder.lte = (field: string, value: unknown) => {
      rec.filters.push({ op: "lte", field, value });
      return ret();
    };
    builder.in = (field: string, value: unknown) => {
      rec.filters.push({ op: "in", field, value });
      return ret();
    };
    builder.or = (expr: string) => {
      rec.filters.push({ op: "or", value: expr });
      return ret();
    };
    builder.limit = (n: number) => {
      rec.filters.push({ op: "limit", value: n });
      return ret();
    };
    // The builder is awaitable.
    builder.then = (
      onFulfilled: (r: unknown) => unknown,
      onRejected?: (r: unknown) => unknown,
    ) => Promise.resolve(rec.result).then(onFulfilled, onRejected);
    return builder;
  };

  return {
    client: { from: fromImpl } as unknown as SupabaseClient,
    records,
  };
}

const RANGE_START = new Date("2026-04-01T00:00:00Z");
const RANGE_END = new Date("2026-04-28T23:59:59Z");

describe("getAdminAccountIds", () => {
  it("returns a set of admin account ids", async () => {
    const { client, records } = makeFakeSupabase([
      {
        table: "accounts",
        filters: [],
        result: {
          data: [{ id: "admin-1" }, { id: "admin-2" }],
          error: null,
        },
      },
    ]);

    const ids = await getAdminAccountIds(client);
    expect(ids).toEqual(new Set(["admin-1", "admin-2"]));
    expect(records[0].table).toBe("accounts");
    expect(records[0].filters).toContainEqual({
      op: "eq",
      field: "role",
      value: "admin",
    });
  });

  it("returns empty set when no admins exist", async () => {
    const { client } = makeFakeSupabase([
      { table: "accounts", filters: [], result: { data: [], error: null } },
    ]);
    const ids = await getAdminAccountIds(client);
    expect(ids.size).toBe(0);
  });
});

describe("getPortalSessions", () => {
  it("counts distinct non-admin session_ids in range", async () => {
    const { client, records } = makeFakeSupabase([
      {
        table: "page_views",
        filters: [],
        result: {
          data: [
            { session_id: "sess-A", account_id: null },
            { session_id: "sess-A", account_id: null },
            { session_id: "sess-B", account_id: "patient-1" },
            { session_id: "sess-C", account_id: "admin-1" },
            { session_id: null, account_id: null },
          ],
          error: null,
        },
      },
    ]);

    const ctx: PortalQueryContext = {
      supabase: client,
      adminIds: new Set(["admin-1"]),
    };
    const count = await getPortalSessions(ctx, RANGE_START, RANGE_END);

    // sess-A (null account) + sess-B (patient) = 2; sess-C dropped (admin); null sid dropped.
    expect(count).toBe(2);
    expect(records[0].table).toBe("page_views");
    expect(records[0].filters).toContainEqual({
      op: "gte",
      field: "created_at",
      value: RANGE_START.toISOString(),
    });
    expect(records[0].filters).toContainEqual({
      op: "lte",
      field: "created_at",
      value: RANGE_END.toISOString(),
    });
  });
});

describe("getEventCount", () => {
  it("filters by event_type + range and excludes admin account_ids", async () => {
    const { client, records } = makeFakeSupabase([
      {
        table: "analytics_events",
        filters: [],
        result: { count: 42, error: null },
      },
    ]);

    const ctx: PortalQueryContext = {
      supabase: client,
      adminIds: new Set(["admin-A", "admin-B"]),
    };
    const n = await getEventCount(
      ctx,
      "test_viewed",
      RANGE_START,
      RANGE_END,
    );

    expect(n).toBe(42);
    const rec = records[0];
    expect(rec.select?.columns).toBe("id");
    expect(rec.select?.opts).toEqual({ count: "exact", head: true });
    expect(rec.filters).toContainEqual({
      op: "eq",
      field: "event_type",
      value: "test_viewed",
    });
    // The admin-exclusion or-expression must include both ids.
    const orFilter = rec.filters.find((f) => f.op === "or");
    expect(orFilter).toBeDefined();
    expect(String(orFilter?.value)).toContain("account_id.is.null");
    expect(String(orFilter?.value)).toContain("admin-A");
    expect(String(orFilter?.value)).toContain("admin-B");
  });

  it("skips the admin-exclusion when the admin set is empty", async () => {
    const { client, records } = makeFakeSupabase([
      {
        table: "analytics_events",
        filters: [],
        result: { count: 17, error: null },
      },
    ]);
    const ctx: PortalQueryContext = {
      supabase: client,
      adminIds: new Set(),
    };
    const n = await getEventCount(
      ctx,
      "checkout_started",
      RANGE_START,
      RANGE_END,
    );
    expect(n).toBe(17);
    expect(records[0].filters.find((f) => f.op === "or")).toBeUndefined();
  });
});

describe("getCompletedOrderCount", () => {
  it("counts orders whose status indicates payment cleared", async () => {
    const { client, records } = makeFakeSupabase([
      {
        table: "orders",
        filters: [],
        result: { count: 7, error: null },
      },
    ]);
    const ctx: PortalQueryContext = {
      supabase: client,
      adminIds: new Set(),
    };
    const n = await getCompletedOrderCount(ctx, RANGE_START, RANGE_END);
    expect(n).toBe(7);

    const rec = records[0];
    const inFilter = rec.filters.find((f) => f.op === "in");
    expect(inFilter?.field).toBe("status");
    // pending + cancelled MUST NOT appear; everything else MUST.
    expect(inFilter?.value).toEqual([...COMPLETED_ORDER_STATUSES]);
    expect(inFilter?.value).not.toContain("pending");
    expect(inFilter?.value).not.toContain("cancelled");
  });
});

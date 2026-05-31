/**
 * End-to-end regression test for POST /api/results/upload (the
 * per-order batch upload). The user reported that ticking "Override
 * and upload anyway" for a name-mismatched PDF (PREMJI_JAMILA_*.pdf to
 * Irfaan Premji's order) still produced an HTTP 400 from the server,
 * because the route required a row in patient_profiles where
 * is_primary=true and the account didn't have one (a common case when
 * a customer orders for a family member under their own account
 * without finishing primary-profile setup).
 *
 * The fix made profile resolution robust: try primary, then a profile
 * linked through order_lines, then any profile on the account. This
 * test drives the route end-to-end through that fallback path —
 * 5 unit-level helper tests didn't catch the 400 because they tested
 * the client-side gate, not the server's profile lookup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  createClient: mockCreateClient,
  createServiceRoleClient: mockServiceClient,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
  createServiceRoleClient: mockServiceClient,
}));

// Stub global fetch so the route's internal /api/notify POST resolves.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch,
  );
});

// ─── Shared helpers ───────────────────────────────────────────────────

interface CapturedInsert {
  table: string;
  payload: unknown;
}

interface FixtureOpts {
  /** Does the account have a row in patient_profiles where is_primary=true? */
  primaryExists: boolean;
  /** Profiles available via order_lines for this order. */
  orderLineProfileIds: string[];
  /** Any profile on the account (last-resort fallback). */
  anyAccountProfileId: string | null;
}

/**
 * Build a service-role client mock with table-aware responses that
 * distinguish the primary-profile query from the order_lines query
 * from the any-profile-on-account query — the three layers of the
 * server's fallback chain.
 */
function buildServiceClient(opts: FixtureOpts) {
  const captured: CapturedInsert[] = [];
  const storageUploads: Array<{ path: string }> = [];

  const fakeBuilder = (table: string) => {
    // Track which filters were applied in this chain so we can return
    // the correct response (e.g. is_primary=true vs not).
    const filters: Array<{ field: string; value: unknown }> = [];
    let limited = false;

    const builder: Record<string, unknown> = {};

    builder.select = () => builder;
    builder.eq = (field: string, value: unknown) => {
      filters.push({ field, value });
      return builder;
    };
    builder.in = () => builder;
    builder.update = () => builder;
    builder.limit = () => {
      limited = true;
      return builder;
    };

    builder.maybeSingle = async () => {
      if (table === "patient_profiles") {
        const isPrimaryFilter = filters.find(
          (f) => f.field === "is_primary",
        );
        if (isPrimaryFilter?.value === true) {
          // Primary-profile lookup.
          return opts.primaryExists
            ? { data: { id: "primary-profile-id" }, error: null }
            : { data: null, error: null };
        }
        if (limited) {
          // Any-profile-on-account fallback.
          return opts.anyAccountProfileId
            ? { data: { id: opts.anyAccountProfileId }, error: null }
            : { data: null, error: null };
        }
      }
      if (table === "accounts") {
        return { data: { role: "admin" }, error: null };
      }
      return { data: null, error: null };
    };

    builder.single = async () => {
      if (table === "orders") {
        return {
          data: { id: "order-1", account_id: "account-1" },
          error: null,
        };
      }
      if (table === "results") {
        return {
          data: { id: `result-${captured.length}` },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    builder.insert = (payload: unknown) => {
      captured.push({ table, payload });
      // analytics_events insert is consumed via .then(); orders update
      // is fired-and-forgotten too. results insert is followed by
      // .select("id").single().
      const thenable: PromiseLike<{ error: null }> &
        Record<string, unknown> = {
        then: (resolve) => Promise.resolve({ error: null }).then(resolve),
        select: () => builder,
      };
      return table === "analytics_events" ? thenable : builder;
    };

    // order_lines query: await without .single()/.maybeSingle(). Make
    // the builder itself thenable to a list response.
    if (table === "order_lines") {
      const listThenable: PromiseLike<{
        data: Array<{ profile_id: string }> | null;
        error: null;
      }> = {
        then: (resolve) =>
          Promise.resolve({
            data: opts.orderLineProfileIds.map((p) => ({ profile_id: p })),
            error: null,
          }).then(resolve),
      };
      Object.assign(builder, listThenable);
    }

    // orders.update().eq() in the route is awaited via the builder's
    // own thenable shape — covered by the catch-all path below.

    return builder;
  };

  const service = {
    from: (table: string) => fakeBuilder(table),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          storageUploads.push({ path });
          return { data: { path }, error: null };
        },
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };

  return { service, captured, storageUploads };
}

function buildAuthClient(opts: { admin: boolean }) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "admin-user-1" } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: opts.admin ? { role: "admin" } : { role: "patient" },
            error: null,
          }),
        }),
      }),
    }),
  };
}

function makeRequest(fd: FormData) {
  return {
    formData: async () => fd,
  } as unknown as import("next/server").NextRequest;
}

function makeFile(name: string) {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: "application/pdf",
  });
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("POST /api/results/upload — profile resolution + override audit", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockServiceClient.mockReset();
  });

  it("succeeds when primary profile exists (happy path)", async () => {
    const { service, captured } = buildServiceClient({
      primaryExists: true,
      orderLineProfileIds: [],
      anyAccountProfileId: null,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const fd = new FormData();
    fd.append("order_id", "order-1");
    fd.append("result_status", "final");
    fd.append("file", makeFile("CORCORAN_TIMOTHY_x.pdf"));

    const { POST } = await import("@/app/api/results/upload/route");
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploaded).toHaveLength(1);
    expect(body.failed ?? []).toEqual([]);

    const insert = captured.find((c) => c.table === "results");
    expect((insert?.payload as { profile_id: string }).profile_id).toBe(
      "primary-profile-id",
    );
  });

  it("falls back to order_lines profile when no primary exists (the user's reported case)", async () => {
    const { service, captured } = buildServiceClient({
      primaryExists: false,
      orderLineProfileIds: ["irfaan-profile-id"],
      anyAccountProfileId: null,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const fd = new FormData();
    fd.append("order_id", "order-1");
    fd.append("result_status", "final");
    fd.append("file", makeFile("PREMJI_JAMILA_abc.pdf"));
    fd.append(
      "mismatch_overrides",
      JSON.stringify([
        {
          file_name: "PREMJI_JAMILA_abc.pdf",
          detected_pdf_name: "Jamila Premji",
          client_profile_name: "Irfaan Premji",
        },
      ]),
    );

    const { POST } = await import("@/app/api/results/upload/route");
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploaded).toHaveLength(1);
    expect(body.failed ?? []).toEqual([]);

    const insert = captured.find((c) => c.table === "results");
    expect((insert?.payload as { profile_id: string }).profile_id).toBe(
      "irfaan-profile-id",
    );

    // The override audit row was written with the correct payload.
    const auditInserts = captured.filter(
      (c) => c.table === "analytics_events",
    );
    const overrideAudit = auditInserts.find((c) => {
      const p = c.payload;
      if (Array.isArray(p))
        return (p[0] as { event_type: string }).event_type ===
          "results_upload_mismatch_override";
      return false;
    });
    expect(overrideAudit).toBeDefined();
    const overrideRows = overrideAudit?.payload as Array<{
      event_type: string;
      event_data: {
        pdf_filename: string;
        detected_pdf_name: string;
        client_profile_name: string;
        admin_user_id: string;
        order_id: string;
        results_row_id: string;
      };
    }>;
    expect(overrideRows).toHaveLength(1);
    expect(overrideRows[0].event_data.pdf_filename).toBe(
      "PREMJI_JAMILA_abc.pdf",
    );
    expect(overrideRows[0].event_data.detected_pdf_name).toBe(
      "Jamila Premji",
    );
    expect(overrideRows[0].event_data.client_profile_name).toBe(
      "Irfaan Premji",
    );
    expect(overrideRows[0].event_data.admin_user_id).toBe("admin-user-1");
    expect(overrideRows[0].event_data.order_id).toBe("order-1");
    expect(typeof overrideRows[0].event_data.results_row_id).toBe(
      "string",
    );
  });

  it("falls back to any account profile when neither primary nor order_lines provide one", async () => {
    const { service, captured } = buildServiceClient({
      primaryExists: false,
      orderLineProfileIds: [],
      anyAccountProfileId: "stray-profile-id",
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const fd = new FormData();
    fd.append("order_id", "order-1");
    fd.append("result_status", "final");
    fd.append("file", makeFile("x.pdf"));

    const { POST } = await import("@/app/api/results/upload/route");
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);

    const insert = captured.find((c) => c.table === "results");
    expect((insert?.payload as { profile_id: string }).profile_id).toBe(
      "stray-profile-id",
    );
  });

  it("returns 400 only when no profile exists anywhere", async () => {
    const { service } = buildServiceClient({
      primaryExists: false,
      orderLineProfileIds: [],
      anyAccountProfileId: null,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const fd = new FormData();
    fd.append("order_id", "order-1");
    fd.append("result_status", "final");
    fd.append("file", makeFile("x.pdf"));

    const { POST } = await import("@/app/api/results/upload/route");
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no patient profiles/i);
  });

  it("doesn't write an override audit row when override wasn't provided", async () => {
    const { service, captured } = buildServiceClient({
      primaryExists: true,
      orderLineProfileIds: [],
      anyAccountProfileId: null,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const fd = new FormData();
    fd.append("order_id", "order-1");
    fd.append("result_status", "final");
    fd.append("file", makeFile("CORCORAN_TIMOTHY_x.pdf"));

    const { POST } = await import("@/app/api/results/upload/route");
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);

    const auditInserts = captured.filter(
      (c) => c.table === "analytics_events",
    );
    const overrideAudit = auditInserts.find((c) => {
      const p = c.payload;
      if (Array.isArray(p))
        return (p[0] as { event_type: string }).event_type ===
          "results_upload_mismatch_override";
      return false;
    });
    expect(overrideAudit).toBeUndefined();
  });
});

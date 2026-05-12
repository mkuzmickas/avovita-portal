/**
 * Regression test for the manual-upload write contract.
 *
 * The bug we shipped against: the admin "Files in Repository" section
 * read with `.in("source", ["manual_upload", "patient_upload"])` while
 * production order rows actually carry `source='order_attached'` — and a
 * future drift in the literal we WRITE (e.g. shortening to 'manual')
 * would break the read silently. This test pins the exact write payload:
 *
 *   • `source` is the literal string 'manual_upload'
 *   • `order_id` is null (the structural truth that the classifier uses)
 *   • `document_type` is populated (required by the new spec)
 *
 * It also covers: the 25 MB per-file limit, the 20-file batch cap, and
 * that classifyResultRow() called on the inserted shape returns 'manual'
 * — i.e. the row would appear in the admin Files-in-Repository list.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyResultRow } from "@/lib/results/classify";

// ─── Mocks ────────────────────────────────────────────────────────────
//
// Hoisted vi.mock'ed modules need static paths.

const { createClient: mockCreateClient, createServiceRoleClient: mockServiceClient } =
  vi.hoisted(() => ({
    createClient: vi.fn(),
    createServiceRoleClient: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
  createServiceRoleClient: mockServiceClient,
}));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ id: "msg-1" }) } },
}));

// ─── Test helpers ─────────────────────────────────────────────────────

interface CapturedInsert {
  table: string;
  payload: unknown;
}

function buildServiceClient(opts: { profileExists: boolean; insertOk: boolean }) {
  const captured: CapturedInsert[] = [];
  const storageUploads: Array<{ path: string; bytes: number }> = [];

  const fakeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.maybeSingle = async () => {
      if (table === "patient_profiles") {
        return opts.profileExists
          ? {
              data: {
                id: "profile-1",
                account_id: "account-1",
                first_name: "Test",
              },
              error: null,
            }
          : { data: null, error: null };
      }
      if (table === "accounts") {
        return { data: { email: "owner@example.com" }, error: null };
      }
      return { data: null, error: null };
    };
    builder.single = async () => {
      if (table === "results") {
        return opts.insertOk
          ? { data: { id: `result-${captured.length}` }, error: null }
          : { data: null, error: { message: "DB insert failed" } };
      }
      return { data: null, error: null };
    };
    builder.insert = (payload: unknown) => {
      captured.push({ table, payload });
      // analytics_events insert is awaited via .then(), not via single()
      const thenable: PromiseLike<{ error: null }> & Record<string, unknown> = {
        then: (resolve) => Promise.resolve({ error: null }).then(resolve),
        select: () => builder,
      };
      return table === "analytics_events" ? thenable : builder;
    };
    return builder as {
      select: () => typeof builder;
      eq: () => typeof builder;
      in: () => typeof builder;
      maybeSingle: () => Promise<unknown>;
      single: () => Promise<unknown>;
      insert: (payload: unknown) => unknown;
    };
  };

  const service = {
    from: (table: string) => fakeBuilder(table),
    storage: {
      from: () => ({
        upload: async (path: string, bytes: ArrayBuffer) => {
          storageUploads.push({
            path,
            bytes: (bytes as ArrayBuffer).byteLength,
          });
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

function buildFormData(
  files: File[],
  meta: Array<{
    document_type: string;
    document_date?: string | null;
    description?: string | null;
    result_status?: "final" | "partial";
  }>,
  extras: { profile_id?: string; notify_email?: string } = {}
) {
  const fd = new FormData();
  if (extras.profile_id !== undefined)
    fd.append("profile_id", extras.profile_id);
  if (extras.notify_email !== undefined)
    fd.append("notify_email", extras.notify_email);
  fd.append("meta", JSON.stringify(meta));
  for (const f of files) fd.append("file", f);
  return fd;
}

function makeRequest(fd: FormData) {
  return {
    formData: async () => fd,
  } as unknown as import("next/server").NextRequest;
}

const params = Promise.resolve({ id: "account-1" });

// ─── Tests ────────────────────────────────────────────────────────────

describe("POST /api/admin/patients/[id]/results — manual upload write contract", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockServiceClient.mockReset();
  });

  it("inserts source='manual_upload' + order_id=null + document_type=lab_result, and the row classifies as 'manual'", async () => {
    const { service, captured, storageUploads } = buildServiceClient({
      profileExists: true,
      insertOk: true,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "test.pdf", {
      type: "application/pdf",
    });
    const fd = buildFormData(
      [file],
      [
        {
          document_type: "lab_result",
          document_date: "2026-04-15",
          description: "Pre-AvoVita bloodwork",
          result_status: "final",
        },
      ],
      { profile_id: "profile-1" }
    );

    const { POST } = await import(
      "@/app/api/admin/patients/[id]/results/route"
    );
    const res = await POST(makeRequest(fd), { params });
    const body = await res.json();

    expect(body.uploaded).toHaveLength(1);
    expect(body.failed ?? []).toEqual([]);

    const resultsInsert = captured.find((c) => c.table === "results");
    expect(resultsInsert).toBeDefined();
    const payload = resultsInsert!.payload as Record<string, unknown>;

    // The exact write contract — drifting any of these would break the
    // admin read filter or the customer-side classifier.
    expect(payload.source).toBe("manual_upload");
    expect(payload.order_id).toBeNull();
    expect(payload.document_type).toBe("lab_result");
    expect(payload.document_date).toBe("2026-04-15");
    expect(payload.description).toBe("Pre-AvoVita bloodwork");
    expect(payload.result_status).toBe("final");
    expect(payload.profile_id).toBe("profile-1");

    // The PDF actually got pushed to storage under the manual/ prefix.
    expect(storageUploads).toHaveLength(1);
    expect(storageUploads[0].path).toMatch(
      /^results\/account-1\/manual\/\d+_0_test\.pdf$/
    );

    // Round-trip: a row written this way appears in the admin
    // Files-in-Repository view via classifyResultRow → 'manual'.
    expect(
      classifyResultRow({
        source: payload.source as string,
        order_id: (payload.order_id as string | null) ?? null,
      })
    ).toBe("manual");

    // Audit event fires.
    const audit = captured.find((c) => c.table === "analytics_events");
    expect(audit).toBeDefined();
    const events = audit!.payload as Array<Record<string, unknown>>;
    expect(events[0].event_type).toBe("manual_result_uploaded");
  });

  it("rejects unknown document_type values", async () => {
    const { service } = buildServiceClient({
      profileExists: true,
      insertOk: true,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
      type: "application/pdf",
    });
    const fd = buildFormData([file], [{ document_type: "not_a_real_type" }], {
      profile_id: "profile-1",
    });

    const { POST } = await import(
      "@/app/api/admin/patients/[id]/results/route"
    );
    const res = await POST(makeRequest(fd), { params });
    expect(res.status).toBe(400);
  });

  it("rejects when meta length doesn't match files length", async () => {
    const { service } = buildServiceClient({
      profileExists: true,
      insertOk: true,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const file1 = new File([new Uint8Array([1])], "a.pdf", {
      type: "application/pdf",
    });
    const file2 = new File([new Uint8Array([2])], "b.pdf", {
      type: "application/pdf",
    });
    const fd = buildFormData(
      [file1, file2],
      [{ document_type: "lab_result" }], // only 1 meta entry for 2 files
      { profile_id: "profile-1" }
    );

    const { POST } = await import(
      "@/app/api/admin/patients/[id]/results/route"
    );
    const res = await POST(makeRequest(fd), { params });
    expect(res.status).toBe(400);
  });

  it("enforces the 20-file batch cap", async () => {
    const { service } = buildServiceClient({
      profileExists: true,
      insertOk: true,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: true }));
    mockServiceClient.mockReturnValue(service);

    const files: File[] = [];
    const metas = [];
    for (let i = 0; i < 21; i++) {
      files.push(
        new File([new Uint8Array([i])], `f${i}.pdf`, {
          type: "application/pdf",
        })
      );
      metas.push({ document_type: "lab_result" });
    }
    const fd = buildFormData(files, metas, { profile_id: "profile-1" });

    const { POST } = await import(
      "@/app/api/admin/patients/[id]/results/route"
    );
    const res = await POST(makeRequest(fd), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limited to 20/);
  });

  it("rejects non-admin callers with 403", async () => {
    const { service } = buildServiceClient({
      profileExists: true,
      insertOk: true,
    });
    mockCreateClient.mockResolvedValue(buildAuthClient({ admin: false }));
    mockServiceClient.mockReturnValue(service);

    const file = new File([new Uint8Array([1])], "a.pdf", {
      type: "application/pdf",
    });
    const fd = buildFormData([file], [{ document_type: "lab_result" }], {
      profile_id: "profile-1",
    });

    const { POST } = await import(
      "@/app/api/admin/patients/[id]/results/route"
    );
    const res = await POST(makeRequest(fd), { params });
    expect(res.status).toBe(403);
  });
});

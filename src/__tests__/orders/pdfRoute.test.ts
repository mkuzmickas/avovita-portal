/**
 * Regression tests for GET /api/orders/[orderId]/pdf.
 *
 * Covers the spec's auth + eligibility verification items:
 *   • Anonymous request → 401
 *   • Customer fetching someone else's order → 403
 *   • Customer fetching their own order → 200 (with a PDF body)
 *   • Admin fetching anyone's order → 200
 *   • Pending order → 409
 *   • Zero-dollar AVOVITA-TEST order → 409
 *   • Non-existent order id → 404
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

// ─── Fixtures ─────────────────────────────────────────────────────────

interface OrderFixture {
  id: string;
  status: string;
  account_id: string | null;
  subtotal_cad: number | null;
  discount_cad: number | null;
  home_visit_fee_cad: number | null;
  tax_cad: number | null;
  total_cad: number | null;
  appointment_date: string | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
}

function baseOrder(over: Partial<OrderFixture> = {}): OrderFixture {
  return {
    id: "order-1",
    status: "confirmed",
    account_id: "account-owner",
    subtotal_cad: 599,
    discount_cad: 0,
    home_visit_fee_cad: 85,
    tax_cad: 34.2,
    total_cad: 718.2,
    appointment_date: null,
    created_at: "2026-06-05T12:00:00Z",
    stripe_payment_intent_id: "pi_1",
    ...over,
  };
}

function authClient(opts: { userId: string | null; role?: "admin" | "patient" }) {
  return {
    auth: {
      getUser: async () =>
        opts.userId
          ? { data: { user: { id: opts.userId } }, error: null }
          : { data: { user: null }, error: null },
    },
    from: (table: string) => {
      if (table === "accounts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.userId ? { role: opts.role ?? "patient" } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };
}

function serviceClient(opts: {
  order: OrderFixture | null;
  lines?: Array<{
    id: string;
    line_type: string;
    quantity: number;
    unit_price_cad: number;
    custom_description: string | null;
    test: { name: string; sku: string | null } | null;
    supplement: { name: string; sku: string | null } | null;
    resource: { title: string } | null;
    profile: { first_name: string; last_name: string } | null;
  }>;
}) {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.maybeSingle = async () => {
        if (table === "orders") {
          return opts.order
            ? {
                data: {
                  ...opts.order,
                  account: { email: "owner@example.com" },
                  lines: opts.lines ?? [
                    {
                      id: "line-1",
                      line_type: "test",
                      quantity: 1,
                      unit_price_cad: 599,
                      custom_description: null,
                      test: { name: "ToxiPlex", sku: "ARM-TOXPX" },
                      supplement: null,
                      resource: null,
                      profile: { first_name: "Andrew", last_name: "Verreault" },
                    },
                  ],
                  visit_group: {
                    address_line1: "148 Creek Gardens Close NW",
                    address_line2: null,
                    city: "Airdrie",
                    province: "AB",
                    postal_code: "T4B 2R5",
                  },
                },
                error: null,
              }
            : { data: null, error: null };
        }
        if (table === "patient_profiles") {
          return {
            data: {
              first_name: "Andrew",
              last_name: "Verreault",
              date_of_birth: "1988-05-08",
              phone: "+14035898242",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      };
      return builder;
    },
  };
}

function makeRequest(): import("next/server").NextRequest {
  return {} as unknown as import("next/server").NextRequest;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("GET /api/orders/[orderId]/pdf", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockServiceClient.mockReset();
  });

  it("401 for anonymous requests", async () => {
    mockCreateClient.mockResolvedValue(authClient({ userId: null }));
    mockServiceClient.mockReturnValue(serviceClient({ order: baseOrder() }));
    const { GET } = await import("@/app/api/orders/[orderId]/pdf/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ orderId: "order-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("403 when a customer requests someone else's order", async () => {
    mockCreateClient.mockResolvedValue(
      authClient({ userId: "different-user", role: "patient" }),
    );
    mockServiceClient.mockReturnValue(serviceClient({ order: baseOrder() }));
    const { GET } = await import("@/app/api/orders/[orderId]/pdf/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ orderId: "order-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("200 with a PDF body when the owning customer requests it", async () => {
    mockCreateClient.mockResolvedValue(
      authClient({ userId: "account-owner", role: "patient" }),
    );
    mockServiceClient.mockReturnValue(serviceClient({ order: baseOrder() }));
    const { GET } = await import("@/app/api/orders/[orderId]/pdf/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ orderId: "order-1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/inline/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(500);
    // PDF files start with the magic bytes %PDF.
    const head = new TextDecoder().decode(new Uint8Array(buf).slice(0, 4));
    expect(head).toBe("%PDF");
  });

  it("200 when an admin requests any order", async () => {
    mockCreateClient.mockResolvedValue(
      authClient({ userId: "admin-user", role: "admin" }),
    );
    mockServiceClient.mockReturnValue(serviceClient({ order: baseOrder() }));
    const { GET } = await import("@/app/api/orders/[orderId]/pdf/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ orderId: "order-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("409 for orders still in 'pending' status", async () => {
    mockCreateClient.mockResolvedValue(
      authClient({ userId: "account-owner", role: "patient" }),
    );
    mockServiceClient.mockReturnValue(
      serviceClient({ order: baseOrder({ status: "pending" }) }),
    );
    const { GET } = await import("@/app/api/orders/[orderId]/pdf/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ orderId: "order-1" }),
    });
    expect(res.status).toBe(409);
  });

  it("409 for zero-dollar AVOVITA-TEST orders", async () => {
    mockCreateClient.mockResolvedValue(
      authClient({ userId: "account-owner", role: "patient" }),
    );
    mockServiceClient.mockReturnValue(
      serviceClient({
        order: baseOrder({ total_cad: 0, discount_cad: 599 }),
      }),
    );
    const { GET } = await import("@/app/api/orders/[orderId]/pdf/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ orderId: "order-1" }),
    });
    expect(res.status).toBe(409);
  });

  it("404 when the order id doesn't resolve", async () => {
    mockCreateClient.mockResolvedValue(
      authClient({ userId: "account-owner", role: "patient" }),
    );
    mockServiceClient.mockReturnValue(serviceClient({ order: null }));
    const { GET } = await import("@/app/api/orders/[orderId]/pdf/route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ orderId: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});

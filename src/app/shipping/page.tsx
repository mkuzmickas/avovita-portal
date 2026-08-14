import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { refreshShipmentTracking } from "@/lib/shipments/refresh-tracking";
import { ShippingPageClient } from "./ShippingPageClient";
import type { Account } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * /shipping — FedEx label creation console. Two ways to reach it:
 *   1. FloLabs bookmarked URL: /shipping?token=<SHIPPING_ACCESS_TOKEN>
 *   2. Admin sidebar link: /shipping (no token — authenticated session)
 *
 * Kept outside the (admin) route group so FloLabs never gains admin
 * chrome/perms — they interact with this page only. Admins get access
 * via their session so they don't have to memorise the token URL.
 *
 * If the FloLabs token is ever leaked, rotate SHIPPING_ACCESS_TOKEN
 * in Vercel and send FloLabs the fresh URL. Admin access is unaffected.
 */

interface SearchParams {
  token?: string;
}

async function isAdminSession(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  return account?.role === "admin";
}

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const expected = process.env.SHIPPING_ACCESS_TOKEN;
  const isAdmin = await isAdminSession();

  // Access rule: valid token OR admin session. Either grants full
  // access to the page (buttons, pickup, history).
  const tokenValid = !!expected && token === expected;
  if (!tokenValid && !isAdmin) {
    // Same 404 shape as any unknown Next route so a URL-fisher
    // doesn't learn the page exists.
    redirect("/");
  }

  // Bail with a clear error if SHIPPING_ACCESS_TOKEN is missing —
  // the API routes need it to authenticate label + pickup calls, so
  // the console can't function without it even for admins.
  if (!expected) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a1a0d",
          color: "#e05252",
          padding: "24px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Shipping is not configured on this deployment — set
        SHIPPING_ACCESS_TOKEN in Vercel env vars.
      </div>
    );
  }

  // Admins arrive with no token in URL; inject the env value so the
  // client's API calls still authenticate. FloLabs already has it.
  const clientToken = tokenValid ? token! : expected;

  // Load recent shipments for the audit table below the buttons.
  const supabase = createServiceRoleClient();
  const { data: initialRows } = await supabase
    .from("manual_shipments")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(20);

  // Opportunistically refresh tracking status for any shipment that's
  // still in flight and hasn't been checked recently. Non-blocking on
  // FedEx errors — page renders with whatever's already in the DB.
  const ids = (initialRows ?? []).map((r) => (r as { id: string }).id);
  await refreshShipmentTracking(supabase, ids);

  const { data: shipmentsRaw } = await supabase
    .from("manual_shipments")
    .select(
      "id, profile_kind, tracking_number, service_type, label_url, weight_lb, environment, created_at, tracking_status_code, tracking_status_description, delivered_at",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  type Shipment = {
    id: string;
    profile_kind: string;
    tracking_number: string;
    service_type: string | null;
    label_url: string | null;
    weight_lb: number | null;
    environment: string;
    created_at: string;
    tracking_status_code: string | null;
    tracking_status_description: string | null;
    delivered_at: string | null;
  };

  const recentShipments = (shipmentsRaw ?? []) as unknown as Shipment[];

  // Derive current environment from FEDEX_API_URL — pass to client so
  // the header shows an unambiguous SANDBOX vs PRODUCTION badge.
  // "Recent shipments" env comes from historical data; this is live.
  const environment = process.env.FEDEX_API_URL?.includes("sandbox")
    ? "sandbox"
    : "production";

  return (
    <ShippingPageClient
      token={clientToken}
      recentShipments={recentShipments}
      environment={environment}
      isAdmin={isAdmin}
    />
  );
}

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ShippingPageClient } from "./ShippingPageClient";

export const dynamic = "force-dynamic";

/**
 * /shipping — token-gated FedEx label creation for FloLabs (and
 * anyone else Mike hands the URL to). Not linked from anywhere
 * public; access is by shared secret in the URL only. Deliberately
 * NOT under /admin because we don't want FloLabs staff to have any
 * portal admin permissions.
 *
 * Access model:
 *   - Bookmarked URL: https://portal.avovita.ca/shipping?token=<secret>
 *   - Server compares token param to SHIPPING_ACCESS_TOKEN env var
 *   - Mismatch → renders "Not authorised" and no page contents
 *   - Match → renders the buttons page + passes token to client so
 *     the create-label fetch can send it back
 *
 * If the token is ever leaked, rotate SHIPPING_ACCESS_TOKEN in Vercel
 * and send FloLabs the fresh URL.
 */

interface SearchParams {
  token?: string;
}

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const expected = process.env.SHIPPING_ACCESS_TOKEN;

  if (!expected) {
    // Deployment misconfig. Render a plain error rather than exposing
    // that the token check exists.
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
        Shipping is not configured on this deployment.
      </div>
    );
  }

  if (token !== expected) {
    // Same 404 shape as any unknown Next route so a URL-fisher
    // doesn't learn the page exists.
    redirect("/");
  }

  // Load recent shipments for the audit table below the buttons.
  const supabase = createServiceRoleClient();
  const { data: shipmentsRaw } = await supabase
    .from("manual_shipments")
    .select(
      "id, profile_kind, tracking_number, service_type, label_url, weight_lb, environment, created_at",
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
  };

  const recentShipments = (shipmentsRaw ?? []) as unknown as Shipment[];

  return <ShippingPageClient token={token} recentShipments={recentShipments} />;
}

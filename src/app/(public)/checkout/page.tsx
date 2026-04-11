import { createClient } from "@/lib/supabase/server";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your AvoVita lab test order.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CheckoutClient
      accountUserId={user?.id ?? null}
      accountEmail={user?.email ?? null}
    />
  );
}

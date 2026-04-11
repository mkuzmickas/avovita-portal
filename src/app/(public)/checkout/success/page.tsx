import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { CheckCircle } from "lucide-react";
import { ProfileForm } from "@/components/ProfileForm";

interface SearchParams {
  session_id?: string;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (sessionId) {
    try {
      await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      // Session not found — still show success gate
    }
  }

  const { data: profiles } = await supabase
    .from("patient_profiles")
    .select("id, first_name, is_primary")
    .eq("account_id", user.id);

  const hasProfile = (profiles?.length ?? 0) > 0;

  if (hasProfile) {
    redirect("/portal/orders");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-lg">
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <div
            className="px-8 py-6 text-center border-b"
            style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
          >
            <CheckCircle
              className="w-12 h-12 mx-auto mb-3"
              style={{ color: "#c4973a" }}
            />
            <h1
              className="font-heading text-2xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Payment <span style={{ color: "#c4973a" }}>Confirmed</span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#e8d5a3" }}>
              One last step — create your patient profile so we know who to
              collect from.
            </p>
          </div>

          <div className="px-8 py-6">
            <div className="mb-6">
              <h2
                className="font-heading text-xl font-semibold mb-1"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Create Your Patient Profile
              </h2>
              <p className="text-sm" style={{ color: "#e8d5a3" }}>
                This information is required for specimen collection and your
                lab results. All data is protected under Alberta PIPA.
              </p>
            </div>

            <ProfileForm
              accountId={user.id}
              isPrimary={true}
              redirectAfter="/portal/orders"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

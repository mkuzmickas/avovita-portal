import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/portal/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal/settings");

  const email = user.email ?? "";

  // Preferences live on the Supabase Auth user_metadata — no schema change
  // required. Default to opted-in for both channels.
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const emailOptIn =
    typeof metadata.email_notifications === "boolean"
      ? metadata.email_notifications
      : true;
  const smsOptIn =
    typeof metadata.sms_notifications === "boolean"
      ? metadata.sms_notifications
      : true;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1
          className="font-heading text-3xl sm:text-4xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Account <span style={{ color: "#c4973a" }}>Settings</span>
        </h1>
        <p className="mt-1 text-sm sm:text-base" style={{ color: "#e8d5a3" }}>
          Manage your account and notification preferences.
        </p>
      </div>

      <SettingsClient
        email={email}
        initialEmailNotifications={emailOptIn}
        initialSmsNotifications={smsOptIn}
      />
    </div>
  );
}

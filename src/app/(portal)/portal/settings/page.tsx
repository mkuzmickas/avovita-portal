import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("email, role, created_at")
    .eq("id", user.id)
    .single() as {
    data: { email: string | null; role: string; created_at: string } | null;
    error: unknown;
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Account <span style={{ color: "#c4973a" }}>Settings</span>
        </h1>
      </div>

      <div
        className="rounded-xl border p-6 space-y-4"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-1"
            style={{ color: "#6ab04c" }}
          >
            Email
          </p>
          <p style={{ color: "#ffffff" }}>
            {account?.email ?? user.email}
          </p>
        </div>
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-1"
            style={{ color: "#6ab04c" }}
          >
            Account ID
          </p>
          <p className="font-mono text-sm" style={{ color: "#e8d5a3" }}>
            {user.id}
          </p>
        </div>
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-1"
            style={{ color: "#6ab04c" }}
          >
            Role
          </p>
          <p className="capitalize" style={{ color: "#e8d5a3" }}>
            {account?.role ?? "patient"}
          </p>
        </div>
        <div
          className="pt-4 border-t"
          style={{ borderColor: "#2d6b35" }}
        >
          <p className="text-sm" style={{ color: "#e8d5a3" }}>
            To update your email or password, please contact{" "}
            <a
              href="mailto:hello@avovita.ca"
              className="font-medium"
              style={{ color: "#c4973a" }}
            >
              hello@avovita.ca
            </a>
          </p>
          <p className="text-xs mt-2" style={{ color: "#6ab04c" }}>
            Your health information is protected under Alberta PIPA (Personal Information
            Protection Act). To request data deletion or a copy of your records, please email us.
          </p>
        </div>
      </div>
    </div>
  );
}

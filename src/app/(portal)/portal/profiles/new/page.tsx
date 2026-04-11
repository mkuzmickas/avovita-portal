import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";

export default async function NewProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Add Patient <span style={{ color: "#c4973a" }}>Profile</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Each profile can be a separate patient (e.g. a family member).
        </p>
      </div>
      <div
        className="rounded-2xl border p-8"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <ProfileForm
          accountId={user.id}
          isPrimary={false}
          redirectAfter="/portal/profiles"
        />
      </div>
    </div>
  );
}

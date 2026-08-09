"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Loader2, User, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileForm } from "@/components/portal/ProfileForm";
import type { PatientProfile } from "@/types/database";

interface ProfileCompletionCardProps {
  /** Order UUID — passed to /api/checkout/complete-profile so the
   *  FloLabs requisition (deferred from webhook time) can re-fire. */
  orderId: string | null;
  /**
   * Called when every profile on the account has complete identity
   * fields. Used by the parent (CheckoutSuccessV2) to unlock the
   * FloLabs booking step — before this fires, the booking card
   * stays disabled because the lab requisition would go out with
   * NULL patient fields.
   */
  onComplete: () => void;
}

interface AccountProfile {
  id: string;
  is_primary: boolean;
  is_dependent: boolean;
  relationship: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  biological_sex: "male" | "female" | "intersex" | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
}

/**
 * Post-payment profile completion. Since Aug 2026, checkout no
 * longer collects name / DOB / biological sex — the webhook creates
 * empty patient_profiles rows keyed to the order, and this card
 * walks the customer through filling each one. Rendered inside
 * CheckoutSuccessV2 above the Waiver + Booking steps so the FloLabs
 * requisition email (which needs patient details) can fire before
 * the customer books a collection slot.
 *
 * Handles single- and multi-person orders — cycles ProfileForm
 * instances one at a time, keying on profile.id so state resets
 * cleanly between them.
 *
 * Idempotent: if the customer refreshes after saving some but not
 * all profiles, this reloads the remaining incomplete ones and
 * picks up where they left off.
 */
export function ProfileCompletionCard({
  orderId,
  onComplete,
}: ProfileCompletionCardProps) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finalising, setFinalising] = useState(false);
  const [finaliseError, setFinaliseError] = useState<string | null>(null);
  const [allComplete, setAllComplete] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setAccountId(user.id);
    const { data } = await supabase
      .from("patient_profiles")
      .select(
        "id, is_primary, is_dependent, relationship, first_name, last_name, date_of_birth, biological_sex, phone, address_line1, address_line2, city, province, postal_code",
      )
      .eq("account_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as unknown as AccountProfile[];
    setProfiles(rows);
    // Skip past any already-complete profiles so a returning customer
    // resumes on the next incomplete one.
    const firstIncomplete = rows.findIndex(isIncomplete);
    if (firstIncomplete === -1 && rows.length > 0) {
      setAllComplete(true);
    } else if (firstIncomplete > 0) {
      setCurrentIdx(firstIncomplete);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Once all profiles are complete, notify parent so booking unlocks.
  // Guard against double-firing during finalisation state churn.
  useEffect(() => {
    if (allComplete) onComplete();
  }, [allComplete, onComplete]);

  const finalise = async () => {
    setFinalising(true);
    setFinaliseError(null);
    if (orderId) {
      try {
        const res = await fetch("/api/checkout/complete-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        });
        // Non-blocking on failure — the customer can still book;
        // admin can re-fire the requisition manually if needed. We
        // surface the warning inline so they know something's up.
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { reason?: string }
            | null;
          console.warn(
            "[profile-completion] complete-profile non-OK:",
            res.status,
            data?.reason,
          );
          setFinaliseError(
            "We saved your info but had trouble notifying the lab. Booking still works — email support@avovita.ca if you don't hear from FloLabs within an hour.",
          );
        }
      } catch (err) {
        console.warn("[profile-completion] complete-profile threw:", err);
        setFinaliseError(
          "We saved your info but had trouble notifying the lab. Booking still works — email support@avovita.ca if you don't hear from FloLabs within an hour.",
        );
      }
    }
    setFinalising(false);
    setAllComplete(true);
  };

  const handleSaved = async () => {
    // Refresh profile list so the just-saved fields are reflected;
    // otherwise the "all complete" derivation still sees the stale row.
    const supabase = createClient();
    if (!accountId) return;
    const { data } = await supabase
      .from("patient_profiles")
      .select(
        "id, is_primary, is_dependent, relationship, first_name, last_name, date_of_birth, biological_sex, phone, address_line1, address_line2, city, province, postal_code",
      )
      .eq("account_id", accountId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as unknown as AccountProfile[];
    setProfiles(rows);

    const nextIncomplete = rows.findIndex((p, idx) => idx > currentIdx && isIncomplete(p));
    if (nextIncomplete !== -1) {
      setCurrentIdx(nextIncomplete);
    } else if (rows.every((p) => !isIncomplete(p))) {
      await finalise();
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-2xl border p-6 mb-6"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="flex items-center gap-2" style={{ color: "#e8d5a3" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading your profile…</span>
        </div>
      </div>
    );
  }

  if (allComplete) {
    // Rendered as a collapsed done-card so the customer can see the
    // step is complete even though it's not the current focus.
    return (
      <div
        className="rounded-2xl border p-4 mb-6"
        style={{
          backgroundColor: "rgba(141, 198, 63, 0.08)",
          borderColor: "#8dc63f",
        }}
      >
        <div className="flex items-center gap-2" style={{ color: "#8dc63f" }}>
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">
            Profile{profiles.length > 1 ? "s" : ""} complete
          </span>
        </div>
      </div>
    );
  }

  if (profiles.length === 0 || !accountId) {
    return (
      <div
        className="rounded-2xl border p-6 mb-6"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="flex items-center gap-2" style={{ color: "#e8d5a3" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">
            Preparing your profile — one moment…
          </span>
        </div>
      </div>
    );
  }

  const current = profiles[currentIdx];
  const isLast = !profiles.slice(currentIdx + 1).some(isIncomplete);
  const isMulti = profiles.length > 1;
  const roleLabel = current.is_primary
    ? "yourself"
    : current.relationship
      ? `${current.relationship.replace(/_/g, " ")} (Person ${currentIdx + 1})`
      : `Person ${currentIdx + 1}`;

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6 mb-6"
      style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <User className="w-5 h-5" style={{ color: "#c4973a" }} />
        <p
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "#c4973a", letterSpacing: "0.1em" }}
        >
          {isMulti
            ? `Profile ${currentIdx + 1} of ${profiles.length}`
            : "Your Profile"}
        </p>
      </div>
      <h3
        className="font-heading text-xl font-semibold mb-2"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Tell us about{" "}
        <span style={{ color: "#c4973a" }}>{roleLabel}</span>
      </h3>
      <p className="text-sm mb-4" style={{ color: "#e8d5a3" }}>
        Name, date of birth and biological sex are required on the lab
        requisition. Results are matched to this information on the
        portal, so make sure it&apos;s exactly the name you want on
        record.
      </p>

      {finaliseError && (
        <div
          className="flex items-start gap-2.5 rounded-lg border px-4 py-3 mb-4"
          style={{
            backgroundColor: "rgba(224, 82, 82, 0.12)",
            borderColor: "#e05252",
          }}
        >
          <AlertCircle
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: "#e05252" }}
          />
          <p className="text-sm" style={{ color: "#e05252" }}>
            {finaliseError}
          </p>
        </div>
      )}

      <ProfileForm
        key={current.id}
        accountId={accountId}
        isPrimary={current.is_primary}
        existingProfile={current as unknown as PatientProfile}
        submitLabel={
          finalising
            ? "Finalising…"
            : isLast
              ? "Save and Continue"
              : "Save and Next Person"
        }
        onSuccess={() => handleSaved()}
      />
    </div>
  );
}

function isIncomplete(p: AccountProfile): boolean {
  return (
    !p.first_name?.trim() ||
    !p.last_name?.trim() ||
    !p.date_of_birth?.trim() ||
    !p.biological_sex
  );
}

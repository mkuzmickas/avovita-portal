"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { AdminPatientProfile } from "@/app/(admin)/admin/patients/page";
import { EditPatientProfileModal } from "./EditPatientProfileModal";

interface ProfileEditTriggerProps {
  accountId: string;
  profile: AdminPatientProfile;
}

/**
 * Small pencil pill dropped into each profile card on the admin
 * patient detail page. Owns the modal state so the parent can stay a
 * server component.
 */
export function ProfileEditTrigger({
  accountId,
  profile,
}: ProfileEditTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors"
        style={{
          backgroundColor: "rgba(196, 151, 58, 0.10)",
          borderColor: "#c4973a",
          color: "#c4973a",
        }}
      >
        <Pencil className="w-3 h-3" />
        Edit
      </button>
      {open && (
        <EditPatientProfileModal
          accountId={accountId}
          profile={profile}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

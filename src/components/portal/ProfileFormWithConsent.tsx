"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileForm } from "./ProfileForm";
import { ConsentModal } from "./ConsentModal";
import type { PatientProfile } from "@/types/database";

export interface ProfileFormWithConsentProps {
  accountId: string;
  /**
   * If true and this is the first profile (isPrimary), the general PIPA
   * consent modal will appear after saving. Used in the portal profiles
   * flow where a patient may be creating their very first profile.
   */
  requireGeneralConsent?: boolean;
  isPrimary?: boolean;
  existingProfile?: PatientProfile;
  redirectAfter?: string;
  onComplete?: () => void;
}

/**
 * Wraps `ProfileForm` and shows `ConsentModal` after save when the
 * caller requests the general PIPA consent. Used by the portal /profiles
 * pages — NOT used by the post-purchase gate, which runs its own
 * multi-step wizard.
 */
export function ProfileFormWithConsent({
  accountId,
  requireGeneralConsent = false,
  isPrimary = false,
  existingProfile,
  redirectAfter,
  onComplete,
}: ProfileFormWithConsentProps) {
  const router = useRouter();
  const [consentNeededForProfileId, setConsentNeededForProfileId] = useState<
    string | null
  >(null);

  const handleSuccess = (profileId: string) => {
    if (requireGeneralConsent && !existingProfile) {
      setConsentNeededForProfileId(profileId);
      return;
    }
    onComplete?.();
    if (redirectAfter) {
      router.push(redirectAfter);
      router.refresh();
    }
  };

  const handleConsentComplete = () => {
    setConsentNeededForProfileId(null);
    onComplete?.();
    if (redirectAfter) {
      router.push(redirectAfter);
      router.refresh();
    }
  };

  return (
    <>
      <ProfileForm
        accountId={accountId}
        isPrimary={isPrimary}
        existingProfile={existingProfile}
        onSuccess={handleSuccess}
      />

      {consentNeededForProfileId && (
        <ConsentModal
          accountId={accountId}
          profileId={consentNeededForProfileId}
          labNames={[]}
          onComplete={handleConsentComplete}
        />
      )}
    </>
  );
}

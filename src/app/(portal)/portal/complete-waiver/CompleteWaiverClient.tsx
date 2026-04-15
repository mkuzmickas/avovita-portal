"use client";

import { useRouter } from "next/navigation";
import { WaiverForm } from "@/components/portal/WaiverForm";

interface Props {
  isRepresentative: boolean;
  dependents: Array<{ first_name: string; last_name: string }>;
  representativeRelationship: string | null;
}

export function CompleteWaiverClient({
  isRepresentative,
  dependents,
  representativeRelationship,
}: Props) {
  const router = useRouter();
  return (
    <WaiverForm
      onComplete={() => {
        router.push("/portal");
        router.refresh();
      }}
      isRepresentative={isRepresentative}
      dependents={dependents}
      representativeRelationship={representativeRelationship}
    />
  );
}

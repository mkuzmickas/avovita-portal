"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteMyRecordButton({ resultId }: { resultId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!confirm("Delete this file permanently? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/my-records/${resultId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to delete: ${data.error ?? res.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label="Delete"
      className="p-2 rounded-lg transition-colors"
      style={{ color: "#e05252", opacity: busy ? 0.5 : 1 }}
      title="Delete this file"
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Trash2 className="w-4 h-4" />
      )}
    </button>
  );
}

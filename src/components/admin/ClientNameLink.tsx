"use client";

import { useState } from "react";
import { ClientSummaryModal } from "./ClientSummaryModal";

interface ClientNameLinkProps {
  accountId: string | null | undefined;
  children: React.ReactNode;
  /** Optional override for the hover-cursor + underline treatment. */
  className?: string;
  /** When true, the click handler won't bubble up — important inside a
   *  row-level onClick like the Orders table expand toggle. */
  stopPropagation?: boolean;
}

/**
 * Wraps a client name (or any inline label) in a button that opens the
 * shared ClientSummaryModal. Falls back to a plain span when no
 * accountId is available (invoice-mirrored orders with no account).
 */
export function ClientNameLink({
  accountId,
  children,
  className,
  stopPropagation = true,
}: ClientNameLinkProps) {
  const [open, setOpen] = useState(false);
  if (!accountId) {
    return <span className={className}>{children}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setOpen(true);
        }}
        className={className}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textDecorationColor: "rgba(196,151,58,0.5)",
          textUnderlineOffset: "3px",
        }}
        title="Open client summary"
      >
        {children}
      </button>
      {open && (
        <ClientSummaryModal
          accountId={accountId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

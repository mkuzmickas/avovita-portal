"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, XCircle, ExternalLink, Loader2 } from "lucide-react";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  status: "draft" | "sent" | "paid" | "void";
  hostedInvoiceUrl: string | null;
}

export function InvoiceDetailActions({
  invoiceId,
  invoiceNumber,
  status,
  hostedInvoiceUrl,
}: Props) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onResend = async () => {
    setResending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/resend`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const bits: string[] = [];
      if (data.email) bits.push("email");
      if (data.sms) bits.push("SMS");
      setFeedback(
        bits.length > 0
          ? `Resent (${bits.join(" + ")})`
          : "No notification channels available for this customer",
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setResending(false);
    }
  };

  const onVoid = async () => {
    setVoiding(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/void`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setVoidConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Void failed");
    } finally {
      setVoiding(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {hostedInvoiceUrl && (
            <a
              href={hostedInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{
                backgroundColor: "transparent",
                borderColor: "#2d6b35",
                color: "#e8d5a3",
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Stripe page
            </a>
          )}
          {status === "sent" && (
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50"
              style={{
                backgroundColor: "transparent",
                borderColor: "#c4973a",
                color: "#c4973a",
              }}
            >
              {resending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Resend email + SMS
            </button>
          )}
          {(status === "draft" || status === "sent") && (
            <button
              type="button"
              onClick={() => setVoidConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{
                backgroundColor: "transparent",
                borderColor: "#e05252",
                color: "#e05252",
              }}
            >
              <XCircle className="w-3 h-3" />
              Void
            </button>
          )}
        </div>
        {feedback && (
          <p className="text-xs" style={{ color: "#8dc63f" }}>
            {feedback}
          </p>
        )}
      </div>

      {voidConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => !voiding && setVoidConfirmOpen(false)}
        >
          <div
            className="rounded-xl border max-w-md w-full p-5"
            style={{ backgroundColor: "#1a3d22", borderColor: "#e05252" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="font-heading text-lg font-semibold mb-2"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Void invoice {invoiceNumber}?
            </h3>
            <p className="text-sm mb-5" style={{ color: "#e8d5a3" }}>
              The invoice will be marked void in Stripe and locally. The
              customer will no longer be able to pay it via the hosted
              link. Already-paid invoices can&apos;t be voided — handle
              refunds in Stripe directly.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidConfirmOpen(false)}
                disabled={voiding}
                className="px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
                style={{
                  backgroundColor: "transparent",
                  borderColor: "#2d6b35",
                  color: "#e8d5a3",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onVoid}
                disabled={voiding}
                className="px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                style={{ backgroundColor: "#e05252", color: "#ffffff" }}
              >
                {voiding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Void invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

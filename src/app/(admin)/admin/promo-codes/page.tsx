import { PROMO_REGISTRY } from "@/lib/promo/promoCodes";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  whole_cart_percent: "Whole cart (percent off)",
  whole_cart_amount: "Whole cart (fixed off)",
  flolabs_base_fee_waiver: "FloLabs base fee waiver",
};

function formatDiscount(p: (typeof PROMO_REGISTRY)[number]): string {
  switch (p.type) {
    case "whole_cart_percent":
      return `${p.percentOff ?? 0}% off`;
    case "whole_cart_amount":
    case "flolabs_base_fee_waiver":
      return `−$${(p.amountCad ?? 0).toFixed(2)}`;
  }
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminPromoCodesPage() {
  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Promo <span style={{ color: "#c4973a" }}>Codes</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Read-only view of the active promo code registry.
        </p>
      </div>

      <div
        className="rounded-xl border p-4 mb-6 text-sm"
        style={{
          backgroundColor: "rgba(196, 151, 58, 0.08)",
          borderColor: "#c4973a",
          color: "#e8d5a3",
        }}
      >
        <p className="font-semibold" style={{ color: "#c4973a" }}>
          Managed in code
        </p>
        <p className="mt-1">
          Promo codes are defined in{" "}
          <code
            className="px-1 py-0.5 rounded text-xs"
            style={{ backgroundColor: "#0f2614", color: "#8dc63f" }}
          >
            src/lib/promo/promoCodes.ts
          </code>
          . To add / remove / edit a code, modify the{" "}
          <code
            className="px-1 py-0.5 rounded text-xs"
            style={{ backgroundColor: "#0f2614", color: "#8dc63f" }}
          >
            PROMO_REGISTRY
          </code>{" "}
          array and deploy. Changes via this screen are not possible —
          deploys are the right gate for three codes.
        </p>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Code",
                  "Type",
                  "Discount",
                  "Expires",
                  "Description",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                    style={{
                      color: "#c4973a",
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROMO_REGISTRY.map((p, idx) => {
                const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                const expired =
                  p.validUntil !== null &&
                  new Date(p.validUntil).getTime() < Date.now();
                return (
                  <tr
                    key={p.code}
                    style={{ backgroundColor: rowBg }}
                  >
                    <td
                      className="px-4 py-3 font-mono font-semibold"
                      style={{ color: expired ? "#6b7280" : "#ffffff" }}
                    >
                      {p.code}
                    </td>
                    <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
                      {TYPE_LABEL[p.type] ?? p.type}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "#c4973a" }}
                    >
                      {formatDiscount(p)}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: expired ? "#e05252" : "#e8d5a3" }}
                    >
                      {formatExpiry(p.validUntil)}
                      {expired && " (expired)"}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ color: "#e8d5a3" }}
                    >
                      {p.description}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, ShoppingCart, Check, ChevronDown, FileText, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  formatShipTempLong,
  formatStability,
} from "@/lib/tests/shipTempDisplay";
import { PanelIncludes } from "./PanelIncludes";
import type { CatalogueTest, CatalogueCartItem } from "./types";

interface TestCardProps {
  test: CatalogueTest;
  inCart: boolean;
  onAdd: (item: CatalogueCartItem) => void;
  /** Controlled by parent — when true, inline details are shown. */
  expanded?: boolean;
}

export function TestCard({
  test,
  inCart,
  onAdd,
  expanded = false,
}: TestCardProps) {
  const [justAdded, setJustAdded] = useState(false);

  const hasPrice = test.price_cad !== null;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inCart || justAdded || !hasPrice) return;
    onAdd({
      line_type: "test" as const,
      test_id: test.id,
      test_name: test.name,
      price_cad: test.price_cad as number,
      lab_name: test.lab.name,
      quantity: 1,
      collection_method: test.collection_method,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const showInCart = inCart || justAdded;

  return (
    <article
      id={`test-${test.id}`}
      className="flex flex-col rounded-xl border overflow-hidden transition-colors h-full"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="px-5 pt-5 pb-4 flex-1 flex flex-col">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
            style={{
              backgroundColor: "#0f2614",
              borderColor: "#8dc63f",
              color: "#8dc63f",
            }}
          >
            {test.lab.name}
          </span>
          {test.category && (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#c4973a",
                color: "#c4973a",
              }}
            >
              {test.category}
            </span>
          )}
        </div>

        {/* Test name — links to /tests?test=SKU (or ?id= fallback) so the
            catalogue detail view scrolls/expands to this test. */}
        <h3
          className="font-heading font-semibold leading-tight mb-3 break-words"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: "20px",
            overflowWrap: "anywhere",
          }}
        >
          <Link
            href={
              test.sku
                ? `/tests?test=${encodeURIComponent(test.sku)}`
                : `/tests?id=${test.id}`
            }
            onClick={(e) => e.stopPropagation()}
            className="test-card-title-link cursor-pointer"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            {test.name}
          </Link>
        </h3>

        {/* Price */}
        <p
          className="font-semibold mb-2"
          style={{ color: "#c4973a", fontSize: "26px" }}
        >
          {hasPrice ? (
            <>
              {formatCurrency(test.price_cad as number)}
              <span
                className="text-xs font-normal ml-1.5"
                style={{ color: "#e8d5a3" }}
              >
                CAD
              </span>
            </>
          ) : (
            <span style={{ fontSize: "18px" }}>Contact us for pricing</span>
          )}
        </p>

        {/* Requisition required notice */}
        {test.requisition_url && (
          <div
            className="flex items-start gap-2 rounded-md border px-3 py-2 mb-3"
            style={{
              backgroundColor: "rgba(196,151,58,0.1)",
              borderColor: "#c4973a",
            }}
          >
            <FileText
              className="w-3.5 h-3.5 shrink-0 mt-0.5"
              style={{ color: "#c4973a" }}
            />
            <span className="text-xs" style={{ color: "#c4973a" }}>
              Physician requisition required — must be present at time of collection
            </span>
          </div>
        )}

        {/* Included panel tests (collapsible) */}
        {test.panel_tests && test.panel_tests.length > 0 && (
          <PanelIncludes panelTests={test.panel_tests} variant="card" />
        )}

        {/* Turnaround */}
        {test.turnaround_display && (
          <div
            className="flex items-start gap-1.5 text-xs mb-4"
            style={{ color: "#e8d5a3" }}
          >
            <Clock
              className="w-3.5 h-3.5 shrink-0 mt-0.5"
              style={{ color: "#8dc63f" }}
            />
            <span
              className="min-w-0 flex-1 break-words"
              style={{ overflowWrap: "anywhere" }}
            >
              {test.turnaround_display}
            </span>
          </div>
        )}

        {/* Expanded inline details */}
        {expanded && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mb-4 space-y-3"
          >
            {test.description && (
              <p
                className="text-sm leading-relaxed"
                style={{ color: "#e8d5a3" }}
              >
                {test.description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <DetailField
                label="Handling"
                value={formatShipTempLong(test.ship_temp)}
              />
              <DetailField
                label="Stability"
                value={formatStability(test)}
              />
            </div>

            {test.panel_tests && test.panel_tests.length > 0 && (
              <PanelIncludes panelTests={test.panel_tests} variant="detail" />
            )}

            {test.requisition_url && (
              <a
                href={test.requisition_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: "#c4973a",
                  color: "#0a1a0d",
                  border: "none",
                  fontWeight: 600,
                }}
              >
                <Download className="w-4 h-4" />
                Download Requisition Form
              </a>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Add to cart — or Contact Us when no price */}
        {hasPrice ? (
          <button
            type="button"
            onClick={handleAdd}
            disabled={showInCart}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={
              showInCart
                ? {
                    backgroundColor: "rgba(141, 198, 63, 0.15)",
                    color: "#8dc63f",
                    border: "1px solid #8dc63f",
                    cursor: "default",
                  }
                : {
                    backgroundColor: "#c4973a",
                    color: "#0a1a0d",
                  }
            }
          >
            {showInCart ? (
              <>
                <Check className="w-4 h-4" />
                In Cart
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                Add to Cart
              </>
            )}
          </button>
        ) : (
          <a
            href="mailto:support@avovita.ca"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            Contact Us to Order
          </a>
        )}

        {/* View Details indicator */}
        <div
          className="flex items-center justify-center gap-1 mt-3 text-xs font-medium select-none"
          style={{ color: "rgba(196, 151, 58, 0.75)" }}
        >
          <span>{expanded ? "Hide Details" : "View Details"}</span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform duration-200"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>
    </article>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <p
        className="text-xs uppercase tracking-wider mb-0.5"
        style={{ color: "#6ab04c" }}
      >
        {label}
      </p>
      <p
        className="text-sm break-words"
        style={{ color: "#ffffff", overflowWrap: "anywhere" }}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}


"use client";

import { useState } from "react";
import { ChevronDown, Clock, ShoppingCart, Check, FileText, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  formatShipTempLong,
  formatStability,
} from "@/lib/tests/shipTempDisplay";
import { PanelIncludes } from "./PanelIncludes";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import { cartItemId } from "./types";
import type { CatalogueTest, CatalogueCartItem, CartItem } from "./types";

interface TestTableProps {
  tests: CatalogueTest[];
  cart: CartItem[];
  onAdd: (item: CatalogueCartItem) => void;
  onClearFilters?: () => void;
  hasFiltersActive: boolean;
  totalTestsInDb: number;
  expandedId: string | null;
  onToggleExpand: (testId: string) => void;
  /** Test ID to highlight with gold border (deep-link ?test=SKU). */
  highlightedId?: string | null;
}

/**
 * Expandable catalogue table. The table element and header always render so
 * the user can see the catalogue structure even when there are zero results;
 * empty / no-filter-match states are shown as a colSpan row inside the tbody.
 */
export function TestTable({
  tests,
  cart,
  onAdd,
  onClearFilters,
  hasFiltersActive,
  totalTestsInDb,
  expandedId,
  onToggleExpand,
  highlightedId = null,
}: TestTableProps) {

  const isEmpty = tests.length === 0;
  const dbIsEmpty = totalTestsInDb === 0;

  return (
    <div
      id="catalogue-list"
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#0f2614" }}>
              {(
                [
                  { label: "Test Name", mobile: true },
                  { label: "Lab", mobile: false },
                  { label: "Category", mobile: false },
                  { label: "Price", mobile: true },
                  { label: "Turnaround", mobile: false },
                ] as const
              ).map(({ label, mobile }) => (
                <th
                  key={label}
                  className={`px-5 py-3 text-left text-xs font-bold uppercase tracking-wider ${
                    mobile ? "" : "hidden sm:table-cell"
                  }`}
                  style={{
                    color: "#c4973a",
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  {label}
                </th>
              ))}
              <th
                className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider w-12"
                style={{
                  color: "#c4973a",
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                <span className="sr-only">Expand</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-16 text-center"
                  style={{ backgroundColor: "#0a1a0d" }}
                >
                  {dbIsEmpty ? (
                    <p style={{ color: "#6ab04c" }}>
                      Test catalogue coming soon
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <p style={{ color: "#6ab04c" }}>
                        No tests found matching your search
                      </p>
                      {hasFiltersActive && onClearFilters && (
                        <button
                          onClick={onClearFilters}
                          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          style={{
                            backgroundColor: "#c4973a",
                            color: "#0a1a0d",
                          }}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              tests.map((test, idx) => {
                const expanded = expandedId === test.id;
                const inCart = cart.some((c) => cartItemId(c) === `test:${test.id}`);
                const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                const highlighted = highlightedId === test.id;

                return (
                  <TestTableRow
                    key={test.id}
                    test={test}
                    expanded={expanded}
                    inCart={inCart}
                    rowBg={rowBg}
                    highlighted={highlighted}
                    onToggle={() => onToggleExpand(test.id)}
                    onAdd={onAdd}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Single row + expanded panel ──────────────────────────────────────────────

interface TestTableRowProps {
  test: CatalogueTest;
  expanded: boolean;
  inCart: boolean;
  rowBg: string;
  highlighted: boolean;
  onToggle: () => void;
  onAdd: (item: CatalogueCartItem) => void;
}

function TestTableRow({
  test,
  expanded,
  inCart,
  rowBg,
  highlighted,
  onToggle,
  onAdd,
}: TestTableRowProps) {
  const [justAdded, setJustAdded] = useState(false);
  const { trackEvent } = useAnalytics();

  const hasPrice = test.price_cad !== null;

  const handleToggle = () => {
    if (!expanded) {
      trackEvent("test_viewed", { test_id: test.id, test_name: test.name });
    }
    onToggle();
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inCart || justAdded || !hasPrice) return;
    onAdd({
      line_type: "test" as const,
      test_id: test.id,
      test_name: test.name,
      sku: test.sku,
      price_cad: test.price_cad as number,
      lab_name: test.lab.name,
      quantity: 1,
      collection_method: test.collection_method,
    });
    trackEvent("test_added_to_cart", {
      test_id: test.id,
      test_name: test.name,
      price: test.price_cad,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const showInCart = inCart || justAdded;

  return (
    <>
      {/* Highlight spacer — creates vertical breathing room above the gold frame */}
      {highlighted && (
        <tr aria-hidden="true">
          <td colSpan={6} style={{ padding: 0, height: "12px", backgroundColor: "transparent" }} />
        </tr>
      )}
      <tr
        id={highlighted ? "avovita-deeplink-header" : undefined}
        data-testid={`test-${test.id}`}
        onClick={handleToggle}
        className={`cursor-pointer transition-colors${highlighted ? " avovita-deeplink-row" : ""}`}
        style={{
          backgroundColor: highlighted ? "#24492b" : rowBg,
          borderTop: highlighted ? "3px solid #c4973a" : "1px solid #1a3d22",
          ...(highlighted && !expanded ? { borderBottom: "3px solid #c4973a" } : {}),
        }}
      >
        <td className="px-5 py-4 font-medium" style={{ color: "#ffffff" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span>{test.name}</span>
            {test.requisition_url && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                style={{
                  backgroundColor: "rgba(196,151,58,0.1)",
                  borderColor: "#c4973a",
                  color: "#c4973a",
                }}
              >
                <FileText className="w-3 h-3" />
                Req. Required
              </span>
            )}
          </div>
          {test.sku && (
            <span
              aria-label={`Test code: ${test.sku}`}
              className="block"
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                fontSize: "11px",
                color: "rgba(141, 198, 63, 0.6)",
                marginTop: "2px",
                letterSpacing: "0.5px",
              }}
            >
              SKU: {test.sku}
            </span>
          )}
        </td>
        <td
          className="hidden sm:table-cell px-5 py-4"
          style={{ color: "#e8d5a3" }}
        >
          {test.lab.name}
        </td>
        <td
          className="hidden sm:table-cell px-5 py-4"
          style={{ color: "#e8d5a3" }}
        >
          {test.category ?? "—"}
        </td>
        <td
          className="px-5 py-4 font-semibold whitespace-nowrap"
          style={{ color: "#c4973a" }}
        >
          {hasPrice ? formatCurrency(test.price_cad as number) : "Contact us"}
        </td>
        <td
          className="hidden sm:table-cell px-5 py-4"
          style={{ color: "#e8d5a3" }}
        >
          {test.turnaround_display ?? "—"}
        </td>
        <td className="px-5 py-4 text-right">
          <ChevronDown
            className="w-4 h-4 inline-block transition-transform duration-200"
            style={{
              color: "#c4973a",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </td>
      </tr>

      {/* Expanded detail panel */}
      <tr
        style={{
          backgroundColor: highlighted ? "#24492b" : rowBg,
          ...(highlighted ? { borderBottom: "3px solid #c4973a" } : {}),
        }}
        className={highlighted ? "avovita-deeplink-row" : undefined}
      >
        <td colSpan={6} className="p-0">
          <div
            className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
            style={{
              maxHeight: expanded ? "640px" : "0px",
              opacity: expanded ? 1 : 0,
            }}
          >
            <div
              className="px-6 py-5 border-t"
              style={{
                borderColor: "#2d6b35",
                backgroundColor: "#0f2614",
              }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {test.category && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                        style={{
                          backgroundColor: "#1a3d22",
                          borderColor: "#c4973a",
                          color: "#c4973a",
                        }}
                      >
                        {test.category}
                      </span>
                    </div>
                  )}
                  {test.description && (
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "#e8d5a3" }}
                    >
                      {test.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                    <DetailField
                      label="SKU"
                      value={test.sku}
                      mono
                      ariaLabel={
                        test.sku ? `Test code: ${test.sku}` : undefined
                      }
                    />
                    <DetailField
                      label="Handling"
                      value={formatShipTempLong(test.ship_temp)}
                    />
                    <DetailField
                      label="Stability"
                      value={formatStability(test)}
                    />
                  </div>

                  {test.turnaround_display && (
                    <div
                      className="flex items-center gap-2 text-sm pt-2"
                      style={{ color: "#e8d5a3" }}
                    >
                      <Clock
                        className="w-4 h-4 shrink-0"
                        style={{ color: "#8dc63f" }}
                      />
                      <span>{test.turnaround_display}</span>
                    </div>
                  )}

                  {test.requisition_url && (
                    <a
                      href={test.requisition_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors self-start"
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

                  {test.panel_tests && test.panel_tests.length > 0 && (
                    <PanelIncludes
                      panelTests={test.panel_tests}
                      variant="detail"
                    />
                  )}
                </div>

                <div className="flex flex-col items-stretch lg:items-end justify-start gap-3">
                  <div className="text-left lg:text-right">
                    <p
                      className="text-3xl font-semibold"
                      style={{ color: "#c4973a" }}
                    >
                      {hasPrice
                        ? formatCurrency(test.price_cad as number)
                        : "Contact us for pricing"}
                    </p>
                    <p className="text-xs" style={{ color: "#e8d5a3" }}>
                      {hasPrice ? "CAD · " : ""}
                      {test.lab.name}
                    </p>
                  </div>
                  {hasPrice ? (
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={showInCart}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-colors lg:min-w-[180px]"
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
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-colors lg:min-w-[180px]"
                      style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                    >
                      Contact Us to Order
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
      {/* Highlight spacer — creates vertical breathing room below the gold frame */}
      {highlighted && (
        <tr aria-hidden="true">
          <td colSpan={6} style={{ padding: 0, height: "12px", backgroundColor: "transparent" }} />
        </tr>
      )}
    </>
  );
}

function DetailField({
  label,
  value,
  mono = false,
  ariaLabel,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div>
      <p
        className="text-xs uppercase tracking-wider mb-0.5"
        style={{ color: "#6ab04c" }}
      >
        {label}
      </p>
      <p
        className="text-sm"
        style={{
          color: "#ffffff",
          ...(mono
            ? {
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                letterSpacing: "0.5px",
              }
            : {}),
        }}
      >
        {value == null ? (
          "—"
        ) : ariaLabel ? (
          <span aria-label={ariaLabel}>{value}</span>
        ) : (
          value
        )}
      </p>
    </div>
  );
}


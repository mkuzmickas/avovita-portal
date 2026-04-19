"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, ShoppingCart, Check, Sparkles, Pill } from "lucide-react";
import { OrgAwareHeader } from "@/components/org/OrgAwareHeader";
import { CartBar } from "@/components/catalogue/CartBar";
import { useCart } from "@/components/cart/CartContext";
import { formatCurrency } from "@/lib/utils";
import { isSupplementsEnabled } from "@/types/supplements";
import { resolveSupplementImageUrl } from "@/lib/storage/imageUrl";
import type { Supplement } from "@/types/supplements";

type PublicSupplement = Pick<
  Supplement,
  | "id"
  | "sku"
  | "name"
  | "brand"
  | "category"
  | "description"
  | "price_cad"
  | "image_url"
  | "featured"
  | "track_inventory"
  | "stock_qty"
>;

type SortMode = "featured" | "price_asc" | "price_desc";

interface SupplementsClientProps {
  supplements: PublicSupplement[];
  brands: string[];
  categories: string[];
}

export function SupplementsClient({
  supplements,
  brands,
  categories,
}: SupplementsClientProps) {
  const { cart, addItem } = useCart();
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("featured");

  const enabled = isSupplementsEnabled();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = supplements.filter((s) => {
      if (q) {
        const matches =
          s.name.toLowerCase().includes(q) ||
          (!!s.brand && s.brand.toLowerCase().includes(q)) ||
          (!!s.category && s.category.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (brandFilter !== "all" && s.brand !== brandFilter) return false;
      if (categoryFilter !== "all" && s.category !== categoryFilter)
        return false;
      return true;
    });

    // Sort
    if (sort === "featured") {
      result = [...result].sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return a.name.localeCompare(b.name);
      });
    } else if (sort === "price_asc") {
      result = [...result].sort((a, b) => a.price_cad - b.price_cad);
    } else {
      result = [...result].sort((a, b) => b.price_cad - a.price_cad);
    }

    return result;
  }, [supplements, searchQuery, brandFilter, categoryFilter, sort]);

  const handleAdd = (supp: PublicSupplement) => {
    if (!enabled) return;
    const outOfStock = supp.track_inventory && supp.stock_qty === 0;
    if (outOfStock) return;
    if (cart.some((c) => c.line_type === "supplement" && c.supplement_id === supp.id)) return;
    addItem({
      line_type: "supplement",
      supplement_id: supp.id,
      sku: supp.sku,
      name: supp.name,
      price_cad: supp.price_cad,
      quantity: 1,
      image_url: supp.image_url,
    });
  };

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: "#0a1a0d" }}>
      <OrgAwareHeader />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-6">
        <h1
          className="font-heading text-4xl md:text-5xl font-semibold mb-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>Supplements</span>
        </h1>
        <p style={{ color: "#e8d5a3" }}>
          Practitioner-grade vitamins, minerals, and targeted formulas — shipped
          Canada-wide or available for pickup.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "#6ab04c" }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, brand, or category…"
              className="mf-input pl-10"
            />
          </div>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="mf-input sm:max-w-[200px] cursor-pointer"
          >
            <option value="all">All Brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="mf-input sm:max-w-[200px] cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="mf-input sm:max-w-[180px] cursor-pointer"
          >
            <option value="featured">Featured first</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div
            className="rounded-xl border px-6 py-16 text-center"
            style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
          >
            {supplements.length === 0 ? (
              <div>
                <Sparkles
                  className="w-8 h-8 mx-auto mb-3"
                  style={{ color: "#c4973a" }}
                />
                <p
                  className="font-heading text-xl font-semibold mb-2"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  Our supplement line is being{" "}
                  <span style={{ color: "#c4973a" }}>curated</span>
                </p>
                <p className="text-sm" style={{ color: "#e8d5a3" }}>
                  Check back soon — we&apos;re adding practitioner-grade
                  supplements to the AvoVita catalogue.
                </p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "#6ab04c" }}>
                No supplements match your search.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {filtered.map((supp) => (
              <SupplementCard
                key={supp.id}
                supp={supp}
                inCart={cart.some((c) => c.line_type === "supplement" && c.supplement_id === supp.id)}
                enabled={enabled}
                onAdd={() => handleAdd(supp)}
              />
            ))}
          </div>
        )}

        <p
          className="text-xs text-right"
          style={{ color: "#6ab04c" }}
        >
          Showing {filtered.length} of {supplements.length} supplements
        </p>
      </div>

      {/* Sticky cart bar — appears when cart has items */}
      <CartBar />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function SupplementCard({
  supp,
  inCart,
  enabled,
  onAdd,
}: {
  supp: PublicSupplement;
  inCart: boolean;
  enabled: boolean;
  onAdd: () => void;
}) {
  const outOfStock = supp.track_inventory && supp.stock_qty === 0;
  const buttonDisabled = !enabled || outOfStock || inCart;
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  const checkTruncation = useCallback(() => {
    const el = descRef.current;
    if (el) setIsTruncated(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [checkTruncation]);

  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      {/* Image — contain with max-height so product images aren't cropped */}
      <div
        className="relative w-full flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: "#0f2614", minHeight: "180px", maxHeight: "320px" }}
      >
        {supp.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveSupplementImageUrl(supp.image_url) ?? ""}
            alt={supp.name}
            className="w-full h-full object-contain"
            style={{ maxHeight: "320px" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Pill
              className="w-12 h-12"
              style={{ color: "rgba(196,151,58,0.25)" }}
            />
          </div>
        )}
        {/* Featured badge */}
        {supp.featured && (
          <span
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            Featured
          </span>
        )}
        {/* Out of stock badge */}
        {outOfStock && (
          <span
            className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: "#e05252", color: "#fff" }}
          >
            Out of Stock
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 py-4">
        {supp.brand && (
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "#8dc63f" }}
          >
            {supp.brand}
          </p>
        )}
        <h3
          className="font-heading text-lg font-semibold mb-2 leading-tight"
          style={{
            color: "#c4973a",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          {supp.name}
        </h3>
        {supp.description && (
          <div className="mb-3 flex-1">
            <p
              ref={descRef}
              className="text-sm"
              style={{
                color: "#e8d5a3",
                ...(expanded
                  ? {}
                  : {
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }),
              }}
            >
              {supp.description}
            </p>
            {(isTruncated || expanded) && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="mt-1 text-xs font-medium"
                style={{ color: "#8dc63f" }}
              >
                {expanded ? "Read less" : "Read more"}
              </button>
            )}
          </div>
        )}
        {!supp.description && <div className="flex-1" />}

        <div className="flex items-center justify-between gap-3 mt-auto pt-2">
          <p
            className="text-xl font-semibold"
            style={{ color: "#c4973a" }}
          >
            {formatCurrency(supp.price_cad)}
          </p>
          <button
            type="button"
            onClick={onAdd}
            disabled={buttonDisabled}
            title={
              !enabled
                ? "Coming soon"
                : outOfStock
                  ? "Out of stock"
                  : inCart
                    ? "In cart"
                    : "Add to cart"
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
            style={
              inCart
                ? {
                    backgroundColor: "rgba(141, 198, 63, 0.15)",
                    color: "#8dc63f",
                    border: "1px solid #8dc63f",
                    cursor: "default",
                  }
                : buttonDisabled
                  ? {
                      backgroundColor: "#c4973a",
                      color: "#0a1a0d",
                      opacity: 0.4,
                      cursor: "not-allowed",
                    }
                  : {
                      backgroundColor: "#c4973a",
                      color: "#0a1a0d",
                    }
            }
          >
            {inCart ? (
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
        </div>
      </div>
    </div>
  );
}

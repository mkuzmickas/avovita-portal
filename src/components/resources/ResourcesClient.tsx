"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ShoppingCart,
  Check,
  Download,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react";
import { OrgAwareHeader } from "@/components/org/OrgAwareHeader";
import { useCart } from "@/components/cart/CartContext";
import { formatCurrency } from "@/lib/utils";
import { isResourcesEnabled } from "@/types/resources";
import { resolveResourceCoverUrl } from "@/lib/storage/imageUrl";
import type { PublicResource } from "@/app/(public)/resources/page";

type PriceFilter = "all" | "free" | "paid";
type SortMode = "featured" | "price_asc" | "price_desc";

interface ResourcesClientProps {
  resources: PublicResource[];
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResourcesClient({ resources }: ResourcesClientProps) {
  const { cart, addItem } = useCart();
  const [searchQuery, setSearchQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sort, setSort] = useState<SortMode>("featured");

  const enabled = isResourcesEnabled();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = resources.filter((r) => {
      if (q) {
        const matches =
          r.title.toLowerCase().includes(q) ||
          (!!r.description && r.description.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (priceFilter === "free" && r.price_cad > 0) return false;
      if (priceFilter === "paid" && r.price_cad === 0) return false;
      return true;
    });

    if (sort === "featured") {
      result = [...result].sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return a.title.localeCompare(b.title);
      });
    } else if (sort === "price_asc") {
      result = [...result].sort((a, b) => a.price_cad - b.price_cad);
    } else {
      result = [...result].sort((a, b) => b.price_cad - a.price_cad);
    }

    return result;
  }, [resources, searchQuery, priceFilter, sort]);

  const handleAddToCart = (res: PublicResource) => {
    if (!enabled) return;
    if (cart.some((c) => c.line_type === "resource" && c.resource_id === res.id)) return;
    addItem({
      line_type: "resource",
      resource_id: res.id,
      name: res.title,
      price_cad: res.price_cad,
      quantity: 1,
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
          <span style={{ color: "#c4973a" }}>Resources</span>
        </h1>
        <p style={{ color: "#e8d5a3" }}>
          Free and premium health guides, protocols, and educational materials
          from AvoVita Wellness.
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
              placeholder="Search resources…"
              className="mf-input pl-10"
            />
          </div>
          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
            className="mf-input sm:max-w-[160px] cursor-pointer"
          >
            <option value="all">All Resources</option>
            <option value="free">Free Only</option>
            <option value="paid">Paid Only</option>
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
            {resources.length === 0 ? (
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
                  Resources{" "}
                  <span style={{ color: "#c4973a" }}>coming soon</span>
                </p>
                <p className="text-sm" style={{ color: "#e8d5a3" }}>
                  Check back shortly — we&apos;re adding health guides and
                  educational materials.
                </p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "#6ab04c" }}>
                No resources match your search.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((res) => (
              <ResourceCard
                key={res.id}
                res={res}
                inCart={cart.some((c) => c.line_type === "resource" && c.resource_id === res.id)}
                enabled={enabled}
                onAddToCart={() => handleAddToCart(res)}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-right" style={{ color: "#6ab04c" }}>
          Showing {filtered.length} of {resources.length} resources
        </p>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ResourceCard({
  res,
  inCart,
  enabled,
  onAddToCart,
}: {
  res: PublicResource;
  inCart: boolean;
  enabled: boolean;
  onAddToCart: () => void;
}) {
  const isFree = res.price_cad === 0;
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // The download endpoint returns a 302 redirect to a signed URL.
      // Using window.open lets the browser follow the redirect and
      // start the PDF download.
      window.open(`/api/resources/download/${res.id}`, "_blank");
    } finally {
      setTimeout(() => setDownloading(false), 1500);
    }
  };

  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      {/* Cover image */}
      <div
        className="relative w-full aspect-[4/3] overflow-hidden"
        style={{ backgroundColor: "#0f2614" }}
      >
        {res.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveResourceCoverUrl(res.cover_image_url) ?? ""}
            alt={res.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText
              className="w-12 h-12"
              style={{ color: "rgba(196,151,58,0.25)" }}
            />
          </div>
        )}
        {res.featured && (
          <span
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            Featured
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 py-4">
        <h3
          className="font-heading text-lg font-semibold mb-2 leading-tight"
          style={{
            color: "#c4973a",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          {res.title}
        </h3>
        {res.description && (
          <p
            className="text-sm mb-3 flex-1"
            style={{
              color: "#e8d5a3",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {res.description}
          </p>
        )}
        {!res.description && <div className="flex-1" />}

        {/* Meta */}
        <div className="flex items-center gap-3 mb-3 text-xs">
          {res.page_count != null && (
            <span style={{ color: "#8dc63f" }}>{res.page_count} pages</span>
          )}
          {res.file_size_bytes != null && (
            <span style={{ color: "#6ab04c" }}>
              {formatBytes(res.file_size_bytes)}
            </span>
          )}
        </div>

        {/* Price + action */}
        <div className="flex items-center justify-between gap-3 mt-auto">
          {isFree ? (
            <span
              className="px-2.5 py-1 rounded text-xs font-bold uppercase"
              style={{ backgroundColor: "#8dc63f", color: "#0a1a0d" }}
            >
              Free
            </span>
          ) : (
            <p
              className="text-xl font-semibold"
              style={{ color: "#c4973a" }}
            >
              {formatCurrency(res.price_cad)}
            </p>
          )}

          {isFree ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
              style={{
                backgroundColor: "#c4973a",
                color: "#0a1a0d",
                opacity: downloading ? 0.6 : 1,
              }}
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download PDF
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddToCart}
              disabled={!enabled || inCart}
              title={!enabled ? "Coming soon" : inCart ? "In cart" : "Add to cart"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
              style={
                inCart
                  ? {
                      backgroundColor: "rgba(141, 198, 63, 0.15)",
                      color: "#8dc63f",
                      border: "1px solid #8dc63f",
                      cursor: "default",
                    }
                  : !enabled
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
                  Add to Cart — {formatCurrency(res.price_cad)}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

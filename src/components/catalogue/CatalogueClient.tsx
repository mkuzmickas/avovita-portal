"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Leaf, ChevronLeft, ChevronRight } from "lucide-react";
import { TestCard } from "./TestCard";
import { TestTable } from "./TestTable";
import { SearchBar } from "./SearchBar";
import { CategoryFilter } from "./CategoryFilter";
import { CartBar } from "./CartBar";
import { InsightsChatModal } from "./InsightsChatModal";
import { useCart } from "@/components/cart/CartContext";
import type { CatalogueTest, CatalogueCartItem } from "./types";

interface CatalogueClientProps {
  featuredTests: CatalogueTest[];
  allTests: CatalogueTest[];
  categories: string[];
  labs: string[];
  isLoggedIn: boolean;
}

export function CatalogueClient({
  featuredTests,
  allTests,
  categories,
  labs,
  isLoggedIn,
}: CatalogueClientProps) {
  const { cart, addItem } = useCart();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedLab, setSelectedLab] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const handleAdd = (item: CatalogueCartItem) => {
    addItem(item);
  };

  const toggleExpanded = useCallback((testId: string) => {
    setExpandedCardId((prev) => (prev === testId ? null : testId));
  }, []);

  const scrollToTest = useCallback((testId: string) => {
    setExpandedCardId(testId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`test-${testId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, []);

  // Dev-only sanity log so we can verify in browser devtools that data is
  // actually flowing through to TestTable. Stripped from production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[catalogue] data on mount", {
        featuredTests: featuredTests.length,
        allTests: allTests.length,
        categories: categories.length,
        labs: labs.length,
      });
    }
  }, [featuredTests.length, allTests.length, categories.length, labs.length]);

  const filteredTests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allTests.filter((test) => {
      const matchesSearch =
        query === "" ||
        test.name.toLowerCase().includes(query) ||
        (test.sku !== null && test.sku.toLowerCase().includes(query));
      const matchesCategory =
        selectedCategory === null || test.category === selectedCategory;
      const matchesLab = selectedLab === null || test.lab.name === selectedLab;
      return matchesSearch && matchesCategory && matchesLab;
    });
  }, [allTests, searchQuery, selectedCategory, selectedLab]);

  const hasFiltersActive =
    searchQuery.trim() !== "" || selectedCategory !== null || selectedLab !== null;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedLab(null);
  };

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: "#0a1a0d" }}>
      {/* Top nav */}
      <header
        className="border-b"
        style={{ backgroundColor: "#0f2614", borderColor: "#1a3d22" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            >
              <Leaf className="w-4 h-4" style={{ color: "#8dc63f" }} />
            </div>
            <span
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              AvoVita
            </span>
          </Link>
          {!isLoggedIn && (
            <Link
              href="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg border transition-colors"
              style={{
                color: "#e8d5a3",
                borderColor: "#2d6b35",
                backgroundColor: "transparent",
              }}
            >
              Existing Client Login
            </Link>
          )}
        </div>
      </header>

      {/* Page title */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-6">
        <h1
          className="font-heading text-4xl md:text-5xl font-semibold mb-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Lab Test <span style={{ color: "#c4973a" }}>Catalogue</span>
        </h1>
        <p style={{ color: "#e8d5a3" }}>
          Private blood testing in Calgary — in-home collection by FloLabs phlebotomists.
        </p>

        {/* Discount promo banner */}
        <div
          className="mt-4 inline-flex items-start gap-2 rounded-lg border px-4 py-2 max-w-full"
          style={{
            backgroundColor: "#1a3d22",
            borderColor: "#c4973a",
          }}
        >
          <span style={{ color: "#c4973a", fontSize: "16px" }}>✦</span>
          <p
            className="text-sm font-medium"
            style={{ color: "#c4973a" }}
          >
            Order 2 or more tests and save $20 per test at checkout.
          </p>
        </div>

        {/* AI Test Finder card */}
        <div
          className="mt-5 rounded-xl border px-4 sm:px-6 py-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-6"
          style={{
            backgroundColor: "rgba(196,151,58,0.08)",
            borderColor: "#c4973a",
          }}
        >
          <div className="flex-1 min-w-0">
            <p
              className="font-semibold uppercase mb-1.5"
              style={{
                color: "#c4973a",
                fontSize: "11px",
                letterSpacing: "0.15em",
              }}
            >
              AI-POWERED TEST RECOMMENDATIONS
            </p>
            <h3
              className="font-heading mb-1.5"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: "22px",
              }}
            >
              Not sure where to start?
            </h3>
            <p style={{ color: "#e8d5a3", fontSize: "14px" }}>
              Describe your symptoms to our AI assistant and get personalised test recommendations from our catalogue.
            </p>
            <p className="mt-1.5" style={{ color: "#6ab04c", fontSize: "12px" }}>
              Requires a free AvoVita account
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-base font-semibold transition-colors shrink-0 w-full md:w-auto"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            <span aria-hidden>🔍</span>
            Try AI Test Finder
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
        {/* ─── SECTION 1: Featured ────────────────────────────────────── */}
        <section>
          <SectionHeading title="Featured Tests" hint="(scroll down for full catalogue)" />
          {featuredTests.length === 0 ? (
            <div
              className="rounded-xl border px-6 py-12 text-center"
              style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            >
              <p className="text-sm" style={{ color: "#6ab04c" }}>
                Featured tests coming soon
              </p>
            </div>
          ) : (
            <FeaturedCarousel
              tests={featuredTests}
              cart={cart}
              onAdd={handleAdd}
              expandedId={expandedCardId}
              onToggleExpand={toggleExpanded}
            />
          )}
        </section>

        {/* ─── SECTION 2: Full catalogue ──────────────────────────────── */}
        <section>
          <SectionHeading title="Full Test Catalogue" />

          <p style={{ color: "#e8d5a3", fontSize: "13px" }}>
            Choose from our {allTests.length} test catalogue.
          </p>
          <p style={{ color: "#e8d5a3", fontSize: "13px" }}>
            Tests without pricing —{" "}
            <a
              href="mailto:support@avovita.ca"
              className="no-underline hover:underline"
              style={{ color: "#c4973a" }}
            >
              contact us
            </a>{" "}
            to request a quote.
          </p>
          <p
            className="mb-5"
            style={{ color: "#e8d5a3", fontSize: "13px" }}
          >
            Don&apos;t see the test you&apos;re looking for? We have access to thousands of Mayo Clinic tests not listed here —{" "}
            <a
              href="mailto:support@avovita.ca"
              className="no-underline hover:underline"
              style={{ color: "#c4973a" }}
            >
              contact us
            </a>{" "}
            and we&apos;ll get it added.
          </p>

          {/* Filter row */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by test name or SKU..."
            />
            <CategoryFilter
              label="Categories"
              options={categories}
              value={selectedCategory}
              onChange={setSelectedCategory}
              allLabel="All Categories"
            />
            <CategoryFilter
              label="Labs"
              options={labs}
              value={selectedLab}
              onChange={setSelectedLab}
              allLabel="All Labs"
            />
          </div>

          <TestTable
            tests={filteredTests}
            cart={cart}
            onAdd={handleAdd}
            onClearFilters={clearFilters}
            hasFiltersActive={hasFiltersActive}
            totalTestsInDb={allTests.length}
            expandedId={expandedCardId}
            onToggleExpand={toggleExpanded}
          />
        </section>
      </div>

      {/* Sticky cart bar */}
      <CartBar cart={cart} />

      {/* AI Test Finder modal */}
      <InsightsChatModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onScrollToTest={scrollToTest}
      />
    </div>
  );
}

function FeaturedCarousel({
  tests,
  cart,
  onAdd,
  expandedId,
  onToggleExpand,
}: {
  tests: CatalogueTest[];
  cart: CatalogueCartItem[];
  onAdd: (item: CatalogueCartItem) => void;
  expandedId: string | null;
  onToggleExpand: (testId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(3);
  const [index, setIndex] = useState(0);

  // Responsive: 1 on mobile, 2 on tablet, 3 on desktop
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w >= 1024) setVisibleCount(3);
      else if (w >= 768) setVisibleCount(2);
      else setVisibleCount(1);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const maxIndex = Math.max(0, tests.length - visibleCount);

  // Clamp index when visibleCount changes
  useEffect(() => {
    setIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  const slotWidthPct = 100 / visibleCount;
  const translatePct = -index * slotWidthPct;

  const canPrev = index > 0;
  const canNext = index < maxIndex;

  return (
    <div className="relative">
      <div className="overflow-hidden">
        <div
          className="flex"
          style={{
            transform: `translateX(${translatePct}%)`,
            transition: "transform 300ms ease",
          }}
        >
          {tests.map((test) => {
            const isExpanded = expandedId === test.id;
            const inCart = cart.some((c) => c.test_id === test.id);
            return (
              <div
                key={test.id}
                className="px-2.5 shrink-0"
                style={{ width: `${slotWidthPct}%` }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => onToggleExpand(test.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleExpand(test.id);
                    }
                  }}
                  className="cursor-pointer focus:outline-none h-full"
                >
                  <TestCard
                    test={test}
                    inCart={inCart}
                    onAdd={onAdd}
                    expanded={isExpanded}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tests.length > visibleCount && (
        <>
          <CarouselArrow
            direction="left"
            disabled={!canPrev}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          />
          <CarouselArrow
            direction="right"
            disabled={!canNext}
            onClick={() => setIndex((i) => Math.min(maxIndex, i + 1))}
          />

          {/* Dot indicators */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className="rounded-full transition-colors"
                style={{
                  width: i === index ? "20px" : "8px",
                  height: "8px",
                  backgroundColor: i === index ? "#c4973a" : "#2d6b35",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous" : "Next"}
      className="absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center border z-10 transition-opacity"
      style={{
        backgroundColor: "rgba(196,151,58,0.15)",
        borderColor: "#c4973a",
        color: "#c4973a",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "default" : "pointer",
        [direction === "left" ? "left" : "right"]: "4px",
      }}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3 flex-wrap mb-2">
        <h2
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          {title}
        </h2>
        {hint && (
          <span
            className="text-sm"
            style={{
              color: "#e8d5a3",
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: "14px",
            }}
          >
            {hint}
          </span>
        )}
      </div>
      <div
        className="h-[3px] w-16 rounded-full"
        style={{ backgroundColor: "#c4973a" }}
      />
    </div>
  );
}


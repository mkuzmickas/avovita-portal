"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Leaf } from "lucide-react";
import { TestCard } from "./TestCard";
import { TestTable } from "./TestTable";
import { SearchBar } from "./SearchBar";
import { CategoryFilter } from "./CategoryFilter";
import { CartBar } from "./CartBar";
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

  const handleAdd = (item: CatalogueCartItem) => {
    addItem(item);
  };

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
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
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
      <div className="max-w-7xl mx-auto px-6 pt-10 pb-6">
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
          className="mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2"
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
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-12">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
              {featuredTests.map((test) => {
                const isExpanded = expandedCardId === test.id;
                const inCart = cart.some((c) => c.test_id === test.id);
                return (
                  <div
                    key={test.id}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedCardId((prev) =>
                        prev === test.id ? null : test.id
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedCardId((prev) =>
                          prev === test.id ? null : test.id
                        );
                      }
                    }}
                    className="cursor-pointer focus:outline-none"
                  >
                    <TestCard
                      test={test}
                      inCart={inCart}
                      onAdd={handleAdd}
                      expanded={isExpanded}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── SECTION 2: Full catalogue ──────────────────────────────── */}
        <section>
          <SectionHeading title="Full Test Catalogue" />

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
          />
        </section>
      </div>

      {/* Sticky cart bar */}
      <CartBar cart={cart} />
    </div>
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


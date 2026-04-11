"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ShoppingBag, Leaf } from "lucide-react";
import { TestCard } from "@/components/TestCard";
import { CartDrawer } from "@/components/CartDrawer";
import { ConsentModal } from "@/components/ConsentModal";
import { cn } from "@/lib/utils";
import type { TestWithLab, PatientProfile, CartItem } from "@/types/database";

interface TestCatalogueProps {
  tests: TestWithLab[];
  profiles: PatientProfile[];
  categories: string[];
  isLoggedIn: boolean;
}

export function TestCatalogue({
  tests,
  profiles,
  categories,
  isLoggedIn,
}: TestCatalogueProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    profiles[0]?.id ?? null
  );
  const [consentPending, setConsentPending] = useState<{
    test: TestWithLab;
    consentTypes: import("@/types/database").ConsentType[];
  } | null>(null);

  const filteredTests = useMemo(() => {
    return tests.filter((test) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        test.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        test.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        test.lab.name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        activeCategory === null || test.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [tests, searchQuery, activeCategory]);

  const handleAddToCart = (test: TestWithLab) => {
    if (!isLoggedIn) {
      window.location.href = "/login?redirectTo=/tests";
      return;
    }

    if (!selectedProfileId) {
      alert("Please select a patient profile before adding tests to your cart.");
      return;
    }

    const requiredConsents: import("@/types/database").ConsentType[] = [];
    if (test.lab.cross_border_country === "US") {
      requiredConsents.push("cross_border_us");
    }
    if (test.lab.cross_border_country === "DE") {
      requiredConsents.push("cross_border_de");
    }
    if (test.lab.cross_border_country === "CA" && test.lab.country !== "Canada") {
      requiredConsents.push("cross_border_ca");
    }

    if (requiredConsents.length > 0) {
      setConsentPending({ test, consentTypes: requiredConsents });
      return;
    }

    addToCartConfirmed(test);
  };

  const addToCartConfirmed = (test: TestWithLab) => {
    setCartItems((prev) => {
      const existing = prev.find(
        (i) => i.test.id === test.id && i.profile_id === selectedProfileId
      );
      if (existing) return prev;
      return [...prev, { test, profile_id: selectedProfileId!, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const handleRemoveFromCart = (testId: string, profileId: string) => {
    setCartItems((prev) =>
      prev.filter((i) => !(i.test.id === testId && i.profile_id === profileId))
    );
  };

  const cartCount = cartItems.length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0a1a0d" }}>
      {consentPending && (
        <ConsentModal
          consentTypes={consentPending.consentTypes}
          labName={consentPending.test.lab.name}
          onConsented={() => {
            const test = consentPending.test;
            setConsentPending(null);
            addToCartConfirmed(test);
          }}
          onDismissed={() => setConsentPending(null)}
        />
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSelectProfile={setSelectedProfileId}
        onRemoveItem={handleRemoveFromCart}
        isLoggedIn={isLoggedIn}
      />

      {/* Header */}
      <div
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
              Patient Login
            </Link>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="max-w-7xl mx-auto px-6 py-10">
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
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12">
        {/* Search + cart button */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "#6ab04c" }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tests, labs…"
              className="mf-input pl-10"
            />
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg relative transition-colors"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            <ShoppingBag className="w-4 h-4" />
            Cart
            {cartCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border-2"
                style={{
                  backgroundColor: "#0a1a0d",
                  color: "#c4973a",
                  borderColor: "#c4973a",
                }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Category filters */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
              )}
              style={
                activeCategory === null
                  ? {
                      backgroundColor: "#c4973a",
                      color: "#0a1a0d",
                      borderColor: "#c4973a",
                    }
                  : {
                      backgroundColor: "transparent",
                      color: "#e8d5a3",
                      borderColor: "#2d6b35",
                    }
              }
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? null : cat)
                }
                className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                style={
                  activeCategory === cat
                    ? {
                        backgroundColor: "#c4973a",
                        color: "#0a1a0d",
                        borderColor: "#c4973a",
                      }
                    : {
                        backgroundColor: "transparent",
                        color: "#e8d5a3",
                        borderColor: "#2d6b35",
                      }
                }
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Profile selector */}
        {isLoggedIn && profiles.length > 1 && (
          <div
            className="mb-6 flex items-center gap-3 p-4 rounded-xl border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <span
              className="text-sm font-medium shrink-0"
              style={{ color: "#e8d5a3" }}
            >
              Adding tests for:
            </span>
            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProfileId(p.id)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                  style={
                    selectedProfileId === p.id
                      ? {
                          backgroundColor: "#c4973a",
                          color: "#0a1a0d",
                          borderColor: "#c4973a",
                        }
                      : {
                          backgroundColor: "transparent",
                          color: "#e8d5a3",
                          borderColor: "#2d6b35",
                        }
                  }
                >
                  {p.first_name} {p.last_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Test grid */}
        {filteredTests.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#6ab04c" }}>
            <p className="text-lg">No tests found matching your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTests.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                cartItems={cartItems}
                selectedProfileId={selectedProfileId}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

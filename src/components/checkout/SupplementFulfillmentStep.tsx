"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Truck, Handshake } from "lucide-react";
import { SUPPLEMENT_SHIPPING_FEE_CAD } from "@/types/supplements";
import type { SupplementFulfillment, SupplementShippingAddress } from "@/types/supplements";
import type { CollectionAddress } from "@/lib/checkout/types";
import { formatCurrency } from "@/lib/utils";

interface SupplementFulfillmentStepProps {
  /** Main collection address from the tests address step. */
  collectionAddress?: CollectionAddress | null;
  fulfillment: SupplementFulfillment | null;
  shippingAddress: SupplementShippingAddress | null;
  onFulfillmentChange: (f: SupplementFulfillment) => void;
  onShippingAddressChange: (a: SupplementShippingAddress | null) => void;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Supplement fulfillment step — shown only when the cart contains
 * supplements. Two radio options: flat-rate shipping ($40) or
 * pre-coordinated delivery/pickup ($0).
 */
export function SupplementFulfillmentStep({
  collectionAddress,
  fulfillment,
  shippingAddress,
  onFulfillmentChange,
  onShippingAddressChange,
  onBack,
  onContinue,
}: SupplementFulfillmentStepProps) {
  const [sameAsMain, setSameAsMain] = useState(true);

  const hasMainAddress =
    collectionAddress &&
    collectionAddress.address_line1.trim().length > 0;

  const handleSelectShipping = () => {
    onFulfillmentChange("shipping");
    if (hasMainAddress && sameAsMain) {
      onShippingAddressChange({
        name: "",
        street: collectionAddress.address_line1 +
          (collectionAddress.address_line2
            ? `, ${collectionAddress.address_line2}`
            : ""),
        city: collectionAddress.city,
        province: collectionAddress.province,
        postal: collectionAddress.postal_code,
        country: "Canada",
      });
    }
  };

  const handleSelectCoordinated = () => {
    onFulfillmentChange("coordinated");
    onShippingAddressChange(null);
  };

  const isShipping = fulfillment === "shipping";
  const isCoordinated = fulfillment === "coordinated";

  const canContinue =
    fulfillment === "coordinated" ||
    (fulfillment === "shipping" && shippingAddress !== null);

  return (
    <div>
      <h2
        className="font-heading text-2xl font-semibold mb-2"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Supplement <span style={{ color: "#c4973a" }}>Delivery</span>
      </h2>
      <p className="text-sm mb-6" style={{ color: "#e8d5a3" }}>
        Choose how you&apos;d like to receive your supplements.
      </p>

      <div className="space-y-3">
        {/* Option 1: Shipping */}
        <label
          className="flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors"
          style={{
            backgroundColor: isShipping ? "#1a3d22" : "#0a1a0d",
            borderColor: isShipping ? "#c4973a" : "#2d6b35",
          }}
        >
          <input
            type="radio"
            name="fulfillment"
            checked={isShipping}
            onChange={handleSelectShipping}
            className="mt-1 shrink-0"
            style={{ accentColor: "#c4973a" }}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-4 h-4" style={{ color: "#c4973a" }} />
              <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>
                Flat-rate shipping anywhere in Canada —{" "}
                <span style={{ color: "#c4973a" }}>
                  {formatCurrency(SUPPLEMENT_SHIPPING_FEE_CAD)}
                </span>
              </span>
            </div>
            <p className="text-xs" style={{ color: "#6ab04c" }}>
              Shipped directly to your door.
            </p>
          </div>
        </label>

        {/* Shipping address — shown when shipping is selected */}
        {isShipping && (
          <div
            className="ml-8 p-4 rounded-lg border space-y-3"
            style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
          >
            {hasMainAddress && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameAsMain}
                  onChange={(e) => {
                    setSameAsMain(e.target.checked);
                    if (e.target.checked) {
                      onShippingAddressChange({
                        name: "",
                        street:
                          collectionAddress.address_line1 +
                          (collectionAddress.address_line2
                            ? `, ${collectionAddress.address_line2}`
                            : ""),
                        city: collectionAddress.city,
                        province: collectionAddress.province,
                        postal: collectionAddress.postal_code,
                        country: "Canada",
                      });
                    } else {
                      onShippingAddressChange({
                        name: "",
                        street: "",
                        city: "",
                        province: "",
                        postal: "",
                        country: "Canada",
                      });
                    }
                  }}
                  style={{ accentColor: "#c4973a" }}
                />
                <span className="text-sm" style={{ color: "#e8d5a3" }}>
                  Same as my collection address
                </span>
              </label>
            )}

            {(!hasMainAddress || !sameAsMain) && (
              <div className="space-y-3">
                <div>
                  <label
                    className="block text-xs font-medium mb-1"
                    style={{ color: "#e8d5a3" }}
                  >
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    value={shippingAddress?.name ?? ""}
                    onChange={(e) =>
                      onShippingAddressChange({
                        ...(shippingAddress ?? {
                          name: "",
                          street: "",
                          city: "",
                          province: "",
                          postal: "",
                          country: "Canada",
                        }),
                        name: e.target.value,
                      })
                    }
                    className="mf-input"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-medium mb-1"
                    style={{ color: "#e8d5a3" }}
                  >
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={shippingAddress?.street ?? ""}
                    onChange={(e) =>
                      onShippingAddressChange({
                        ...(shippingAddress ?? {
                          name: "",
                          street: "",
                          city: "",
                          province: "",
                          postal: "",
                          country: "Canada",
                        }),
                        street: e.target.value,
                      })
                    }
                    className="mf-input"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label
                      className="block text-xs font-medium mb-1"
                      style={{ color: "#e8d5a3" }}
                    >
                      City
                    </label>
                    <input
                      type="text"
                      value={shippingAddress?.city ?? ""}
                      onChange={(e) =>
                        onShippingAddressChange({
                          ...(shippingAddress ?? {
                            name: "",
                            street: "",
                            city: "",
                            province: "",
                            postal: "",
                            country: "Canada",
                          }),
                          city: e.target.value,
                        })
                      }
                      className="mf-input"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-xs font-medium mb-1"
                      style={{ color: "#e8d5a3" }}
                    >
                      Province
                    </label>
                    <input
                      type="text"
                      value={shippingAddress?.province ?? ""}
                      onChange={(e) =>
                        onShippingAddressChange({
                          ...(shippingAddress ?? {
                            name: "",
                            street: "",
                            city: "",
                            province: "",
                            postal: "",
                            country: "Canada",
                          }),
                          province: e.target.value,
                        })
                      }
                      className="mf-input"
                      placeholder="AB"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-xs font-medium mb-1"
                      style={{ color: "#e8d5a3" }}
                    >
                      Postal Code
                    </label>
                    <input
                      type="text"
                      value={shippingAddress?.postal ?? ""}
                      onChange={(e) =>
                        onShippingAddressChange({
                          ...(shippingAddress ?? {
                            name: "",
                            street: "",
                            city: "",
                            province: "",
                            postal: "",
                            country: "Canada",
                          }),
                          postal: e.target.value,
                        })
                      }
                      className="mf-input"
                      placeholder="T2P 1J9"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Option 2: Coordinated */}
        <label
          className="flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors"
          style={{
            backgroundColor: isCoordinated ? "#1a3d22" : "#0a1a0d",
            borderColor: isCoordinated ? "#c4973a" : "#2d6b35",
          }}
        >
          <input
            type="radio"
            name="fulfillment"
            checked={isCoordinated}
            onChange={handleSelectCoordinated}
            className="mt-1 shrink-0"
            style={{ accentColor: "#c4973a" }}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Handshake className="w-4 h-4" style={{ color: "#c4973a" }} />
              <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>
                I have already coordinated delivery or pickup with AvoVita —{" "}
                <span style={{ color: "#8dc63f" }}>$0</span>
              </span>
            </div>
            <p className="text-xs italic" style={{ color: "#6ab04c" }}>
              Select this only if you&apos;ve already arranged directly with us.
            </p>
          </div>
        </label>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border transition-colors"
          style={{
            color: "#e8d5a3",
            borderColor: "#2d6b35",
            backgroundColor: "transparent",
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            backgroundColor: canContinue ? "#c4973a" : "#2d6b35",
            color: canContinue ? "#0a1a0d" : "#6ab04c",
            cursor: canContinue ? "pointer" : "not-allowed",
          }}
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { loadGooglePlaces } from "@/lib/google-places";

export interface ParsedAddress {
  address_line1: string;
  city: string;
  province: string;
  postal_code: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Called when the user selects an autocomplete suggestion. */
  onPlaceSelected: (parsed: ParsedAddress) => void;
  className?: string;
  placeholder?: string;
}

// Minimal structural types for the google.maps.places API. Avoids pulling
// @types/google.maps as a dep just for two call sites.
interface PlaceComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface PlaceResult {
  address_components?: PlaceComponent[];
}
interface AutocompleteInstance {
  addListener(event: string, handler: () => void): void;
  getPlace(): PlaceResult;
}
interface PlacesNamespace {
  Autocomplete: new (
    input: HTMLInputElement,
    opts: {
      types?: string[];
      componentRestrictions?: { country: string | string[] };
      fields?: string[];
    }
  ) => AutocompleteInstance;
}

function readPlacesNamespace(): PlacesNamespace | null {
  const w = window as unknown as {
    google?: { maps?: { places?: PlacesNamespace } };
  };
  return w.google?.maps?.places ?? null;
}

function parsePlace(place: PlaceResult): ParsedAddress {
  const byType = (type: string, field: "long_name" | "short_name" = "long_name") => {
    const c = place.address_components?.find((c) => c.types.includes(type));
    return c ? c[field] : "";
  };
  const streetNumber = byType("street_number");
  const route = byType("route");
  const subpremise = byType("subpremise");
  const address_line1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    byType("locality") ||
    byType("sublocality_level_1") ||
    byType("postal_town");
  const province = byType("administrative_area_level_1", "short_name");
  const postal_code = byType("postal_code").toUpperCase().replace(/\s+/g, " ");
  // Append subpremise into line1 if Places gave one (e.g. "Apt 4, 123 Main St")
  const withUnit = subpremise
    ? `${address_line1}${address_line1 ? ", " : ""}Unit ${subpremise}`.trim()
    : address_line1;
  return {
    address_line1: withUnit,
    city,
    province,
    postal_code,
  };
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onPlaceSelected,
  className,
  placeholder,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let autocomplete: AutocompleteInstance | null = null;

    loadGooglePlaces()
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const places = readPlacesNamespace();
        if (!places) {
          setLoadError("Autocomplete unavailable — you can type your address manually.");
          return;
        }
        autocomplete = new places.Autocomplete(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: "ca" },
          fields: ["address_components"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete!.getPlace();
          const parsed = parsePlace(place);
          if (parsed.address_line1) onChange(parsed.address_line1);
          onPlaceSelected(parsed);
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.warn("[AddressAutocomplete] failed to load:", err.message);
        setLoadError("Autocomplete unavailable — you can type your address manually.");
      });

    return () => {
      cancelled = true;
    };
    // intentionally empty — we only initialise once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        autoComplete="address-line1"
        placeholder={placeholder}
      />
      {loadError && (
        <p className="mt-1 text-xs" style={{ color: "#6ab04c" }}>
          {loadError}
        </p>
      )}
    </>
  );
}

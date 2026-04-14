/**
 * Lazy loader for the Google Maps JS SDK with the Places library.
 *
 * Resolves when `window.google.maps.places` is ready to use. Safe to call
 * multiple times — the script tag and the in-flight promise are cached.
 */

interface GoogleMapsGlobal {
  maps?: {
    places?: unknown;
  };
}

declare global {
  interface Window {
    google?: GoogleMapsGlobal;
  }
}

let loadPromise: Promise<void> | null = null;

export function isGooglePlacesReady(): boolean {
  return (
    typeof window !== "undefined" && !!window.google?.maps?.places
  );
}

export function loadGooglePlaces(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Places can only load in the browser"));
  }
  if (isGooglePlacesReady()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!key) {
    return Promise.reject(
      new Error("NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set")
    );
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-places="1"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google Maps script"))
      );
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.googlePlaces = "1";
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null; // allow retry
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

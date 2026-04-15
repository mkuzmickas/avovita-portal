/**
 * Lazy loader for the Google Maps JS SDK with the Places library.
 *
 * Resolves when `window.google.maps.places` is ready to use. Safe to
 * call multiple times — the script tag and the in-flight promise are
 * cached. Compatible with the `loading=async` parameter: after the
 * bootstrap script loads we await `google.maps.importLibrary("places")`,
 * which is the pattern Google now documents for async loading.
 */

interface GoogleMapsGlobal {
  maps?: {
    places?: unknown;
    importLibrary?: (name: string) => Promise<unknown>;
  };
  __avovitaAuthFailure?: boolean;
}

declare global {
  interface Window {
    google?: GoogleMapsGlobal;
    gm_authFailure?: () => void;
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
    console.error(
      "[google-places] NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set — autocomplete will fall back to manual entry"
    );
    return Promise.reject(
      new Error("NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set")
    );
  }

  // Register the auth-failure callback BEFORE the script loads. Google
  // invokes this on RefererNotAllowed / InvalidKey / BillingNotEnabled
  // errors, which otherwise only appear in the browser console.
  if (!window.gm_authFailure) {
    window.gm_authFailure = () => {
      console.error(
        "[google-places] auth failure — check the API key restrictions (HTTP referrer must allow portal.avovita.ca/*) and that Places API + billing are enabled in the Google Cloud project"
      );
      (window.google ??= {}).__avovitaAuthFailure = true;
    };
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const afterScriptLoaded = async () => {
      // With loading=async the bootstrap script defers loading the
      // Places library until we ask for it.
      const importLib = window.google?.maps?.importLibrary;
      try {
        if (typeof importLib === "function") {
          await importLib("places");
        }
      } catch (err) {
        reject(
          new Error(
            `importLibrary("places") failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        return;
      }
      // Poll briefly for the namespace in case importLibrary wasn't
      // available (older SDK caches) and places attaches on its own.
      const start = Date.now();
      const poll = () => {
        if (window.google?.__avovitaAuthFailure) {
          reject(new Error("Google Maps auth failure"));
          return;
        }
        if (isGooglePlacesReady()) {
          resolve();
          return;
        }
        if (Date.now() - start > 5000) {
          reject(
            new Error(
              "Google Maps script loaded but places namespace never appeared"
            )
          );
          return;
        }
        setTimeout(poll, 100);
      };
      poll();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-places="1"]'
    );
    if (existing) {
      if (existing.dataset.loaded === "1") {
        void afterScriptLoaded();
      } else {
        existing.addEventListener("load", () => {
          existing.dataset.loaded = "1";
          void afterScriptLoaded();
        });
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Google Maps script"))
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.googlePlaces = "1";
    script.onload = () => {
      script.dataset.loaded = "1";
      void afterScriptLoaded();
    };
    script.onerror = () => {
      loadPromise = null; // allow retry
      reject(
        new Error(
          "Failed to load https://maps.googleapis.com/maps/api/js — check network/CSP"
        )
      );
    };
    document.head.appendChild(script);
  });

  return loadPromise.catch((err) => {
    // Reset so a future attempt (e.g. user returns to Step 3) can retry.
    loadPromise = null;
    throw err;
  });
}

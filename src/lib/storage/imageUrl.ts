import { createClient } from "@/lib/supabase/client";

/**
 * Resolves an image URL for display. Handles two cases:
 *
 *   1. External URL (starts with "http://" or "https://") — returned as-is.
 *      This covers legacy images entered via the old text-input field.
 *
 *   2. Storage path (anything else) — resolved via Supabase Storage
 *      getPublicUrl for the specified bucket.
 *
 * Returns null if the value is null/empty.
 */
export function resolveImageUrl(
  value: string | null | undefined,
  bucket: string,
): string | null {
  if (!value || value.trim() === "") return null;

  // External URL — return as-is
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  // Storage path — resolve via Supabase public URL
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(value);
  return data?.publicUrl ?? null;
}

/**
 * Convenience wrappers for specific buckets.
 */
export function resolveResourceCoverUrl(
  path: string | null | undefined,
): string | null {
  return resolveImageUrl(path, "resource-covers");
}

export function resolveSupplementImageUrl(
  path: string | null | undefined,
): string | null {
  return resolveImageUrl(path, "supplement-images");
}

/**
 * Server-only utilities — must not be imported by client components.
 * These functions use next/headers or service role credentials.
 */
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Generates a 1-hour signed URL for a result PDF using the service role client.
 */
export async function generateSignedResultUrl(storagePath: string): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.storage
    .from("results-pdfs")
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${error?.message}`);
  }

  return data.signedUrl;
}

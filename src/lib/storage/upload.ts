/**
 * Shared 3-step signed upload flow for direct browser → Supabase Storage uploads.
 * Used by both PDF uploads (resources) and image uploads (resource covers, supplement images).
 *
 * Steps:
 *   1. POST to API route → get signed upload URL + storage path
 *   2. PUT file bytes directly to Supabase Storage (bypasses Vercel)
 *   3. POST confirm to API route → verify file landed
 */

export interface SignedUploadResult {
  filePath: string;
  fileSize: number;
  fileName: string;
}

/**
 * Upload a file to Supabase Storage via signed URL.
 *
 * @param file         The File object from an <input type="file">
 * @param apiBase      API route base for getting signed URL + confirming
 *                     (e.g. "/api/admin/resources/upload" or "/api/admin/images/upload")
 * @param contentType  MIME type for the PUT request
 */
export async function signedUploadToStorage(
  file: File,
  apiBase: string,
  contentType: string,
): Promise<SignedUploadResult> {
  // Step 1: Get signed upload URL
  const urlResp = await fetch(apiBase, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
    }),
  });
  const urlData = await urlResp.json();
  if (!urlResp.ok) {
    throw new Error(urlData.error ?? "Failed to prepare upload");
  }

  // Step 2: Upload directly to Supabase Storage
  const uploadResp = await fetch(urlData.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!uploadResp.ok) {
    throw new Error(`Upload to storage failed (${uploadResp.status})`);
  }

  // Step 3: Confirm upload
  const confirmResp = await fetch(`${apiBase}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: urlData.path,
      filename: file.name,
      fileSize: file.size,
    }),
  });
  const confirmData = await confirmResp.json();
  if (!confirmResp.ok) {
    throw new Error(confirmData.error ?? "Upload verification failed");
  }

  return {
    filePath: confirmData.file_path,
    fileSize: file.size,
    fileName: file.name,
  };
}

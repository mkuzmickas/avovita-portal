// =============================================================================
// AvoVita Patient Portal — Resource Types
// =============================================================================

export interface Resource {
  id: string;
  title: string;
  description: string | null;
  price_cad: number;
  file_path: string;
  file_size_bytes: number | null;
  file_type: string;
  page_count: number | null;
  cover_image_url: string | null;
  active: boolean;
  featured: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface ResourcePurchase {
  id: string;
  resource_id: string;
  order_id: string | null;
  account_id: string | null;
  email: string;
  download_token: string;
  download_count: number;
  max_downloads: number;
  expires_at: string;
  created_at: string;
}

export function isResourcesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_RESOURCES === "true";
}

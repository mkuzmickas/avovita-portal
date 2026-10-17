import { redirect } from "next/navigation";

/**
 * Resources removed from the user-driven experience Oct 2026 (Mike).
 * Admin resource management still works (uploads, purchases, fulfilment)
 * but is no longer a browse-and-buy surface for end clients. Old
 * bookmarks + search results land here and get bounced to the lab
 * catalogue.
 */
export default function ResourcesPage() {
  redirect("/tests");
}

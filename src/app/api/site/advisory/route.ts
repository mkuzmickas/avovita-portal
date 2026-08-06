import { NextResponse } from "next/server";
import { getActiveAdvisory } from "@/lib/site/getActiveAdvisory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/site/advisory
 *
 * Returns the currently-active availability advisory (or `null`).
 * Client components on catalogue / cart / etc. pages fetch this on
 * mount to render the amber notice. The underlying Supabase read is
 * cached ~60s in the getActiveAdvisory module so a page-flip storm
 * won't hammer the DB.
 *
 * Public — the advisory copy is customer-facing, no auth needed.
 */
export async function GET() {
  const advisory = await getActiveAdvisory();
  return NextResponse.json(
    { advisory },
    {
      headers: {
        // Let the browser + any intermediate CDN hold on to the
        // response for a minute. Matches the server-side memoisation
        // TTL so refreshing more often doesn't get you fresher data
        // anyway.
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}

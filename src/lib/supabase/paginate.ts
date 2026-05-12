/**
 * Page through a PostgREST list response that exceeds the server's
 * `max-rows` cap (default 1000 for Supabase projects). The client-lib's
 * `.limit(N)` does NOT override that server cap — it just sets a query
 * param that gets clamped — so a `.limit(50000)` query against a 30-day
 * window with 5k+ rows silently returns the oldest 1000 (because of the
 * `.order("created_at", { ascending: true })` clause) and the dashboard
 * then renders a stale slice. This helper fetches every row in 1000-row
 * batches via `.range()` and concatenates.
 *
 * The caller passes a `buildQuery` function that returns a PostgrestFilterBuilder
 * already configured with `.select(...)`, `.eq/.gte/.lte(...)`, and
 * `.order(...)`. The helper only applies `.range(offset, offset + pageSize - 1)`
 * per page.
 *
 * Pagination strategy:
 *   • Fires `concurrency` pages in parallel per wave (default 5).
 *   • Stops when any page in a wave comes back shorter than pageSize
 *     (the natural EOF signal from PostgREST) — discards any extra
 *     rows beyond that boundary.
 *   • Hard ceiling `maxRows` prevents runaway fetches.
 *
 * For the analytics dashboard the 90-day window holds ~16k page_view
 * rows. Sequential = 17 round-trips ≈ 1.7s; concurrency=5 cuts this to
 * 4 waves ≈ 400ms.
 */

export interface PaginateOptions {
  /** PostgREST page cap. Defaults to 1000 — Supabase's max-rows default. */
  pageSize?: number;
  /**
   * Absolute ceiling across all pages. Prevents runaway fetches if the
   * underlying table grew unexpectedly. Defaults to 100,000.
   */
  maxRows?: number;
  /** Pages to fetch in parallel per wave. Defaults to 5. */
  concurrency?: number;
}

type PaginatableQuery<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}> & {
  range(from: number, to: number): PaginatableQuery<T>;
};

export async function paginateQuery<T>(
  buildQuery: () => PaginatableQuery<T>,
  opts: PaginateOptions = {},
): Promise<{ data: T[]; error: { message: string } | null }> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 100_000;
  const concurrency = Math.max(1, opts.concurrency ?? 5);

  const all: T[] = [];
  let offset = 0;
  while (offset < maxRows) {
    // Build this wave's page requests.
    const reqs: Array<Promise<{ data: T[] | null; error: { message: string } | null }>> =
      [];
    for (let i = 0; i < concurrency && offset + i * pageSize < maxRows; i++) {
      const from = offset + i * pageSize;
      const to = Math.min(from + pageSize, maxRows) - 1;
      reqs.push(Promise.resolve(buildQuery().range(from, to)));
    }
    const results = await Promise.all(reqs);

    // Surface the first error. Return whatever we accumulated before it
    // so the caller can decide whether to show partial data.
    const errored = results.find((r) => r.error);
    if (errored) return { data: all, error: errored.error };

    // Append in page order and detect natural EOF (the FIRST short page
    // in this wave). Subsequent pages may have raced ahead but their
    // rows live past the dataset's boundary — drop them.
    let eof = false;
    for (const r of results) {
      const page = r.data ?? [];
      all.push(...page);
      if (page.length < pageSize) {
        eof = true;
        break;
      }
    }
    if (eof) break;
    offset += concurrency * pageSize;
  }
  return { data: all, error: null };
}

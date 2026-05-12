/**
 * Regression test for the "portal analytics frozen on Apr 15-19" bug.
 *
 * The dashboard's .limit(50000) was silently capped at 1000 by PostgREST's
 * max-rows server setting. Combined with .order(..., ascending: true)
 * the chart rendered only the earliest 1000 rows of the 30-day window
 * (Apr 15-19 in production) and dropped everything after.
 *
 * The helper pages through the result via .range(offset, offset+pageSize-1)
 * in waves of `concurrency` parallel requests, stopping at the first
 * short page (natural EOF). The 30-day window holds ~5,549 rows and the
 * 90-day window ~16,000 — both confirmed against production.
 */

import { describe, it, expect } from "vitest";
import { paginateQuery } from "@/lib/supabase/paginate";

interface FakeRow {
  id: number;
}

/**
 * Fake PostgREST builder that holds a known dataset and slices it by
 * .range(from, to). Caps each response at `serverPageCap` even if the
 * caller asks for more — mirroring PostgREST's max-rows server cap,
 * which is the entire reason this helper exists.
 */
function makeFakeBuilder(rows: FakeRow[], serverPageCap: number) {
  let calls = 0;
  const ranges: Array<[number, number]> = [];
  const build = () => {
    const builder = {
      range(from: number, to: number) {
        calls++;
        ranges.push([from, to]);
        const requested = rows.slice(from, to + 1);
        const capped = requested.slice(0, serverPageCap);
        return Object.assign(builder, {
          then(
            resolve: (v: { data: FakeRow[]; error: null }) => unknown,
            reject?: (e: unknown) => unknown,
          ) {
            return Promise.resolve({ data: capped, error: null }).then(
              resolve,
              reject,
            );
          },
        });
      },
    };
    return builder as unknown as ReturnType<
      Parameters<typeof paginateQuery<FakeRow>>[0]
    >;
  };
  return { build, callCount: () => calls, ranges: () => ranges };
}

describe("paginateQuery", () => {
  it("returns every row when the dataset is smaller than one page", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i }));
    const { build, callCount } = makeFakeBuilder(rows, 1000);
    const result = await paginateQuery(build, {
      pageSize: 1000,
      concurrency: 5,
    });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(250);
    // First wave fires `concurrency` parallel requests; the first one is
    // short so we stop and drop the rest of the wave.
    expect(callCount()).toBe(5);
  });

  it("returns every row across multiple waves (30-day window: 5,549 rows)", async () => {
    const rows = Array.from({ length: 5549 }, (_, i) => ({ id: i }));
    const { build } = makeFakeBuilder(rows, 1000);
    const result = await paginateQuery(build, {
      pageSize: 1000,
      concurrency: 5,
    });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(5549);
    expect(result.data[0].id).toBe(0);
    expect(result.data[5548].id).toBe(5548);
  });

  it("returns every row across multiple waves (90-day window: 16,650 rows)", async () => {
    // 90d × ~185 rows/day. Sequential would take 17 round-trips;
    // concurrency=5 reduces this to 4 waves.
    const rows = Array.from({ length: 16_650 }, (_, i) => ({ id: i }));
    const { build } = makeFakeBuilder(rows, 1000);
    const result = await paginateQuery(build, {
      pageSize: 1000,
      concurrency: 5,
    });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(16_650);
    expect(result.data[0].id).toBe(0);
    expect(result.data[16_649].id).toBe(16_649);
  });

  it("returns rows in offset order even when fired in parallel", async () => {
    // Critical for the chart: pages must concatenate in the same order
    // as their offsets, not in network-response order.
    const rows = Array.from({ length: 3500 }, (_, i) => ({ id: i }));
    const { build } = makeFakeBuilder(rows, 1000);
    const result = await paginateQuery(build, {
      pageSize: 1000,
      concurrency: 5,
    });
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i].id).toBe(i);
    }
  });

  it("respects maxRows ceiling and stops fetching", async () => {
    const rows = Array.from({ length: 50_000 }, (_, i) => ({ id: i }));
    const { build } = makeFakeBuilder(rows, 1000);
    const result = await paginateQuery(build, {
      pageSize: 1000,
      maxRows: 3000,
      concurrency: 5,
    });
    expect(result.data).toHaveLength(3000);
  });

  it("propagates errors and returns partial data accumulated so far", async () => {
    let call = 0;
    const build = () =>
      ({
        range() {
          call++;
          const isError = call === 3;
          return {
            then(
              resolve: (v: {
                data: FakeRow[] | null;
                error: { message: string } | null;
              }) => unknown,
              reject?: (e: unknown) => unknown,
            ) {
              return Promise.resolve(
                isError
                  ? { data: null, error: { message: "boom" } }
                  : {
                      data: Array.from({ length: 1000 }, (_, i) => ({
                        id: (call - 1) * 1000 + i,
                      })),
                      error: null,
                    },
              ).then(resolve, reject);
            },
          };
        },
      }) as unknown as ReturnType<
        Parameters<typeof paginateQuery<FakeRow>>[0]
      >;

    const result = await paginateQuery(build, {
      pageSize: 1000,
      concurrency: 1,
    });
    expect(result.error).toEqual({ message: "boom" });
    expect(result.data).toHaveLength(2000);
  });
});

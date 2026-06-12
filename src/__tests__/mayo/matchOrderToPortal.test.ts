import { describe, it, expect } from "vitest";
import {
  matchOrderToPortal,
  normalizeDob,
  type MatchRepo,
  type OrderRow,
  type ProfileRow,
} from "@/lib/mayo/matchOrderToPortal";

/** Builds an in-memory MatchRepo from fixture data. The fakes are
 *  deliberately simple — no joins, no filtering tricks — so the test
 *  matches what production wires to Supabase exactly: looking up by
 *  id / mayo_number, then ranking. */
function makeRepo(opts: {
  profiles?: ProfileRow[];
  orders?: OrderRow[];
}): MatchRepo {
  const profiles = opts.profiles ?? [];
  const orders = opts.orders ?? [];
  return {
    async findOrderByMayoOrderNumber(value) {
      return orders.find((o) => o.mayo_order_number === value) ?? null;
    },
    async findProfileByMayoPatientId(value) {
      return profiles.find((p) => p.mayo_patient_id === value) ?? null;
    },
    async findProfilesByNameAndDob(first, last, dobIso) {
      return profiles.filter(
        (p) =>
          p.first_name.toLowerCase() === first &&
          p.last_name.toLowerCase() === last &&
          p.date_of_birth === dobIso,
      );
    },
    async findOrdersForProfile(profileId) {
      return orders.filter(
        (o) => o.profile_id === profileId && o.status !== "cancelled",
      );
    },
  };
}

describe("normalizeDob", () => {
  it("normalizes Mayo's '30 Nov 1982' format", () => {
    expect(normalizeDob("30 Nov 1982")).toBe("1982-11-30");
  });
  it("passes ISO through", () => {
    expect(normalizeDob("1982-11-30")).toBe("1982-11-30");
  });
  it("handles US slash format", () => {
    expect(normalizeDob("11/30/1982")).toBe("1982-11-30");
  });
  it("returns null on garbage", () => {
    expect(normalizeDob("hello")).toBeNull();
    expect(normalizeDob("")).toBeNull();
    expect(normalizeDob(null)).toBeNull();
  });
});

describe("matchOrderToPortal", () => {
  it("returns exact when mayo_order_number already on an order", async () => {
    const repo = makeRepo({
      profiles: [],
      orders: [
        {
          id: "ord-1",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-06-01",
          mayo_order_number: "WEB123",
          mayo_patient_id: "MRN1",
          test_skus: ["CSTCE"],
          collection_date: null,
        },
      ],
    });
    const result = await matchOrderToPortal(
      {
        first_name: "Jane",
        last_name: "Doe",
        date_of_birth: "1 Jan 1990",
        test_skus: ["CSTCE"],
        mayo_order_number: "WEB123",
      },
      repo,
    );
    expect(result.confidence).toBe("exact");
    expect(result.primary_match?.order_id).toBe("ord-1");
    expect(result.primary_match?.reasoning).toMatch(/Already stamped/);
  });

  it("returns high when single profile match + exact test set", async () => {
    const repo = makeRepo({
      profiles: [
        {
          id: "prof-1",
          account_id: "acc-1",
          first_name: "Ryan",
          last_name: "Hassard",
          date_of_birth: "1982-11-30",
          mayo_patient_id: null,
        },
      ],
      orders: [
        {
          id: "ord-1",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-06-10",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["CSTCE", "APOAB", "HSCRP"],
          collection_date: "2026-06-11",
        },
      ],
    });
    const result = await matchOrderToPortal(
      {
        first_name: "Ryan",
        last_name: "Hassard",
        date_of_birth: "30 Nov 1982",
        test_skus: ["CSTCE", "APOAB", "HSCRP"],
        collection_date: "11 Jun 2026",
      },
      repo,
    );
    expect(result.confidence).toBe("high");
    expect(result.primary_match?.order_id).toBe("ord-1");
    expect(result.primary_match?.reasoning).toMatch(/Ryan Hassard/);
    expect(result.primary_match?.reasoning).toMatch(/exact test set/);
  });

  it("returns medium when order is a subset of CSV tests", async () => {
    const repo = makeRepo({
      profiles: [
        {
          id: "prof-1",
          account_id: "acc-1",
          first_name: "Ryan",
          last_name: "Hassard",
          date_of_birth: "1982-11-30",
          mayo_patient_id: null,
        },
      ],
      orders: [
        {
          id: "ord-1",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-06-10",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["CSTCE"],
          collection_date: null,
        },
      ],
    });
    const result = await matchOrderToPortal(
      {
        first_name: "Ryan",
        last_name: "Hassard",
        date_of_birth: "30 Nov 1982",
        test_skus: ["CSTCE", "APOAB"],
      },
      repo,
    );
    expect(result.confidence).toBe("medium");
    expect(result.primary_match?.reasoning).toMatch(/1 of the 2 CSV tests/);
  });

  it("returns low when multiple profiles match name+DOB", async () => {
    const repo = makeRepo({
      profiles: [
        {
          id: "prof-1",
          account_id: "acc-1",
          first_name: "Ryan",
          last_name: "Hassard",
          date_of_birth: "1982-11-30",
          mayo_patient_id: null,
        },
        {
          id: "prof-2",
          account_id: "acc-2",
          first_name: "Ryan",
          last_name: "Hassard",
          date_of_birth: "1982-11-30",
          mayo_patient_id: null,
        },
      ],
      orders: [
        {
          id: "ord-1",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-06-10",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["CSTCE"],
          collection_date: null,
        },
        {
          id: "ord-2",
          profile_id: "prof-2",
          status: "confirmed",
          created_at: "2026-06-10",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["CSTCE"],
          collection_date: null,
        },
      ],
    });
    const result = await matchOrderToPortal(
      {
        first_name: "Ryan",
        last_name: "Hassard",
        date_of_birth: "30 Nov 1982",
        test_skus: ["CSTCE"],
      },
      repo,
    );
    expect(result.confidence).toBe("low");
    expect(result.issues.join(" ")).toMatch(/Multiple portal profiles/);
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it("returns none when no profile matches name+DOB", async () => {
    const repo = makeRepo({ profiles: [], orders: [] });
    const result = await matchOrderToPortal(
      {
        first_name: "Nobody",
        last_name: "Here",
        date_of_birth: "1 Jan 1990",
        test_skus: ["CSTCE"],
      },
      repo,
    );
    expect(result.confidence).toBe("none");
    expect(result.primary_match).toBeNull();
    expect(result.issues.join(" ")).toMatch(/No portal profile/);
  });

  it("returns none when patient matches but no order has any CSV SKU", async () => {
    const repo = makeRepo({
      profiles: [
        {
          id: "prof-1",
          account_id: "acc-1",
          first_name: "Ryan",
          last_name: "Hassard",
          date_of_birth: "1982-11-30",
          mayo_patient_id: null,
        },
      ],
      orders: [
        {
          id: "ord-1",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-06-10",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["VITD"],
          collection_date: null,
        },
      ],
    });
    const result = await matchOrderToPortal(
      {
        first_name: "Ryan",
        last_name: "Hassard",
        date_of_birth: "30 Nov 1982",
        test_skus: ["CSTCE"],
      },
      repo,
    );
    expect(result.confidence).toBe("none");
    expect(result.primary_match).toBeNull();
    expect(result.issues.join(" ")).toMatch(/no portal order contains/);
  });

  it("uses mayo_patient_id to skip name+DOB lookup when known", async () => {
    const repo = makeRepo({
      profiles: [
        {
          id: "prof-1",
          account_id: "acc-1",
          // Note the name+DOB DON'T match what's in the CSV — the
          // MRN is the source of truth when present.
          first_name: "Different",
          last_name: "Name",
          date_of_birth: "1900-01-01",
          mayo_patient_id: "MRN-LOCKED",
        },
      ],
      orders: [
        {
          id: "ord-1",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-06-10",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["CSTCE"],
          collection_date: null,
        },
      ],
    });
    const result = await matchOrderToPortal(
      {
        first_name: "Ryan",
        last_name: "Hassard",
        date_of_birth: "30 Nov 1982",
        test_skus: ["CSTCE"],
        mayo_patient_id: "MRN-LOCKED",
      },
      repo,
    );
    expect(result.confidence).toBe("high");
    expect(result.primary_match?.order_id).toBe("ord-1");
  });

  it("ranks an order with closer collection date above one further out", async () => {
    const repo = makeRepo({
      profiles: [
        {
          id: "prof-1",
          account_id: "acc-1",
          first_name: "Jane",
          last_name: "Doe",
          date_of_birth: "1990-01-01",
          mayo_patient_id: null,
        },
      ],
      orders: [
        {
          id: "ord-far",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-01-01",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["CSTCE"],
          collection_date: "2026-01-01",
        },
        {
          id: "ord-near",
          profile_id: "prof-1",
          status: "confirmed",
          created_at: "2026-06-11",
          mayo_order_number: null,
          mayo_patient_id: null,
          test_skus: ["CSTCE"],
          collection_date: "2026-06-11",
        },
      ],
    });
    const result = await matchOrderToPortal(
      {
        first_name: "Jane",
        last_name: "Doe",
        date_of_birth: "1 Jan 1990",
        test_skus: ["CSTCE"],
        collection_date: "11 Jun 2026",
      },
      repo,
    );
    expect(result.primary_match?.order_id).toBe("ord-near");
    expect(result.alternatives[0]?.order_id).toBe("ord-far");
  });
});

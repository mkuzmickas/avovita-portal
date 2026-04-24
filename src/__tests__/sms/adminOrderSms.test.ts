import { describe, expect, it } from "vitest";
import { buildAdminOrderSmsBody } from "@/lib/sms/adminOrderSms";

describe("buildAdminOrderSmsBody", () => {
  it("renders the spec example verbatim (3-test order)", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "ord_7fa",
      totalCad: 441,
      testSkus: ["DHVD", "URATE", "VITD"],
      firstName: "Mike",
      lastName: "Kuzmickas",
    });
    expect(body).toBe(
      "New order #ord_7fa: $441 CAD. 3 tests: DHVD, URATE, VITD. Mike K."
    );
  });

  it("rounds partial-dollar totals to whole dollars", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "abc12345",
      totalCad: 441.37,
      testSkus: ["DHVD"],
      firstName: "Test",
      lastName: "User",
    });
    expect(body).toMatch(/\$441 CAD/);
  });

  it("truncates to top 5 SKUs with \"…+N more\" when the order has > 5 tests", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "abc12345",
      totalCad: 1200,
      testSkus: ["DHVD", "URATE", "VITD", "TSH", "FT4", "CBC", "CRP", "HOM"],
      firstName: "Mike",
      lastName: "K",
    });
    expect(body).toContain(
      "5 of 8 tests: DHVD, URATE, VITD, TSH, FT4…+3 more"
    );
    expect(body).not.toContain("CBC"); // tail truncated
  });

  it("falls back to email prefix when first + last names are missing", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "abc12345",
      totalCad: 200,
      testSkus: ["DHVD"],
      firstName: null,
      lastName: null,
      emailPrefix: "guest5",
    });
    expect(body).toMatch(/\. guest5\.$/);
  });

  it("omits the customer segment when no name and no email prefix are available", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "abc12345",
      totalCad: 200,
      testSkus: ["DHVD"],
      firstName: null,
      lastName: null,
    });
    expect(body).toBe("New order #abc12345: $200 CAD. 1 tests: DHVD.");
  });

  it("omits the tests segment for a supplement-only order (zero test SKUs)", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "abc12345",
      totalCad: 85,
      testSkus: [],
      firstName: "Mike",
      lastName: "K",
    });
    expect(body).toBe("New order #abc12345: $85 CAD. Mike K.");
  });

  it("body with zero tests and no customer name is just head + period", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "abc12345",
      totalCad: 85,
      testSkus: [],
      firstName: null,
      lastName: null,
    });
    expect(body).toBe("New order #abc12345: $85 CAD.");
  });

  it("uses first name only when last name is missing (no trailing initial)", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "abc12345",
      totalCad: 200,
      testSkus: ["DHVD"],
      firstName: "Madonna",
      lastName: null,
    });
    expect(body).toMatch(/\. Madonna\.$/);
  });

  it("stays under 160 chars for a typical 3-test order", () => {
    const body = buildAdminOrderSmsBody({
      orderIdShort: "ord_7fa",
      totalCad: 441,
      testSkus: ["DHVD", "URATE", "VITD"],
      firstName: "Mike",
      lastName: "Kuzmickas",
    });
    expect(body.length).toBeLessThanOrEqual(160);
  });
});

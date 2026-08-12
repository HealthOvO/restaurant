import { describe, expect, it } from "vitest";
import { customerMemberPageQuery } from "../src/handlers/v2.customer-api";

describe("customer record pagination compatibility", () => {
  it("keeps the legacy points response at the previous 100-row limit", () => {
    expect(customerMemberPageQuery({}, 100)).toEqual({ limit: 100 });
  });

  it("uses explicit keyset pagination from the current mini-program", () => {
    expect(customerMemberPageQuery({ cursor: "eyJpZCI6InAxIn0", limit: 20 }, 100)).toEqual({
      cursor: "eyJpZCI6InAxIn0",
      limit: 20
    });
  });
});

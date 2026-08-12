import { describe, expect, it } from "vitest";
import { withLegacyExpectedVersion } from "../src/handlers/v2.owner-api";

describe("owner write compatibility", () => {
  it("adds the current version for an older admin payload", () => {
    expect(withLegacyExpectedVersion({ id: "category-1", name: "肉片" }, 3)).toEqual({
      id: "category-1",
      name: "肉片",
      expectedVersion: 3
    });
  });

  it("never replaces a version supplied by the current admin", () => {
    expect(withLegacyExpectedVersion({ id: "category-1", expectedVersion: 2 }, 3)).toEqual({
      id: "category-1",
      expectedVersion: 2
    });
  });
});

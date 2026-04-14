import { describe, expect, it } from "vitest";
import { hashPassword, issueSessionToken, requireSessionToken, verifyPassword } from "../src/runtime/auth";

process.env.SESSION_SECRET = "test-session-secret";

describe("session auth", () => {
  it("hashes and verifies passwords", async () => {
    const passwordHash = await hashPassword("123456");
    await expect(verifyPassword("123456", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("654321", passwordHash)).resolves.toBe(false);
  });

  it("issues and validates staff session token", () => {
    const token = issueSessionToken({
      staffUserId: "staff-1",
      username: "owner",
      role: "OWNER",
      storeId: "default-store"
    });

    expect(requireSessionToken(token)).toMatchObject({
      staffUserId: "staff-1",
      role: "OWNER"
    });
  });

  it("rejects issuing tokens when SESSION_SECRET is missing", () => {
    const previousSecret = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;

    try {
      expect(() =>
        issueSessionToken({
          staffUserId: "staff-1",
          username: "owner",
          role: "OWNER",
          storeId: "default-store"
        })
      ).toThrow("系统安全配置缺失");
    } finally {
      if (previousSecret) {
        process.env.SESSION_SECRET = previousSecret;
      }
    }
  });
});

import jwt from "jsonwebtoken";
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
      role: "OWNER",
      accessScope: "STORE_ONLY",
      managedStoreIds: ["default-store"]
    });
  });

  it("drops extra managed stores when the token scope is store-only", () => {
    const token = issueSessionToken({
      staffUserId: "staff-1",
      username: "owner",
      role: "OWNER",
      storeId: "default-store",
      accessScope: "STORE_ONLY",
      managedStoreIds: ["branch-01", "default-store", "branch-02"]
    });

    expect(requireSessionToken(token)).toMatchObject({
      accessScope: "STORE_ONLY",
      managedStoreIds: ["default-store"]
    });
  });

  it("rejects tokens with malformed claims", () => {
    const token = jwt.sign(
      {
        staffUserId: "",
        username: "owner",
        role: "OWNER",
        storeId: "default-store"
      },
      process.env.SESSION_SECRET as string
    );

    expect(() => requireSessionToken(token)).toThrow("登录已失效，请重新登录");
  });

  it("keeps cross-store access only for all-store owners", () => {
    const token = issueSessionToken({
      staffUserId: "staff-owner-1",
      username: "hq-owner",
      role: "OWNER",
      storeId: "hq-store",
      accessScope: "ALL_STORES",
      managedStoreIds: ["branch-01", "branch-01", "branch-02"]
    });

    expect(requireSessionToken(token)).toMatchObject({
      accessScope: "ALL_STORES",
      managedStoreIds: ["hq-store", "branch-01", "branch-02"]
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

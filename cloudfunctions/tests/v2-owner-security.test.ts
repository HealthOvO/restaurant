import { describe, expect, it, beforeEach } from "vitest";
import type { V2OwnerAccount } from "@restaurant/shared";
import { hashV2OwnerPassword, loginV2Owner } from "../src/v2/owner-auth";
import { InMemoryV2Repository } from "../src/v2/repository";
import { initializeV2Store, resetV2Owner } from "../src/v2/setup";

const nowIso = "2026-08-09T10:00:00.000Z";

async function ownerAccount(): Promise<V2OwnerAccount> {
  return {
    _id: "store-main:owner",
    storeId: "store-main",
    username: "owner",
    displayName: "老板",
    passwordHash: await hashV2OwnerPassword("strong-password"),
    enabled: true,
    sessionVersion: 1,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

describe("V2 owner authentication safeguards", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
  });

  it("rejects even the correct password while the owner login bucket is locked", async () => {
    const owner = await ownerAccount();
    const repository = new InMemoryV2Repository("store-main", { ownerAccounts: [owner] });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(loginV2Owner(repository, { username: "owner", password: "wrong-password" }, new Date(nowIso))).rejects.toThrow();
    }
    await expect(loginV2Owner(repository, { username: "owner", password: "strong-password" }, new Date(nowIso))).rejects.toThrow("登录尝试较多");
    await expect(loginV2Owner(repository, { username: "owner", password: "strong-password" }, new Date("2026-08-09T10:16:00.000Z"))).resolves.toBeTruthy();
  });

  it("uses one bounded rate-limit bucket for arbitrary unknown usernames", async () => {
    const repository = new InMemoryV2Repository("store-main");
    for (let index = 0; index < 12; index += 1) {
      await expect(loginV2Owner(repository, { username: `unknown-${index}`, password: "wrong-password" }, new Date(nowIso))).rejects.toThrow();
    }
    const attempts = (repository as unknown as { data: { ownerLoginAttempts: Map<string, unknown> } }).data.ownerLoginAttempts;
    expect(attempts.size).toBe(1);
  });

  it("atomically reserves the bucket so concurrent attempts stop at the fifth bcrypt slot", async () => {
    const owner = await ownerAccount();
    const repository = new InMemoryV2Repository("store-main", { ownerAccounts: [owner] });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => loginV2Owner(repository, {
      username: "owner",
      password: "wrong-password"
    }, new Date(nowIso))));

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    const attempts = (repository as unknown as {
      data: { ownerLoginAttempts: Map<string, { attemptCount: number; lockedUntil?: string }> };
    }).data.ownerLoginAttempts;
    expect(attempts.size).toBe(1);
    expect([...attempts.values()][0]).toMatchObject({
      attemptCount: 5,
      lockedUntil: "2026-08-09T10:15:00.000Z"
    });
  });

  it("requires mixed-case letters and a number when resetting the production owner", async () => {
    const owner = await ownerAccount();
    const repository = new InMemoryV2Repository("store-main", { ownerAccounts: [owner] });
    await expect(resetV2Owner(repository, {
      username: "owner",
      password: "alllowercase1",
      displayName: "老板"
    }, new Date(nowIso))).rejects.toThrow();
    expect((await repository.getOwnerById(owner._id))?.sessionVersion).toBe(1);
  });

  it("requires the same strong-password policy during store initialization", async () => {
    const repository = new InMemoryV2Repository("store-main");
    await expect(initializeV2Store(repository, {
      storeName: "测试门店",
      username: "owner",
      password: "alllowercase1",
      displayName: "老板"
    }, new Date(nowIso))).rejects.toThrow();
    expect(await repository.getStoreConfig()).toBeNull();
  });

  it("keeps legacy owner passwords valid for login", async () => {
    const owner = await ownerAccount();
    const repository = new InMemoryV2Repository("store-main", { ownerAccounts: [owner] });
    await expect(loginV2Owner(repository, {
      username: "owner",
      password: "strong-password"
    }, new Date(nowIso))).resolves.toBeTruthy();
  });
});

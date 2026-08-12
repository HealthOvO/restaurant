import { describe, expect, it, beforeEach } from "vitest";
import type { V2OwnerAccount } from "@restaurant/shared";
import { hashV2OwnerPassword, loginV2Owner } from "../src/v2/owner-auth";
import { InMemoryV2Repository, type V2Transaction } from "../src/v2/repository";
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

class InterleavedOwnerLoginRepository extends InMemoryV2Repository {
  private armed = false;
  private fourthPaused = false;
  private releaseFourthReservation!: () => void;
  private fourthReservationReached!: () => void;
  private fifthReservationReached!: () => void;
  private readonly fourthReservation = new Promise<void>((resolve) => { this.fourthReservationReached = resolve; });
  private readonly fifthReservation = new Promise<void>((resolve) => { this.fifthReservationReached = resolve; });
  private readonly releaseFourth = new Promise<void>((resolve) => { this.releaseFourthReservation = resolve; });

  armMixedAttemptRace() {
    this.armed = true;
  }

  waitForFourthReservation() {
    return this.fourthReservation;
  }

  waitForFifthReservation() {
    return this.fifthReservation;
  }

  continueFourthAttempt() {
    this.releaseFourthReservation();
  }

  override async runTransaction<T>(callback: (transaction: V2Transaction) => Promise<T>): Promise<T> {
    const result = await super.runTransaction(callback);
    if (!this.armed) return result;
    const generations = Array.from(this.snapshot().ownerLoginAttempts.values(), (attempt) => attempt.reservationGeneration ?? 0);
    const generation = Math.max(0, ...generations);
    if (generation === 4 && !this.fourthPaused) {
      this.fourthPaused = true;
      this.fourthReservationReached();
      await this.releaseFourth;
    } else if (generation >= 5) {
      this.fifthReservationReached();
    }
    return result;
  }
}

class ResetDuringLoginRepository extends InMemoryV2Repository {
  private ownerReadReached!: () => void;
  private releaseOwnerRead!: () => void;
  private readonly ownerRead = new Promise<void>((resolve) => { this.ownerReadReached = resolve; });
  private readonly ownerReadBarrier = new Promise<void>((resolve) => { this.releaseOwnerRead = resolve; });

  waitForOwnerRead() {
    return this.ownerRead;
  }

  continueLogin() {
    this.releaseOwnerRead();
  }

  override async getOwnerByUsername(username: string) {
    const owner = await super.getOwnerByUsername(username);
    this.ownerReadReached();
    await this.ownerReadBarrier;
    return owner;
  }
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

  it("does not let an earlier successful attempt clear a later concurrent failure lock", async () => {
    const owner = await ownerAccount();
    const repository = new InterleavedOwnerLoginRepository("store-main", { ownerAccounts: [owner] });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(loginV2Owner(repository, {
        username: "owner",
        password: "wrong-password"
      }, new Date(nowIso))).rejects.toThrow("账号或密码错误");
    }

    repository.armMixedAttemptRace();
    const correctLogin = loginV2Owner(repository, {
      username: "owner",
      password: "strong-password"
    }, new Date(nowIso));
    await repository.waitForFourthReservation();
    const wrongLogin = loginV2Owner(repository, {
      username: "owner",
      password: "wrong-password"
    }, new Date(nowIso));
    const resultsPromise = Promise.allSettled([correctLogin, wrongLogin]);
    await repository.waitForFifthReservation();
    repository.continueFourthAttempt();

    const [correctResult, wrongResult] = await resultsPromise;
    expect(correctResult.status).toBe("fulfilled");
    expect(wrongResult.status).toBe("rejected");
    const attempts = Array.from(repository.snapshot().ownerLoginAttempts.values());
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      reservationGeneration: 5,
      attemptCount: 5,
      lockedUntil: "2026-08-09T10:15:00.000Z"
    });
    await expect(loginV2Owner(repository, {
      username: "owner",
      password: "strong-password"
    }, new Date(nowIso))).rejects.toThrow("登录尝试较多");
  });

  it("rejects a login authenticated against an owner snapshot changed by a concurrent reset", async () => {
    const owner = await ownerAccount();
    const repository = new ResetDuringLoginRepository("store-main", { ownerAccounts: [owner] });
    const oldLogin = loginV2Owner(repository, {
      username: "owner",
      password: "strong-password"
    }, new Date(nowIso));
    await repository.waitForOwnerRead();

    await resetV2Owner(repository, {
      username: "owner",
      password: "New-strong-password1",
      displayName: "新老板"
    }, new Date("2026-08-09T10:00:01.000Z"));
    repository.continueLogin();

    await expect(oldLogin).rejects.toThrow("账号信息刚刚更新");
    expect(await repository.getOwnerById(owner._id)).toMatchObject({
      displayName: "新老板",
      sessionVersion: 2
    });
    await expect(loginV2Owner(repository, {
      username: "owner",
      password: "New-strong-password1"
    }, new Date("2026-08-09T10:00:02.000Z"))).resolves.toBeTruthy();
    expect((await repository.getOwnerById(owner._id))?.sessionVersion).toBe(2);
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

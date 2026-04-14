import { describe, expect, it, vi } from "vitest";
import { bootstrapStoreOwner } from "../src/runtime/service.bootstrap";

process.env.BOOTSTRAP_SECRET = "bootstrap-secret-123";

describe("bootstrap store owner service", () => {
  it("creates a new branch owner with normalized managed stores", async () => {
    const repository = {
      storeId: "branch-01",
      getStaffByUsername: vi.fn().mockResolvedValue(null),
      saveStaffUser: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await bootstrapStoreOwner(repository as never, {
      secret: "bootstrap-secret-123",
      ownerUsername: "owner-branch-01",
      ownerPassword: "owner123456",
      ownerDisplayName: "一店老板",
      accessScope: "ALL_STORES",
      managedStoreIds: ["branch-02", "branch-01"]
    });

    expect(result).toMatchObject({
      ok: true,
      created: true,
      owner: {
        storeId: "branch-01",
        username: "owner-branch-01",
        accessScope: "ALL_STORES",
        managedStoreIds: ["branch-01", "branch-02"]
      }
    });
    expect(repository.saveStaffUser).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "branch-01",
        role: "OWNER",
        isEnabled: true
      })
    );
  });

  it("ignores extra managed stores for store-only owners", async () => {
    const repository = {
      storeId: "branch-03",
      getStaffByUsername: vi.fn().mockResolvedValue(null),
      saveStaffUser: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await bootstrapStoreOwner(repository as never, {
      secret: "bootstrap-secret-123",
      ownerUsername: "owner-branch-03",
      ownerPassword: "owner123456",
      accessScope: "STORE_ONLY",
      managedStoreIds: ["branch-04", "branch-05"]
    });

    expect(result).toMatchObject({
      ok: true,
      owner: {
        storeId: "branch-03",
        accessScope: "STORE_ONLY",
        managedStoreIds: ["branch-03"]
      }
    });
  });

  it("updates an existing owner instead of creating a duplicate", async () => {
    const repository = {
      storeId: "hq-store",
      getStaffByUsername: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "hq-store",
        username: "owner",
        passwordHash: "old-hash",
        displayName: "旧老板",
        role: "OWNER",
        isEnabled: false,
        accessScope: "STORE_ONLY",
        managedStoreIds: ["hq-store"],
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      }),
      saveStaffUser: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await bootstrapStoreOwner(repository as never, {
      secret: "bootstrap-secret-123",
      ownerUsername: "owner",
      ownerPassword: "new-owner-pass",
      accessScope: "ALL_STORES",
      managedStoreIds: ["branch-01", "branch-02"]
    });

    expect(result).toMatchObject({
      ok: true,
      created: false,
      owner: {
        _id: "staff-owner-1",
        storeId: "hq-store",
        accessScope: "ALL_STORES",
        managedStoreIds: ["hq-store", "branch-01", "branch-02"]
      }
    });
    expect(repository.saveStaffUser).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "staff-owner-1",
        isEnabled: true,
        displayName: "总店老板"
      })
    );
  });

  it("rejects invalid bootstrap secrets", async () => {
    const repository = {
      storeId: "branch-09",
      getStaffByUsername: vi.fn()
    };

    await expect(
      bootstrapStoreOwner(repository as never, {
        secret: "wrong-secret",
        ownerUsername: "owner-09",
        ownerPassword: "owner123456"
      })
    ).rejects.toMatchObject({
      message: "门店初始化口令无效"
    });
  });

  it("rejects a non-owner account that already uses the target username", async () => {
    const repository = {
      storeId: "branch-10",
      getStaffByUsername: vi.fn().mockResolvedValue({
        _id: "staff-10",
        storeId: "branch-10",
        username: "owner-10",
        passwordHash: "hash",
        displayName: "收银员",
        role: "STAFF",
        isEnabled: true,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      })
    };

    await expect(
      bootstrapStoreOwner(repository as never, {
        secret: "bootstrap-secret-123",
        ownerUsername: "owner-10",
        ownerPassword: "owner123456"
      })
    ).rejects.toMatchObject({
      code: "STAFF_USERNAME_EXISTS"
    });
  });
});

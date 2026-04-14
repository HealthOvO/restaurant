import { describe, expect, it, vi } from "vitest";
import { getStaffProfile, login, requireActiveStaffSession, searchMembersForStaff } from "../src/runtime/service.staff";
import { hashPassword, issueSessionToken } from "../src/runtime/auth";

process.env.SESSION_SECRET = "test-session-secret";

describe("staff session service", () => {
  it("does not auto-seed a default owner account during login", async () => {
    const repository = {
      storeId: "default-store",
      getStaffByUsername: vi.fn().mockResolvedValue(null),
      getStaffByMiniOpenId: vi.fn(),
      saveStaffUser: vi.fn()
    };

    await expect(
      login(repository as never, {
        username: "owner",
        password: "owner123456"
      })
    ).rejects.toMatchObject({
      message: "账号或密码错误"
    });

    expect(repository.saveStaffUser).not.toHaveBeenCalled();
  });

  it("binds miniOpenId on first successful mini-program login", async () => {
    const passwordHash = await hashPassword("123456");
    const staffUser = {
      _id: "staff-1",
      storeId: "default-store",
      username: "cashier01",
      passwordHash,
      displayName: "前台小王",
      role: "STAFF" as const,
      isEnabled: true,
      createdAt: "2026-04-02T08:00:00.000Z",
      updatedAt: "2026-04-02T08:00:00.000Z"
    };
    const repository = {
      storeId: "default-store",
      listStaffUsers: vi.fn().mockResolvedValue([staffUser]),
      getStaffByUsername: vi.fn().mockResolvedValue(staffUser),
      getStaffByMiniOpenId: vi.fn().mockResolvedValue(null),
      saveStaffUser: vi.fn().mockImplementation(async (user) => user)
    };

    const result = await login(repository as never, {
      username: "cashier01",
      password: "123456",
      miniOpenId: "mini-openid-1"
    });

    expect(repository.saveStaffUser).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "staff-1",
        miniOpenId: "mini-openid-1"
      })
    );
    expect(result.staff.miniOpenId).toBe("mini-openid-1");
  });

  it("trims username and miniOpenId before login binding", async () => {
    const passwordHash = await hashPassword("123456");
    const staffUser = {
      _id: "staff-1",
      storeId: "default-store",
      username: "cashier01",
      passwordHash,
      displayName: "前台小王",
      role: "STAFF" as const,
      isEnabled: true,
      createdAt: "2026-04-02T08:00:00.000Z",
      updatedAt: "2026-04-02T08:00:00.000Z"
    };
    const repository = {
      storeId: "default-store",
      listStaffUsers: vi.fn().mockResolvedValue([staffUser]),
      getStaffByUsername: vi.fn().mockResolvedValue(staffUser),
      getStaffByMiniOpenId: vi.fn().mockResolvedValue(null),
      saveStaffUser: vi.fn().mockImplementation(async (user) => user)
    };

    const result = await login(repository as never, {
      username: "  cashier01  ",
      password: "123456",
      miniOpenId: "  mini-openid-1  "
    });

    expect(repository.getStaffByUsername).toHaveBeenCalledWith("cashier01");
    expect(repository.getStaffByMiniOpenId).toHaveBeenCalledWith("mini-openid-1");
    expect(result.staff.miniOpenId).toBe("mini-openid-1");
  });

  it("rejects rebinding a staff account to another miniOpenId", async () => {
    const passwordHash = await hashPassword("123456");
    const repository = {
      storeId: "default-store",
      listStaffUsers: vi.fn().mockResolvedValue([
        {
          _id: "staff-1",
          storeId: "default-store",
          username: "cashier01",
          passwordHash,
          displayName: "前台小王",
          role: "STAFF" as const,
          isEnabled: true,
          miniOpenId: "mini-openid-old",
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }
      ]),
      getStaffByUsername: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash,
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        miniOpenId: "mini-openid-old",
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getStaffByMiniOpenId: vi.fn(),
      saveStaffUser: vi.fn()
    };

    await expect(
      login(repository as never, {
        username: "cashier01",
        password: "123456",
        miniOpenId: "mini-openid-new"
      })
    ).rejects.toMatchObject({
      message: "当前账号已绑定其他微信，请联系老板处理"
    });
  });

  it("rejects logging in when the current miniOpenId is already used by another staff", async () => {
    const passwordHash = await hashPassword("123456");
    const repository = {
      storeId: "default-store",
      listStaffUsers: vi.fn().mockResolvedValue([
        {
          _id: "staff-1",
          storeId: "default-store",
          username: "cashier01",
          passwordHash,
          displayName: "前台小王",
          role: "STAFF" as const,
          isEnabled: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }
      ]),
      getStaffByUsername: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash,
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getStaffByMiniOpenId: vi.fn().mockResolvedValue({
        _id: "staff-2",
        storeId: "default-store",
        username: "cashier02",
        passwordHash,
        displayName: "前台小李",
        role: "STAFF",
        isEnabled: true,
        miniOpenId: "mini-openid-1",
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      saveStaffUser: vi.fn()
    };

    await expect(
      login(repository as never, {
        username: "cashier01",
        password: "123456",
        miniOpenId: "mini-openid-1"
      })
    ).rejects.toMatchObject({
      message: "当前微信已绑定其他员工账号，请使用原账号登录"
    });
  });

  it("returns current staff profile for an active session", async () => {
    const sessionToken = issueSessionToken({
      staffUserId: "staff-1",
      username: "cashier01",
      role: "STAFF",
      storeId: "default-store"
    });

    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        miniOpenId: "openid-1",
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      })
    };

    await expect(getStaffProfile(repository as never, { sessionToken })).resolves.toMatchObject({
      ok: true,
      staff: {
        _id: "staff-1",
        username: "cashier01"
      }
    });
  });

  it("keeps store-only staff profile scoped to its own store even if managedStoreIds is dirty", async () => {
    const sessionToken = issueSessionToken({
      staffUserId: "staff-1",
      username: "cashier01",
      role: "STAFF",
      storeId: "default-store"
    });

    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        miniOpenId: "openid-1",
        accessScope: "ALL_STORES",
        managedStoreIds: ["other-store", " default-store "],
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      })
    };

    await expect(getStaffProfile(repository as never, { sessionToken })).resolves.toMatchObject({
      ok: true,
      staff: {
        _id: "staff-1",
        accessScope: "STORE_ONLY",
        managedStoreIds: ["default-store"]
      }
    });
  });

  it("rejects disabled staff sessions", async () => {
    const sessionToken = issueSessionToken({
      staffUserId: "staff-2",
      username: "cashier02",
      role: "STAFF",
      storeId: "default-store"
    });

    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-2",
        storeId: "default-store",
        username: "cashier02",
        passwordHash: "hash",
        displayName: "前台小李",
        role: "STAFF",
        isEnabled: false,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      })
    };

    await expect(requireActiveStaffSession(repository as never, sessionToken)).rejects.toMatchObject({
      message: "登录已失效，请重新登录"
    });
  });

  it("allows headquarters owners to access managed branch stores", async () => {
    const sessionToken = issueSessionToken({
      staffUserId: "staff-owner-1",
      username: "owner",
      role: "OWNER",
      storeId: "hq-store",
      accessScope: "ALL_STORES",
      managedStoreIds: ["branch-01", "branch-02"]
    });

    const repository = {
      storeId: "branch-01",
      getStaffByIdFromStore: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "hq-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "总店老板",
        role: "OWNER",
        isEnabled: true,
        accessScope: "ALL_STORES",
        managedStoreIds: ["branch-01", " branch-02 ", "hq-store", "branch-01"],
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      })
    };

    await expect(requireActiveStaffSession(repository as never, sessionToken)).resolves.toMatchObject({
      accessScope: "ALL_STORES",
      accessibleStoreIds: ["hq-store", "branch-01", "branch-02"],
      staff: {
        _id: "staff-owner-1",
        storeId: "hq-store"
      }
    });
  });

  it("rejects branch owners from opening other stores", async () => {
    const sessionToken = issueSessionToken({
      staffUserId: "staff-owner-2",
      username: "owner-branch",
      role: "OWNER",
      storeId: "branch-01"
    });

    const repository = {
      storeId: "branch-02",
      getStaffByIdFromStore: vi.fn().mockResolvedValue({
        _id: "staff-owner-2",
        storeId: "branch-01",
        username: "owner-branch",
        passwordHash: "hash",
        displayName: "分店老板",
        role: "OWNER",
        isEnabled: true,
        accessScope: "STORE_ONLY",
        managedStoreIds: ["branch-01"],
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      })
    };

    await expect(requireActiveStaffSession(repository as never, sessionToken)).rejects.toMatchObject({
      message: "当前登录环境无效，请重新登录"
    });
  });

  it("returns lightweight member summaries for staff search", async () => {
    const sessionToken = issueSessionToken({
      staffUserId: "staff-1",
      username: "cashier01",
      role: "STAFF",
      storeId: "default-store"
    });
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        miniOpenId: "openid-1",
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      searchMembers: vi.fn().mockResolvedValue([
        {
          _id: "member-1",
          storeId: "default-store",
          memberCode: "M00000001",
          openId: "openid-member-1",
          phone: "13812345678",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          nickname: "张三",
          hasCompletedFirstVisit: true,
          firstVisitAt: "2026-04-03T08:00:00.000Z",
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-04T08:00:00.000Z"
        }
      ]),
      listInviteRelationsByInviteeIds: vi.fn().mockResolvedValue([
        {
          _id: "invite-1",
          storeId: "default-store",
          inviterMemberId: "member-owner",
          inviteeMemberId: "member-1",
          status: "ACTIVATED",
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-04T08:00:00.000Z"
        }
      ]),
      listVisitsByMemberIds: vi.fn().mockResolvedValue([
        {
          _id: "visit-1",
          storeId: "default-store",
          memberId: "member-1",
          externalOrderNo: "ORDER-1",
          verifiedByStaffId: "staff-1",
          operatorChannel: "MINIPROGRAM",
          isFirstValidVisit: true,
          verifiedAt: "2026-04-03T10:00:00.000Z",
          createdAt: "2026-04-03T10:00:00.000Z",
          updatedAt: "2026-04-03T10:00:00.000Z"
        },
        {
          _id: "visit-2",
          storeId: "default-store",
          memberId: "member-1",
          externalOrderNo: "ORDER-2",
          verifiedByStaffId: "staff-1",
          operatorChannel: "MINIPROGRAM",
          isFirstValidVisit: false,
          verifiedAt: "2026-04-04T10:00:00.000Z",
          createdAt: "2026-04-04T10:00:00.000Z",
          updatedAt: "2026-04-04T10:00:00.000Z"
        }
      ]),
      listVouchersByMemberIds: vi.fn().mockResolvedValue([
        {
          _id: "voucher-1",
          storeId: "default-store",
          memberId: "member-1",
          source: "WELCOME",
          dishId: "dish-1",
          dishName: "欢迎饮品",
          status: "READY",
          expiresAt: "2099-04-03T10:00:00.000Z",
          createdAt: "2026-04-03T10:00:00.000Z",
          updatedAt: "2026-04-03T10:00:00.000Z"
        },
        {
          _id: "voucher-2",
          storeId: "default-store",
          memberId: "member-1",
          source: "WELCOME",
          dishId: "dish-2",
          dishName: "欢迎小食",
          status: "USED",
          expiresAt: "2099-04-05T10:00:00.000Z",
          createdAt: "2026-04-05T10:00:00.000Z",
          updatedAt: "2026-04-05T10:00:00.000Z"
        }
      ]),
      saveVouchers: vi.fn().mockResolvedValue([])
    };

    await expect(
      searchMembersForStaff(repository as never, {
        sessionToken,
        query: "M00000001",
        limit: 10
      })
    ).resolves.toMatchObject({
      ok: true,
      rows: [
        {
          member: {
            _id: "member-1",
            memberCode: "M00000001",
            phone: "13812345678"
          },
          relationStatus: "ACTIVATED",
          latestVisitAt: "2026-04-04T10:00:00.000Z",
          readyVoucherCount: 1,
          totalVoucherCount: 2,
          totalVisitCount: 2
        }
      ]
    });
  });

  it("returns early when staff search has no matched members", async () => {
    const sessionToken = issueSessionToken({
      staffUserId: "staff-1",
      username: "cashier01",
      role: "STAFF",
      storeId: "default-store"
    });
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        miniOpenId: "openid-1",
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      searchMembers: vi.fn().mockResolvedValue([]),
      listInviteRelationsByInviteeIds: vi.fn(),
      listVisitsByMemberIds: vi.fn(),
      listVouchersByMemberIds: vi.fn(),
      saveVouchers: vi.fn()
    };

    await expect(
      searchMembersForStaff(repository as never, {
        sessionToken,
        query: "not-found",
        limit: 10
      })
    ).resolves.toMatchObject({
      ok: true,
      rows: []
    });

    expect(repository.listInviteRelationsByInviteeIds).not.toHaveBeenCalled();
    expect(repository.listVisitsByMemberIds).not.toHaveBeenCalled();
    expect(repository.listVouchersByMemberIds).not.toHaveBeenCalled();
  });
});

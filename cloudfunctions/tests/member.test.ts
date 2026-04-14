import { describe, expect, it, vi } from "vitest";
import {
  bindInvite,
  bootstrapMember,
  getMemberState,
  redeemPoints,
  redeemVoucher,
  settleFirstVisit
} from "../src/runtime/service.member";
import { issueSessionToken } from "../src/runtime/auth";

process.env.SESSION_SECRET = "test-session-secret";

const staffSessionToken = issueSessionToken({
  staffUserId: "staff-1",
  username: "cashier01",
  role: "STAFF",
  storeId: "default-store"
});

describe("member bootstrap", () => {
  it("defers invite relation creation until the member verifies their phone", async () => {
    const repository = {
      storeId: "default-store",
      getMemberByOpenId: vi.fn().mockResolvedValue(null),
      getMemberByPhone: vi.fn().mockResolvedValue(null),
      saveMember: vi.fn().mockImplementation(async (member) => member),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue(null),
      listMembers: vi.fn(),
      saveInviteRelation: vi.fn()
    };

    const result = await bootstrapMember(repository as never, "mini-openid-1", {
      nickname: "新会员",
      inviteCode: "M00000002"
    });

    expect(result).toMatchObject({
      ok: true,
      member: {
        openId: "mini-openid-1",
        pendingInviteCode: "M00000002",
        hasCompletedFirstVisit: false
      }
    });
    expect(result.relation).toBeNull();
    expect(repository.listMembers).not.toHaveBeenCalled();
    expect(repository.saveInviteRelation).not.toHaveBeenCalled();
  });

  it("reads member state without writing when the member already exists", async () => {
    const member = {
      _id: "member-1",
      storeId: "default-store",
      memberCode: "M00000001",
      openId: "mini-openid-1",
      phone: "13812345678",
      phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
      hasCompletedFirstVisit: true,
      firstVisitAt: "2026-04-03T08:00:00.000Z",
      createdAt: "2026-04-02T08:00:00.000Z",
      updatedAt: "2026-04-03T08:00:00.000Z"
    };
    const relation = {
      _id: "invite-1",
      storeId: "default-store",
      inviterMemberId: "member-owner",
      inviteeMemberId: "member-1",
      status: "ACTIVATED" as const,
      createdAt: "2026-04-02T08:00:00.000Z",
      updatedAt: "2026-04-03T08:00:00.000Z"
    };
    const repository = {
      getMemberByOpenId: vi.fn().mockResolvedValue(member),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue(relation)
    };

    await expect(getMemberState(repository as never, "mini-openid-1")).resolves.toMatchObject({
      ok: true,
      member,
      relation
    });
  });
});

describe("manual invite binding", () => {
  it("rejects binding before the invitee verifies their phone", async () => {
    const repository = {
      getMemberById: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "member-invitee",
          storeId: "default-store",
          memberCode: "M00000003",
          openId: "openid-invitee",
          hasCompletedFirstVisit: false,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        })
        .mockResolvedValueOnce({
          _id: "member-inviter",
          storeId: "default-store",
          memberCode: "M00000001",
          openId: "openid-inviter",
          phone: "13812345678",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          hasCompletedFirstVisit: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        })
    };

    await expect(
      bindInvite(repository as never, {
        inviteeMemberId: "member-invitee",
        inviterMemberId: "member-inviter"
      })
    ).rejects.toMatchObject({
      code: "MEMBER_PHONE_REQUIRED",
      message: "完成微信手机号验证后才能绑定邀请码"
    });
  });

  it("clears pending invite code after a successful manual bind", async () => {
    const repository = {
      storeId: "default-store",
      getMemberById: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "member-invitee",
          storeId: "default-store",
          memberCode: "M00000003",
          openId: "openid-invitee",
          phone: "13812345679",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          pendingInviteCode: "M00000001",
          hasCompletedFirstVisit: false,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        })
        .mockResolvedValueOnce({
          _id: "member-inviter",
          storeId: "default-store",
          memberCode: "M00000001",
          openId: "openid-inviter",
          phone: "13812345678",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          hasCompletedFirstVisit: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue(null),
      saveInviteRelation: vi.fn().mockImplementation(async (relation) => relation),
      saveMember: vi.fn().mockImplementation(async (member) => member)
    };

    const result = await bindInvite(repository as never, {
      inviteeMemberId: "member-invitee",
      inviterMemberId: "member-inviter"
    });

    expect(result).toMatchObject({
      ok: true,
      relation: {
        inviterMemberId: "member-inviter",
        inviteeMemberId: "member-invitee",
        status: "PENDING"
      }
    });
    expect(repository.saveMember).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "member-invitee",
        pendingInviteCode: undefined
      })
    );
  });
});

describe("member transaction safety", () => {
  it("rejects settling a first visit when the member has not verified their phone", async () => {
    const member = {
      _id: "member-unverified",
      storeId: "default-store",
      memberCode: "M00000009",
      openId: "openid-unverified",
      hasCompletedFirstVisit: false,
      createdAt: "2026-04-02T08:00:00.000Z",
      updatedAt: "2026-04-02T08:00:00.000Z"
    };
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
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getMemberById: vi.fn().mockResolvedValue(member),
      getVisitByExternalOrderNo: vi.fn().mockResolvedValue(null),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue(null),
      listRewardRules: vi.fn().mockResolvedValue([]),
      listInviteRelations: vi.fn().mockResolvedValue([]),
      runTransaction: vi.fn(async (callback) =>
        callback({
          getMemberById: vi.fn().mockResolvedValue(member)
        })
      )
    };

    await expect(
      settleFirstVisit(repository as never, {
        sessionToken: staffSessionToken,
        memberId: "member-unverified",
        externalOrderNo: "ORDER-UNVERIFIED",
        operatorChannel: "MINIPROGRAM"
      })
    ).rejects.toMatchObject({
      code: "MEMBER_PHONE_REQUIRED",
      message: "会员尚未完成微信手机号验证"
    });
  });

  it("returns an idempotent first-visit settlement when the same order was already used for the same member", async () => {
    const existingVisit = {
      _id: "visit-1",
      storeId: "default-store",
      memberId: "member-1",
      externalOrderNo: "ORDER-1001",
      verifiedByStaffId: "staff-1",
      operatorChannel: "MINIPROGRAM" as const,
      isFirstValidVisit: true,
      verifiedAt: "2026-04-03T10:00:00.000Z",
      createdAt: "2026-04-03T10:00:00.000Z",
      updatedAt: "2026-04-03T10:00:00.000Z"
    };
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
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getMemberById: vi.fn().mockResolvedValue({
        _id: "member-1",
        storeId: "default-store",
        memberCode: "M00000001",
        openId: "openid-member-1",
        phone: "13812345678",
        phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
        pointsBalance: 0,
        hasCompletedFirstVisit: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-03T10:00:00.000Z"
      }),
      getVisitByExternalOrderNo: vi.fn().mockResolvedValue(existingVisit),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue(null),
      listRewardRules: vi.fn().mockResolvedValue([]),
      listInviteRelations: vi.fn().mockResolvedValue([]),
      runTransaction: vi.fn()
    };

    const result = await settleFirstVisit(repository as never, {
      sessionToken: staffSessionToken,
      memberId: "member-1",
      externalOrderNo: "ORDER-1001",
      operatorChannel: "MINIPROGRAM"
    });

    expect(result).toMatchObject({
      ok: true,
      settlement: {
        isIdempotent: true,
        visitRecord: {
          _id: "visit-1"
        }
      }
    });
    expect(repository.runTransaction).not.toHaveBeenCalled();
  });

  it("treats repeated point exchange requests with the same requestId as idempotent", async () => {
    const repository = {
      storeId: "default-store",
      runTransaction: vi.fn(async (callback) =>
        callback({
          getMemberById: vi.fn().mockResolvedValue({
            _id: "member-1",
            storeId: "default-store",
            memberCode: "M00000001",
            openId: "openid-member-1",
            phone: "13812345678",
            phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
            pointsBalance: 18,
            hasCompletedFirstVisit: true,
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-03T10:00:00.000Z"
          }),
          getPointExchangeItemById: vi.fn().mockResolvedValue({
            _id: "exchange-1",
            storeId: "default-store",
            name: "精品肥牛",
            pointsCost: 18,
            isEnabled: true,
            sortOrder: 0,
            voucherTemplate: {
              dishId: "dish-fat-beef",
              dishName: "精品肥牛",
              validDays: 30
            },
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          }),
          getVoucherById: vi.fn().mockResolvedValue({
            _id: "voucher_redeem_req-1",
            storeId: "default-store",
            memberId: "member-1",
            source: "POINT_EXCHANGE",
            sourceRuleId: "exchange-1",
            dishId: "dish-fat-beef",
            dishName: "精品肥牛",
            status: "READY",
            expiresAt: "2026-05-02T08:00:00.000Z",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          }),
          getPointTransactionById: vi.fn().mockResolvedValue({
            _id: "points_redeem_req-1",
            storeId: "default-store",
            memberId: "member-1",
            type: "POINT_EXCHANGE",
            changeAmount: -18,
            balanceAfter: 0,
            sourceExchangeItemId: "exchange-1",
            sourceVoucherId: "voucher_redeem_req-1",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          })
        })
      ),
      addAuditLog: vi.fn()
    };

    const result = await redeemPoints(repository as never, "member-1", {
      exchangeItemId: "exchange-1",
      requestId: "req-1"
    });

    expect(result).toMatchObject({
      ok: true,
      isIdempotent: true,
      voucher: {
        _id: "voucher_redeem_req-1"
      },
      pointTransaction: {
        _id: "points_redeem_req-1"
      }
    });
    expect(repository.addAuditLog).not.toHaveBeenCalled();
  });

  it("rejects inconsistent point exchange state instead of deducting points twice", async () => {
    const repository = {
      storeId: "default-store",
      runTransaction: vi.fn(async (callback) =>
        callback({
          getMemberById: vi.fn().mockResolvedValue({
            _id: "member-1",
            storeId: "default-store",
            memberCode: "M00000001",
            openId: "openid-member-1",
            phone: "13812345678",
            phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
            pointsBalance: 18,
            hasCompletedFirstVisit: true,
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-03T10:00:00.000Z"
          }),
          getPointExchangeItemById: vi.fn().mockResolvedValue({
            _id: "exchange-1",
            storeId: "default-store",
            name: "精品肥牛",
            pointsCost: 18,
            isEnabled: true,
            sortOrder: 0,
            voucherTemplate: {
              dishId: "dish-fat-beef",
              dishName: "精品肥牛",
              validDays: 30
            },
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          }),
          getVoucherById: vi.fn().mockResolvedValue({
            _id: "voucher_redeem_req-2",
            storeId: "default-store",
            memberId: "member-1",
            source: "POINT_EXCHANGE",
            sourceRuleId: "exchange-1",
            dishId: "dish-fat-beef",
            dishName: "精品肥牛",
            status: "READY",
            expiresAt: "2026-05-02T08:00:00.000Z",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          }),
          getPointTransactionById: vi.fn().mockResolvedValue(null)
        })
      ),
      addAuditLog: vi.fn()
    };

    await expect(
      redeemPoints(repository as never, "member-1", {
        exchangeItemId: "exchange-1",
        requestId: "req-2"
      })
    ).rejects.toMatchObject({
      code: "POINT_EXCHANGE_INCONSISTENT",
      message: "检测到兑换记录异常，请联系老板处理"
    });

    expect(repository.addAuditLog).not.toHaveBeenCalled();
  });

  it("backfills a missing redemption record when a legacy voucher is already marked used", async () => {
    const legacyVoucher = {
      _id: "voucher-legacy",
      storeId: "default-store",
      memberId: "member-1",
      source: "POINT_EXCHANGE" as const,
      dishId: "dish-1",
      dishName: "招牌凉菜",
      status: "USED" as const,
      expiresAt: "2099-04-02T08:00:00.000Z",
      usedAt: "2026-04-03T12:00:00.000Z",
      usedByStaffId: "staff-legacy",
      createdAt: "2026-04-02T08:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z"
    };
    const saveVoucherRedemption = vi.fn().mockResolvedValue(undefined);
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
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getVoucherById: vi.fn().mockResolvedValue(legacyVoucher),
      runTransaction: vi.fn(async (callback) =>
        callback({
          getVoucherById: vi.fn().mockResolvedValue(legacyVoucher),
          getVoucherRedemptionById: vi.fn().mockResolvedValue(null),
          saveVoucherRedemption
        })
      ),
      addAuditLog: vi.fn()
    };

    const result = await redeemVoucher(repository as never, {
      sessionToken: staffSessionToken,
      voucherId: "voucher-legacy"
    });

    expect(result).toMatchObject({
      ok: true,
      isIdempotent: true,
      voucher: {
        _id: "voucher-legacy"
      }
    });
    expect(saveVoucherRedemption).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "redeem_voucher-legacy",
        voucherId: "voucher-legacy",
        redeemedByStaffId: "staff-legacy",
        redeemedAt: "2026-04-03T12:00:00.000Z"
      })
    );
    expect(repository.addAuditLog).not.toHaveBeenCalled();
  });
});

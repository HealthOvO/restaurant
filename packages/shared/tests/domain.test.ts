import { describe, expect, it } from "vitest";
import {
  assertMenuConfigValid,
  assertInviteAdjustmentAllowed,
  assertPointExchangeItemsValid,
  assertOrderSubmissionReady,
  assertRewardRulesConfigValid,
  assertInviteBindingAllowed,
  buildInviteOverview,
  DomainError,
  previewOrder,
  type InviteRelation,
  type MemberPointTransaction,
  type Member,
  type PointExchangeItem,
  type RewardRule,
  type MenuCategory,
  type MenuItem,
  settleVisitRewards
} from "../src";

const now = "2026-04-02T08:00:00.000Z";

function createMember(partial: Partial<Member>): Member {
  return {
    _id: partial._id ?? "member-1",
    storeId: "default-store",
    memberCode: partial.memberCode ?? "M00000001",
    openId: partial.openId ?? "openid-1",
    phone: partial.phone ?? "13812345678",
    phoneVerifiedAt: partial.phoneVerifiedAt ?? now,
    nickname: partial.nickname ?? "测试会员",
    pointsBalance: partial.pointsBalance ?? 0,
    hasCompletedFirstVisit: partial.hasCompletedFirstVisit ?? false,
    createdAt: now,
    updatedAt: now,
    ...partial
  };
}

function createRule(partial: Partial<RewardRule>): RewardRule {
  return {
    _id: partial._id ?? "rule-1",
    storeId: "default-store",
    name: partial.name ?? "默认规则",
    type: partial.type ?? "WELCOME",
    threshold: partial.threshold,
    isEnabled: partial.isEnabled ?? true,
    sortOrder: partial.sortOrder ?? 0,
    voucherTemplate:
      partial.type === "INVITE_MILESTONE"
        ? partial.voucherTemplate
        : partial.voucherTemplate ?? {
            dishId: "dish-1",
            dishName: "柠檬茶",
            validDays: 30
          },
    pointsReward: partial.type === "INVITE_MILESTONE" ? partial.pointsReward ?? 10 : undefined,
    rewardMode: partial.type === "INVITE_MILESTONE" ? partial.rewardMode ?? "ONCE" : partial.rewardMode,
    createdAt: now,
    updatedAt: now,
    ...partial
  };
}

function createPointTransaction(partial: Partial<MemberPointTransaction>): MemberPointTransaction {
  return {
    _id: partial._id ?? "points-1",
    storeId: "default-store",
    memberId: partial.memberId ?? "member-1",
    type: partial.type ?? "INVITE_REWARD",
    changeAmount: partial.changeAmount ?? 10,
    balanceAfter: partial.balanceAfter ?? 10,
    createdAt: now,
    updatedAt: now,
    ...partial
  };
}

describe("invite binding", () => {
  it("prevents duplicate relation", () => {
    const relation: InviteRelation = {
      _id: "rel-1",
      storeId: "default-store",
      inviterMemberId: "member-2",
      inviteeMemberId: "member-1",
      status: "PENDING",
      createdAt: now,
      updatedAt: now
    };

    expect(() =>
      assertInviteBindingAllowed({
        inviterMemberId: "member-2",
        inviteeMemberId: "member-1",
        inviteeHasCompletedFirstVisit: false,
        existingRelation: relation
      })
    ).toThrowError(DomainError);
  });

  it("prevents manual adjustment from binding a member to themselves", () => {
    expect(() =>
      assertInviteAdjustmentAllowed({
        inviterMemberId: "member-1",
        inviteeMemberId: "member-1"
      })
    ).toThrowError(DomainError);
  });
});

describe("reward rule validation", () => {
  it("rejects enabling more than one welcome rule", () => {
    expect(() =>
      assertRewardRulesConfigValid([
        createRule({ _id: "welcome-1", type: "WELCOME", name: "首单礼一" }),
        createRule({ _id: "welcome-2", type: "WELCOME", name: "首单礼二", sortOrder: 1 })
      ])
    ).toThrowError(DomainError);
  });

  it("rejects invalid point exchange items", () => {
    const items: PointExchangeItem[] = [
      {
        _id: "exchange-1",
        storeId: "default-store",
        name: "   ",
        pointsCost: 0,
        isEnabled: true,
        sortOrder: 0,
        voucherTemplate: {
          dishId: "",
          dishName: "",
          validDays: 30
        },
        createdAt: now,
        updatedAt: now
      }
    ];

    expect(() => assertPointExchangeItemsValid(items)).toThrowError(DomainError);
  });

  it("rejects single-select menu groups with multiple default choices", () => {
    const categories: MenuCategory[] = [
      {
        _id: "category-1",
        storeId: "default-store",
        name: "招牌热菜",
        sortOrder: 0,
        isEnabled: true,
        createdAt: now,
        updatedAt: now
      }
    ];
    const items: MenuItem[] = [
      {
        _id: "item-1",
        storeId: "default-store",
        categoryId: "category-1",
        name: "精品肥牛",
        price: 32,
        isEnabled: true,
        isRecommended: false,
        isSoldOut: false,
        sortOrder: 0,
        optionGroups: [
          {
            _id: "group-1",
            name: "辣度",
            required: true,
            multiSelect: false,
            maxSelect: 1,
            choices: [
              { _id: "choice-1", name: "微辣", priceDelta: 0, isEnabled: true, isDefault: true },
              { _id: "choice-2", name: "中辣", priceDelta: 0, isEnabled: true, isDefault: true }
            ]
          }
        ],
        createdAt: now,
        updatedAt: now
      }
    ];

    expect(() => assertMenuConfigValid(categories, items)).toThrowError(DomainError);
  });
});

describe("visit settlement", () => {
  it("creates welcome voucher and invite point awards on first activated visit", () => {
    const member = createMember({ _id: "invitee-1" });
    const relation: InviteRelation = {
      _id: "rel-1",
      storeId: "default-store",
      inviterMemberId: "inviter-1",
      inviteeMemberId: "invitee-1",
      status: "PENDING",
      createdAt: now,
      updatedAt: now
    };

    const result = settleVisitRewards({
      member,
      inviteRelation: relation,
      inviterActivatedCountBeforeVisit: 2,
      inviterRewardCountsByRuleId: {},
      rewardRules: [
        createRule({ _id: "welcome-1", type: "WELCOME", name: "首单礼" }),
        createRule({
          _id: "milestone-3",
          type: "INVITE_MILESTONE",
          threshold: 3,
          sortOrder: 1,
          name: "邀请3人送积分",
          pointsReward: 30
        })
      ],
      externalOrderNo: "order-1",
      verifiedByStaffId: "staff-1",
      operatorChannel: "MINIPROGRAM",
      now,
      createId: (() => {
        let index = 0;
        return () => `id-${++index}`;
      })(),
      storeId: "default-store"
    });

    expect(result.markMemberFirstVisit).toBe(true);
    expect(result.activateInviteRelation).toBe(true);
    expect(result.welcomeVoucher?.dishName).toBe("柠檬茶");
    expect(result.milestonePointAwards).toHaveLength(1);
    expect(result.milestonePointAwards[0]).toMatchObject({
      ruleId: "milestone-3",
      pointsReward: 30
    });
    expect(result.activatedInviteCountAfterVisit).toBe(3);
  });

  it("is idempotent for repeated order settlement", () => {
    const visitId = "visit-existing";
    const result = settleVisitRewards({
      member: createMember({ _id: "member-2", hasCompletedFirstVisit: true }),
      existingVisit: {
        _id: visitId,
        storeId: "default-store",
        memberId: "member-2",
        externalOrderNo: "order-2",
        verifiedByStaffId: "staff-1",
        operatorChannel: "WEB",
        isFirstValidVisit: false,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now
      },
      rewardRules: [],
      inviterActivatedCountBeforeVisit: 0,
      inviterRewardCountsByRuleId: {},
      externalOrderNo: "order-2",
      verifiedByStaffId: "staff-1",
      operatorChannel: "WEB",
      now,
      createId: () => "unused",
      storeId: "default-store"
    });

    expect(result.isIdempotent).toBe(true);
    expect(result.visitRecord._id).toBe(visitId);
    expect(result.milestonePointAwards).toHaveLength(0);
  });

  it("requires a verified phone before settling first visit", () => {
    expect(() =>
      settleVisitRewards({
        member: createMember({
          _id: "member-unverified",
          phoneVerifiedAt: undefined
        }),
        rewardRules: [],
        inviterActivatedCountBeforeVisit: 0,
        inviterRewardCountsByRuleId: {},
        externalOrderNo: "order-unverified",
        verifiedByStaffId: "staff-1",
        operatorChannel: "WEB",
        now,
        createId: () => "unused",
        storeId: "default-store"
        })
    ).toThrowError(DomainError);
  });

  it("issues repeatable milestone point awards when the next cycle is reached", () => {
    const member = createMember({ _id: "invitee-repeat" });
    const relation: InviteRelation = {
      _id: "rel-repeat",
      storeId: "default-store",
      inviterMemberId: "inviter-repeat",
      inviteeMemberId: "invitee-repeat",
      status: "PENDING",
      createdAt: now,
      updatedAt: now
    };

    const result = settleVisitRewards({
      member,
      inviteRelation: relation,
      inviterActivatedCountBeforeVisit: 5,
      inviterRewardCountsByRuleId: {
        "repeat-3": 1
      },
      rewardRules: [
        createRule({
          _id: "repeat-3",
          type: "INVITE_MILESTONE",
          threshold: 3,
          rewardMode: "REPEATABLE",
          sortOrder: 1,
          name: "每满3人送积分",
          pointsReward: 18
        })
      ],
      externalOrderNo: "order-repeat",
      verifiedByStaffId: "staff-1",
      operatorChannel: "MINIPROGRAM",
      now,
      createId: (() => {
        let index = 0;
        return () => `repeat-id-${++index}`;
      })(),
      storeId: "default-store"
    });

    expect(result.activatedInviteCountAfterVisit).toBe(6);
    expect(result.milestonePointAwards).toHaveLength(1);
    expect(result.milestonePointAwards[0]?.pointsReward).toBe(18);
  });

  it("does not reissue a once-only milestone after it was already rewarded", () => {
    const member = createMember({ _id: "invitee-once" });
    const relation: InviteRelation = {
      _id: "rel-once",
      storeId: "default-store",
      inviterMemberId: "inviter-once",
      inviteeMemberId: "invitee-once",
      status: "PENDING",
      createdAt: now,
      updatedAt: now
    };

    const result = settleVisitRewards({
      member,
      inviteRelation: relation,
      inviterActivatedCountBeforeVisit: 1,
      inviterRewardCountsByRuleId: {
        "once-1": 1
      },
      rewardRules: [
        createRule({
          _id: "once-1",
          type: "INVITE_MILESTONE",
          threshold: 1,
          rewardMode: "ONCE",
          sortOrder: 1,
          name: "邀请1人返饮品"
        })
      ],
      externalOrderNo: "order-once",
      verifiedByStaffId: "staff-1",
      operatorChannel: "WEB",
      now,
      createId: () => "unused-once",
      storeId: "default-store"
    });

    expect(result.activatedInviteCountAfterVisit).toBe(2);
    expect(result.milestonePointAwards).toHaveLength(0);
  });
});

describe("order submission", () => {
  it("requires a table number for dine-in submission", () => {
    expect(() =>
      assertOrderSubmissionReady({
        fulfillmentMode: "DINE_IN",
        tableNo: "   "
      })
    ).toThrowError(DomainError);
  });

  it("requires a contact name for pickup submission", () => {
    expect(() =>
      assertOrderSubmissionReady({
        fulfillmentMode: "PICKUP",
        contactName: ""
      })
    ).toThrowError(DomainError);
  });

  it("accepts valid dine-in and pickup submission info", () => {
    expect(() =>
      assertOrderSubmissionReady({
        fulfillmentMode: "DINE_IN",
        tableNo: "A08"
      })
    ).not.toThrow();

    expect(() =>
      assertOrderSubmissionReady({
        fulfillmentMode: "PICKUP",
        contactName: "张三"
      })
    ).not.toThrow();
  });

  it("deduplicates repeated option selections so the same extra price is not charged twice", () => {
    const preview = previewOrder({
      fulfillmentMode: "DINE_IN",
      menuItems: [
        {
          _id: "dish-1",
          storeId: "default-store",
          categoryId: "category-1",
          name: "招牌炒饭",
          price: 18,
          isEnabled: true,
          isRecommended: false,
          isSoldOut: false,
          sortOrder: 0,
          optionGroups: [
            {
              _id: "addon",
              name: "加料",
              required: false,
              multiSelect: true,
              maxSelect: 3,
              choices: [{ _id: "egg", name: "加蛋", priceDelta: 2, isEnabled: true }]
            }
          ],
          createdAt: now,
          updatedAt: now
        }
      ],
      storeConfig: {
        dineInEnabled: true,
        pickupEnabled: true,
        minOrderAmount: 0
      },
      items: [
        {
          menuItemId: "dish-1",
          quantity: 1,
          selectedOptions: [
            { groupId: "addon", choiceId: "egg" },
            { groupId: "addon", choiceId: "egg" }
          ]
        }
      ]
    });

    expect(preview.lineItems[0]).toMatchObject({
      unitPrice: 20,
      lineTotal: 20,
      selectedOptions: [{ groupId: "addon", choiceId: "egg" }]
    });
  });
});

describe("invite overview", () => {
  it("summarizes activated and rewarded milestones", () => {
    const overview = buildInviteOverview({
      inviterMemberId: "inviter-1",
      relations: [
        {
          _id: "rel-1",
          storeId: "default-store",
          inviterMemberId: "inviter-1",
          inviteeMemberId: "invitee-1",
          status: "ACTIVATED",
          createdAt: now,
          updatedAt: now
        },
        {
          _id: "rel-2",
          storeId: "default-store",
          inviterMemberId: "inviter-1",
          inviteeMemberId: "invitee-2",
          status: "PENDING",
          createdAt: now,
          updatedAt: now
        }
      ],
      rules: [
        createRule({
          _id: "milestone-1",
          type: "INVITE_MILESTONE",
          threshold: 1,
          rewardMode: "ONCE",
          sortOrder: 1,
          name: "邀请1人送积分",
          pointsReward: 12
        })
      ],
      pointTransactions: [
        createPointTransaction({
          _id: "points-1",
          memberId: "inviter-1",
          type: "INVITE_REWARD",
          sourceRuleId: "milestone-1",
          changeAmount: 12,
          balanceAfter: 12
        })
      ]
    });

    expect(overview.activatedCount).toBe(1);
    expect(overview.pendingCount).toBe(1);
    expect(overview.milestones[0]?.isRewarded).toBe(true);
    expect(overview.milestones[0]?.rewardedCount).toBe(1);
    expect(overview.milestones[0]?.pointsReward).toBe(12);
  });

  it("shows repeatable milestone progress and next target", () => {
    const overview = buildInviteOverview({
      inviterMemberId: "inviter-repeat",
      relations: [
        {
          _id: "rel-1",
          storeId: "default-store",
          inviterMemberId: "inviter-repeat",
          inviteeMemberId: "invitee-1",
          status: "ACTIVATED",
          createdAt: now,
          updatedAt: now
        },
        {
          _id: "rel-2",
          storeId: "default-store",
          inviterMemberId: "inviter-repeat",
          inviteeMemberId: "invitee-2",
          status: "ACTIVATED",
          createdAt: now,
          updatedAt: now
        },
        {
          _id: "rel-3",
          storeId: "default-store",
          inviterMemberId: "inviter-repeat",
          inviteeMemberId: "invitee-3",
          status: "ACTIVATED",
          createdAt: now,
          updatedAt: now
        },
        {
          _id: "rel-4",
          storeId: "default-store",
          inviterMemberId: "inviter-repeat",
          inviteeMemberId: "invitee-4",
          status: "ACTIVATED",
          createdAt: now,
          updatedAt: now
        }
      ],
      rules: [
        createRule({
          _id: "repeat-2",
          type: "INVITE_MILESTONE",
          threshold: 2,
          rewardMode: "REPEATABLE",
          sortOrder: 1,
          name: "每满2人送积分",
          pointsReward: 8
        })
      ],
      pointTransactions: [
        createPointTransaction({
          _id: "points-repeat-1",
          memberId: "inviter-repeat",
          type: "INVITE_REWARD",
          sourceRuleId: "repeat-2",
          changeAmount: 8,
          balanceAfter: 8
        }),
        createPointTransaction({
          _id: "points-repeat-2",
          memberId: "inviter-repeat",
          type: "INVITE_REWARD",
          sourceRuleId: "repeat-2",
          changeAmount: 8,
          balanceAfter: 16
        })
      ]
    });

    expect(overview.milestones[0]).toMatchObject({
      rewardMode: "REPEATABLE",
      pointsReward: 8,
      rewardedCount: 2,
      pendingRewardCount: 0,
      nextRewardThreshold: 6
    });
  });

  it("uses net invite reward transactions when compensation has already been applied", () => {
    const overview = buildInviteOverview({
      inviterMemberId: "inviter-net",
      relations: [
        {
          _id: "rel-net",
          storeId: "default-store",
          inviterMemberId: "inviter-net",
          inviteeMemberId: "invitee-net",
          status: "ACTIVATED",
          createdAt: now,
          updatedAt: now
        }
      ],
      rules: [
        createRule({
          _id: "rule-net",
          type: "INVITE_MILESTONE",
          threshold: 1,
          rewardMode: "ONCE",
          sortOrder: 1,
          name: "邀请 1 人送积分",
          pointsReward: 10
        })
      ],
      pointTransactions: [
        createPointTransaction({
          _id: "points-net-1",
          memberId: "inviter-net",
          type: "INVITE_REWARD",
          sourceRuleId: "rule-net",
          changeAmount: 10,
          balanceAfter: 10
        }),
        createPointTransaction({
          _id: "points-net-2",
          memberId: "inviter-net",
          type: "INVITE_REWARD",
          sourceRuleId: "rule-net",
          changeAmount: -10,
          balanceAfter: 0
        })
      ]
    });

    expect(overview.milestones[0]).toMatchObject({
      rewardedCount: 0,
      pendingRewardCount: 1,
      isRewarded: false
    });
  });

  it("treats adjusted relations with activatedAt as already activated", () => {
    const overview = buildInviteOverview({
      inviterMemberId: "inviter-adjusted",
      relations: [
        {
          _id: "rel-adjusted",
          storeId: "default-store",
          inviterMemberId: "inviter-adjusted",
          inviteeMemberId: "invitee-adjusted",
          status: "ADJUSTED",
          activatedAt: now,
          createdAt: now,
          updatedAt: now
        }
      ],
      rules: [],
      pointTransactions: []
    });

    expect(overview.activatedCount).toBe(1);
    expect(overview.pendingCount).toBe(0);
  });
});

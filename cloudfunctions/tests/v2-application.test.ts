import { beforeEach, describe, expect, it } from "vitest";
import type { V2ExchangeItem, V2Member, V2OwnerAccount, V2Product, V2StoreConfig } from "@restaurant/shared";
import { V2Application, type V2Clock } from "../src/v2/application";
import { loginV2Owner, hashV2OwnerPassword, requireV2Owner } from "../src/v2/owner-auth";
import { MockV2PaymentProvider } from "../src/v2/payment";
import { InMemoryV2Repository, withoutV2DocumentId } from "../src/v2/repository";
import { initializeV2Store, resetV2Owner } from "../src/v2/setup";

const nowIso = "2026-08-09T10:00:00.000Z";
const clock: V2Clock = { now: () => new Date(nowIso) };

const storeConfig: V2StoreConfig = {
  _id: "store-main:config",
  storeId: "store-main",
  storeName: "雄飞肉片",
  announcement: "现点现煮",
  businessOpen: true,
  dayBoundaryTime: "04:00",
  createdAt: nowIso,
  updatedAt: nowIso
};

const product: V2Product = {
  _id: "product-fuding",
  storeId: "store-main",
  name: "福鼎肉片",
  description: "每日现打",
  basePrice: 1500,
  enabled: true,
  soldOut: false,
  sortOrder: 1,
  pointsEnabled: true,
  buyerPointsPerUnit: 10,
  inviterPointsPerUnit: 1,
  version: 1,
  specGroups: [
    {
      id: "spice",
      name: "辣度",
      mode: "SINGLE",
      required: true,
      choices: [
        { id: "none", name: "不辣", priceDelta: 0, enabled: true },
        { id: "mild", name: "微辣", priceDelta: 0, enabled: true, isDefault: true }
      ]
    },
    {
      id: "extras",
      name: "小料",
      mode: "MULTIPLE",
      required: false,
      maxSelect: 2,
      choices: [
        { id: "coriander", name: "香菜", priceDelta: 0, enabled: true },
        { id: "meat", name: "加肉", priceDelta: 300, enabled: true }
      ]
    }
  ],
  createdAt: nowIso,
  updatedAt: nowIso
};

const exchangeItem: V2ExchangeItem = {
  _id: "exchange-fuding",
  storeId: "store-main",
  name: "福鼎肉片兑换券",
  productId: product._id,
  productName: product.name,
  pointsCost: 50,
  validDays: 30,
  enabled: true,
  sortOrder: 1,
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso
};

function member(id: string, openId: string, code: string, pointsBalance = 0): V2Member {
  return {
    _id: id,
    storeId: "store-main",
    openId,
    memberCode: `M-${code}`,
    inviteCode: code,
    pointsBalance,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function setup(points = 0) {
  const inviter = member("member-inviter", "openid-inviter", "INVITER", 0);
  const buyer = { ...member("member-buyer", "openid-buyer", "BUYER001", points), inviterMemberId: inviter._id };
  const repository = new InMemoryV2Repository("store-main", {
    storeConfig: [storeConfig],
    products: [product],
    exchangeItems: [exchangeItem],
    members: [inviter, buyer],
    inviteRelations: [{
      _id: buyer._id,
      storeId: "store-main",
      inviterMemberId: inviter._id,
      inviteeMemberId: buyer._id,
      boundAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    }]
  });
  const payments = new MockV2PaymentProvider();
  const application = new V2Application(repository, payments, clock);
  return { repository, payments, application, inviter, buyer };
}

describe("V2 payment settlement", () => {
  it("allows only the owning member to complete a mock payment", async () => {
    const { application, repository, buyer } = setup();
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-mock-pay",
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await expect(application.mockPay("another-openid", created.order._id)).rejects.toThrow("订单不存在");
    const paid = await application.mockPay(buyer.openId, created.order._id);
    expect(paid.status).toBe("WAITING_FULFILLMENT");
    expect(paid.pickupNumber).toBe("001");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(10);
  });

  it("settles pickup number and both integer point ledgers only once", async () => {
    const { application, repository, buyer, inviter } = setup();
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-001",
      lineItems: [{
        productId: product._id,
        quantity: 3,
        selections: [
          { groupId: "spice", choiceIds: ["mild"] },
          { groupId: "extras", choiceIds: [] }
        ]
      }]
    });

    const [first, second] = await Promise.all([
      application.confirmPaidOrder(created.order._id, "MOCK", "wx-001"),
      application.confirmPaidOrder(created.order._id, "CALLBACK", "wx-001")
    ]);

    expect(first.pickupNumber).toBe("001");
    expect(second.pickupNumber).toBe("001");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(30);
    expect((await repository.getMemberById(inviter._id))?.pointsBalance).toBe(3);
    expect((await repository.listPointLedgerByMember(buyer._id))).toHaveLength(1);
    expect((await repository.listPointLedgerByMember(inviter._id))).toHaveLength(1);
  });

  it("rolls back both balances once and allows negative points", async () => {
    const { application, repository, buyer, inviter } = setup(-25);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-refund",
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await application.confirmPaidOrder(created.order._id, "MOCK");
    const [first, second] = await Promise.all([
      application.refundOrder(created.order._id),
      application.refundOrder(created.order._id)
    ]);

    expect(first.status).toBe("REFUNDED");
    expect(second.status).toBe("REFUNDED");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(-25);
    expect((await repository.getMemberById(inviter._id))?.pointsBalance).toBe(0);
    expect((await repository.listPointLedgerByMember(buyer._id))).toHaveLength(2);
  });
});

describe("V2 coupons", () => {
  it("does not exchange points for an unavailable product", async () => {
    const { application, repository, buyer } = setup(100);
    await repository.saveProduct({ ...product, enabled: false });
    await expect(application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-disabled-product",
      exchangeItemId: exchangeItem._id
    })).rejects.toThrow("指定商品暂时不可兑换");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(100);
  });

  it("exchanges once, creates one free order and restores coupon on cancellation", async () => {
    const { application, repository, buyer } = setup(100);
    const [coupon1, coupon2] = await Promise.all([
      application.exchangeCoupon(buyer.openId, { requestId: "coupon-request-001", exchangeItemId: exchangeItem._id }),
      application.exchangeCoupon(buyer.openId, { requestId: "coupon-request-001", exchangeItemId: exchangeItem._id })
    ]);
    expect(coupon1._id).toBe(coupon2._id);
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(50);

    const [order1, order2] = await Promise.all([
      application.useCoupon(buyer.openId, {
        requestId: "use-coupon-001",
        couponId: coupon1._id,
        selections: [
          { groupId: "spice", choiceIds: ["mild"] },
          { groupId: "extras", choiceIds: ["coriander"] }
        ]
      }),
      application.useCoupon(buyer.openId, {
        requestId: "use-coupon-001",
        couponId: coupon1._id,
        selections: [
          { groupId: "spice", choiceIds: ["mild"] },
          { groupId: "extras", choiceIds: ["coriander"] }
        ]
      })
    ]);
    expect(order1._id).toBe(order2._id);
    expect(order1.source).toBe("COUPON");
    expect(order1.payableAmount).toBe(0);
    expect(order1.pickupNumber).toBe("001");
    expect((await repository.getCoupon(coupon1._id))?.status).toBe("USED");

    await application.cancelCouponOrder(order1._id);
    expect((await repository.getCoupon(coupon1._id))?.status).toBe("AVAILABLE");

    const reused = await application.useCoupon(buyer.openId, {
      requestId: "use-coupon-002",
      couponId: coupon1._id,
      selections: [
        { groupId: "spice", choiceIds: ["none"] },
        { groupId: "extras", choiceIds: [] }
      ]
    });
    expect(reused._id).not.toBe(order1._id);
    expect(reused.status).toBe("WAITING_FULFILLMENT");
    expect(reused.pickupNumber).toBe("002");
    expect((await repository.getCoupon(coupon1._id))?.status).toBe("USED");
  });
});

describe("V2 invite graph", () => {
  it("serializes mutual binding and prevents a cycle", async () => {
    const alice = member("alice", "openid-alice", "ALICE001");
    const bob = member("bob", "openid-bob", "BOB00001");
    const repository = new InMemoryV2Repository("store-main", {
      storeConfig: [storeConfig], products: [product], members: [alice, bob]
    });
    const application = new V2Application(repository, new MockV2PaymentProvider(), clock);

    const results = await Promise.allSettled([
      application.bindInvite(alice.openId, { inviteCode: bob.inviteCode }),
      application.bindInvite(bob.openId, { inviteCode: alice.inviteCode })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});

describe("V2 owner session", () => {
  beforeEach(() => { process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters"; });

  it("logs in the only owner and invalidates sessions by version", async () => {
    const owner: V2OwnerAccount = {
      _id: "owner-main",
      storeId: "store-main",
      username: "owner",
      displayName: "老板",
      passwordHash: await hashV2OwnerPassword("strong-password"),
      enabled: true,
      sessionVersion: 1,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const repository = new InMemoryV2Repository("store-main", { ownerAccounts: [owner] });
    const session = await loginV2Owner(repository, { username: "owner", password: "strong-password" }, new Date(nowIso));
    expect((await requireV2Owner(repository, session.token))._id).toBe(owner._id);
    await repository.saveOwner({ ...owner, sessionVersion: 2 });
    await expect(requireV2Owner(repository, session.token)).rejects.toThrow("登录已失效");
  });
});

describe("V2 store setup", () => {
  beforeEach(() => { process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters"; });

  it("initializes one closed store and resets the owner with session invalidation", async () => {
    const repository = new InMemoryV2Repository("store-main");
    const result = await initializeV2Store(repository, {
      storeName: "雄飞肉片",
      username: "owner",
      password: "strong-password",
      displayName: "雄飞老板"
    }, new Date(nowIso));
    expect(result.store.businessOpen).toBe(false);
    expect(result.product.buyerPointsPerUnit).toBe(10);
    expect(result.exchange.pointsCost).toBe(100);
    await expect(initializeV2Store(repository, {
      storeName: "重复摊位", username: "other", password: "another-password"
    })).rejects.toThrow("不能重复执行");

    const session = await loginV2Owner(repository, { username: "owner", password: "strong-password" }, new Date(nowIso));
    await resetV2Owner(repository, { username: "new-owner", password: "new-strong-password", displayName: "新老板" }, new Date(nowIso));
    await expect(requireV2Owner(repository, session.token)).rejects.toThrow("登录已失效");
    await expect(loginV2Owner(repository, { username: "new-owner", password: "new-strong-password" }, new Date(nowIso))).resolves.toBeTruthy();
  });
});

describe("V2 CloudBase document writes", () => {
  it("uses the document path as the id and never writes _id into document data", () => {
    expect(withoutV2DocumentId({ _id: "member-1", storeId: "store-main", pointsBalance: 10 })).toEqual({
      storeId: "store-main",
      pointsBalance: 10
    });
  });
});

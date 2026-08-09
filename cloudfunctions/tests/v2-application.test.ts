import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRounds } from "bcryptjs";
import type { V2ExchangeItem, V2Member, V2Order, V2OwnerAccount, V2Product, V2StoreConfig } from "@restaurant/shared";
import { V2Application, type V2Clock } from "../src/v2/application";
import { loginV2Owner, hashV2OwnerPassword, requireV2Owner } from "../src/v2/owner-auth";
import { MockV2PaymentProvider, type V2PaymentProvider } from "../src/v2/payment";
import { InMemoryV2Repository, v2DocumentSetOptions, withoutV2DocumentId } from "../src/v2/repository";
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
  name: "雄飞肉片",
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
  name: "雄飞肉片兑换券",
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

function setup(points = 0, payments: V2PaymentProvider = new MockV2PaymentProvider()) {
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
  const application = new V2Application(repository, payments, clock);
  return { repository, payments, application, inviter, buyer };
}

describe("V2 customer menu", () => {
  it("creates a default category for legacy products and lets the owner configure new categories", async () => {
    const { application, buyer } = setup();
    const legacyHome = await application.home(buyer.openId);
    expect(legacyHome.categories).toHaveLength(1);
    expect(legacyHome.products[0].categoryId).toBe(legacyHome.categories[0]._id);

    const drinks = await application.saveCategory({ name: "饮品", enabled: true, sortOrder: 20 });
    const saved = await application.saveProduct({
      name: "冰豆浆",
      categoryId: drinks._id,
      description: "",
      imageUrl: "",
      basePrice: 500,
      enabled: true,
      soldOut: false,
      sortOrder: 20,
      pointsEnabled: false,
      buyerPointsPerUnit: 0,
      inviterPointsPerUnit: 0,
      specGroups: []
    });
    expect(saved.categoryId).toBe(drinks._id);
    expect((await application.home(buyer.openId)).categories.map((category) => category.name)).toEqual(["招牌肉片", "饮品"]);
  });

  it("keeps an enabled sold-out product visible while preventing purchase and exchange", async () => {
    const { application, repository, buyer } = setup(100);
    await repository.saveProduct({ ...product, soldOut: true, version: 2 });

    const home = await application.home(buyer.openId);

    expect(home.products).toHaveLength(1);
    expect(home.products[0]).toMatchObject({ _id: product._id, soldOut: true, enabled: true });
    expect(home.exchangeItems).toHaveLength(0);
    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "sold-out-order",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    })).rejects.toThrow("当前不可购买");
  });

  it("continues hiding disabled products from the customer menu", async () => {
    const { application, repository, buyer } = setup();
    await repository.saveProduct({ ...product, enabled: false, version: 2 });
    expect((await application.home(buyer.openId)).products).toHaveLength(0);
  });
});

describe("V2 payment settlement", () => {
  it("rejects checkout when the confirmed amount or points are stale", async () => {
    const { application, repository, buyer } = setup();
    await repository.saveProduct({ ...product, basePrice: 1600, buyerPointsPerUnit: 12, version: 2 });
    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-stale-quote",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    })).rejects.toThrow("商品价格或积分已更新");
    expect(repository.snapshot().orders.size).toBe(0);
  });

  it("allows only the owning member to complete a mock payment", async () => {
    const { application, repository, buyer } = setup();
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-mock-pay",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
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
      expectedPayableAmount: 4500,
      expectedBuyerPoints: 30,
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

  it("keeps order numbers and pickup numbers unique under concurrent settlement", async () => {
    const { application, buyer } = setup();
    const payload = {
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    };
    const [firstCreated, secondCreated] = await Promise.all([
      application.createPaymentOrder(buyer.openId, { ...payload, requestId: "order-request-concurrent-a" }),
      application.createPaymentOrder(buyer.openId, { ...payload, requestId: "order-request-concurrent-b" })
    ]);
    const [firstPaid, secondPaid] = await Promise.all([
      application.confirmPaidOrder(firstCreated.order._id, "CALLBACK", "wx-concurrent-a"),
      application.confirmPaidOrder(secondCreated.order._id, "CALLBACK", "wx-concurrent-b")
    ]);

    expect(new Set([firstCreated.order._id, secondCreated.order._id]).size).toBe(2);
    expect(new Set([firstCreated.order.orderNo, secondCreated.order.orderNo]).size).toBe(2);
    expect(new Set([firstPaid.pickupNumber, secondPaid.pickupNumber])).toEqual(new Set(["001", "002"]));
  });

  it("lists waiting orders oldest first and history newest first", async () => {
    const { application, repository, buyer } = setup();
    const payload = {
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    };
    const first = await application.createPaymentOrder(buyer.openId, { ...payload, requestId: "order-sort-first" });
    const second = await application.createPaymentOrder(buyer.openId, { ...payload, requestId: "order-sort-second" });
    await application.confirmPaidOrder(first.order._id, "MOCK", "sort-first");
    await application.confirmPaidOrder(second.order._id, "MOCK", "sort-second");
    await repository.runTransaction(async (tx) => {
      const firstOrder = await tx.getOrder(first.order._id);
      const secondOrder = await tx.getOrder(second.order._id);
      if (!firstOrder || !secondOrder) throw new Error("missing order");
      await tx.saveOrder({ ...firstOrder, createdAt: "2026-08-09T09:00:00.000Z" });
      await tx.saveOrder({ ...secondOrder, createdAt: "2026-08-09T09:05:00.000Z" });
    });

    expect((await application.ownerOrders("WAITING_FULFILLMENT")).map((order) => order._id)).toEqual([first.order._id, second.order._id]);
    expect((await application.ownerOrders()).map((order) => order._id)).toEqual([second.order._id, first.order._id]);
  });

  it("returns the same order when the same checkout request is retried", async () => {
    const { application, repository, buyer } = setup();
    const payload = {
      requestId: "order-request-idempotent",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    };
    const [first, retry] = await Promise.all([
      application.createPaymentOrder(buyer.openId, payload),
      application.createPaymentOrder(buyer.openId, payload)
    ]);

    expect(retry.order._id).toBe(first.order._id);
    expect(repository.snapshot().orders.size).toBe(1);
    expect(repository.snapshot().payments.size).toBe(1);
  });

  it("rolls back both balances once and allows negative points", async () => {
    const { application, repository, buyer, inviter } = setup(-25);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-refund",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
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
    expect((await repository.getPayment(created.order._id))?.status).toBe("REFUND");
  });

  it("moves a NOTPAY reconciliation forward instead of querying the same batch forever", async () => {
    const { application, repository, buyer } = setup();
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-reconcile",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await repository.runTransaction(async (tx) => {
      const payment = await tx.getPayment(created.order._id);
      if (!payment) throw new Error("missing payment");
      await tx.savePayment({ ...payment, nextQueryAt: "2026-08-09T09:59:00.000Z" });
    });

    await application.reconcilePayments();
    const payment = await repository.getPayment(created.order._id);
    expect(payment?.status).toBe("NOTPAY");
    expect(payment?.queryCount).toBe(1);
    expect(payment?.nextQueryAt).toBe("2026-08-09T10:00:30.000Z");
  });

  it("closes the local order when reconciliation observes CLOSED", async () => {
    const payments = new MockV2PaymentProvider();
    const { application, repository, buyer } = setup(0, payments);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-closed",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await payments.close(created.order.orderNo);
    await repository.runTransaction(async (tx) => {
      const payment = await tx.getPayment(created.order._id);
      if (!payment) throw new Error("missing payment");
      await tx.savePayment({ ...payment, nextQueryAt: "2026-08-09T09:59:00.000Z" });
    });

    await application.reconcilePayments();
    expect((await repository.getOrder(created.order._id))?.status).toBe("CANCELLED");
    expect((await repository.getPayment(created.order._id))?.status).toBe("CLOSED");
  });

  it("continues reconciling later payments after one query fails", async () => {
    class PartialFailureProvider extends MockV2PaymentProvider {
      failingOutTradeNo = "";
      override async query(outTradeNo: string) {
        if (outTradeNo === this.failingOutTradeNo) throw new Error("temporary query failure");
        return super.query(outTradeNo);
      }
    }
    const payments = new PartialFailureProvider();
    const { application, repository, buyer } = setup(0, payments);
    const first = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-query-failure",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    const second = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-query-success",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["mild"] }] }]
    });
    payments.failingOutTradeNo = first.order.orderNo;
    payments.markMockPaid(second.order.orderNo);
    for (const order of [first.order, second.order]) {
      await repository.runTransaction(async (tx) => {
        const payment = await tx.getPayment(order._id);
        if (!payment) throw new Error("missing payment");
        await tx.savePayment({ ...payment, nextQueryAt: "2026-08-09T09:59:00.000Z" });
      });
    }
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await application.reconcilePayments();
    } finally {
      errorLog.mockRestore();
    }
    expect((await repository.getPayment(first.order._id))?.queryCount).toBe(1);
    expect((await repository.getOrder(second.order._id))?.status).toBe("WAITING_FULFILLMENT");
  });

  it("allows a CLOSED refund to be retried with a new refund number", async () => {
    class ClosedThenSuccessProvider extends MockV2PaymentProvider {
      readonly refundNumbers: string[] = [];
      override async refund(_order: V2Order, outRefundNo: string) {
        this.refundNumbers.push(outRefundNo);
        return this.refundNumbers.length === 1
          ? { status: "CLOSED" as const, refundId: "closed-refund" }
          : { status: "SUCCESS" as const, refundId: "successful-refund" };
      }
    }
    const payments = new ClosedThenSuccessProvider();
    const { application, repository, buyer } = setup(0, payments);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-refund-retry",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await application.confirmPaidOrder(created.order._id, "MOCK");

    const closed = await application.refundOrder(created.order._id);
    expect(closed.status).toBe("REFUNDING");
    expect(closed.refundStatus).toBe("CLOSED");
    const refunded = await application.refundOrder(created.order._id);
    expect(refunded.status).toBe("REFUNDED");
    expect(payments.refundNumbers).toHaveLength(2);
    expect(payments.refundNumbers[0]).not.toBe(payments.refundNumbers[1]);
    expect((await repository.listPointLedgerByMember(buyer._id))).toHaveLength(2);
  });

  it("does not let an old CLOSED refund overwrite the active retry status", async () => {
    class ClosedThenProcessingProvider extends MockV2PaymentProvider {
      readonly refundNumbers: string[] = [];
      override async refund(_order: V2Order, outRefundNo: string) {
        this.refundNumbers.push(outRefundNo);
        return this.refundNumbers.length === 1
          ? { status: "CLOSED" as const, refundId: "closed-refund" }
          : { status: "PROCESSING" as const, refundId: "processing-refund" };
      }
    }
    const payments = new ClosedThenProcessingProvider();
    const { application, repository, buyer } = setup(0, payments);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-stale-refund",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await application.confirmPaidOrder(created.order._id, "MOCK");

    const closed = await application.refundOrder(created.order._id);
    const oldRefund = await repository.getRefund(closed.activeRefundId!);
    const retrying = await application.refundOrder(created.order._id);
    expect(retrying.refundStatus).toBe("PROCESSING");
    expect(retrying.activeRefundId).not.toBe(closed.activeRefundId);

    const afterStaleUpdate = await application.recordWeChatRefund({
      outRefundNo: oldRefund!.outRefundNo,
      status: "CLOSED",
      refundId: "closed-refund"
    });
    expect(afterStaleUpdate.refundStatus).toBe("PROCESSING");
    expect(afterStaleUpdate.activeRefundId).toBe(retrying.activeRefundId);
  });
});

describe("V2 coupons", () => {
  it("combines a coupon with paid items, reserves it once, and restores it after refund", async () => {
    const { application, repository, buyer } = setup(100);
    const coupon = await application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-for-mixed-order",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    });
    const payload = {
      requestId: "mixed-order-request",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["mild"] }] }],
      couponItems: [{ couponId: coupon._id, selections: [{ groupId: "spice", choiceIds: ["none"] }, { groupId: "extras", choiceIds: [] }] }]
    };

    const created = await application.createPaymentOrder(buyer.openId, payload);
    expect(created.order).toMatchObject({ source: "MIXED", status: "PENDING_PAYMENT", payableAmount: 1500, itemCount: 2 });
    expect(created.order.lineItems.map((line) => line.pricingSource)).toEqual(["PAID", "COUPON"]);
    expect((await repository.getCoupon(coupon._id))?.status).toBe("RESERVED");

    await expect(application.createPaymentOrder(buyer.openId, { ...payload, requestId: "mixed-order-competing" }))
      .rejects.toThrow("其他订单占用");

    const paid = await application.confirmPaidOrder(created.order._id, "MOCK", "wx-mixed");
    expect(paid).toMatchObject({ source: "MIXED", status: "WAITING_FULFILLMENT", paidAmount: 1500, buyerPoints: 10 });
    expect((await repository.getCoupon(coupon._id))?.status).toBe("USED");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(60);

    const refunded = await application.refundOrder(created.order._id);
    expect(refunded.status).toBe("REFUNDED");
    expect((await repository.getCoupon(coupon._id))?.status).toBe("AVAILABLE");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(50);
  });

  it("releases a reserved coupon when the customer cancels payment", async () => {
    const { application, repository, buyer } = setup(100);
    const coupon = await application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-for-cancelled-payment",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    });
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "mixed-order-cancel-payment",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }],
      couponItems: [{ couponId: coupon._id, selections: [{ groupId: "spice", choiceIds: ["mild"] }, { groupId: "extras", choiceIds: [] }] }]
    });
    expect((await repository.getCoupon(coupon._id))?.status).toBe("RESERVED");

    const cancelled = await application.cancelPendingPayment(buyer.openId, created.order._id);
    expect(cancelled.status).toBe("CANCELLED");
    expect((await repository.getCoupon(coupon._id))?.status).toBe("AVAILABLE");
    expect((await repository.getCoupon(coupon._id))?.reservedOrderId).toBeUndefined();
  });

  it("creates one pickup order from multiple distinct coupons and rejects a repeated coupon", async () => {
    const { application, repository, buyer } = setup(120);
    const first = await application.exchangeCoupon(buyer.openId, {
      requestId: "first-coupon-for-one-order", exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version, expectedPointsCost: exchangeItem.pointsCost
    });
    const second = await application.exchangeCoupon(buyer.openId, {
      requestId: "second-coupon-for-one-order", exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version, expectedPointsCost: exchangeItem.pointsCost
    });
    const selection = [{ groupId: "spice", choiceIds: ["none"] }, { groupId: "extras", choiceIds: [] }];
    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "duplicate-coupon-in-cart",
      expectedPayableAmount: 0,
      expectedBuyerPoints: 0,
      lineItems: [],
      couponItems: [{ couponId: first._id, selections: selection }, { couponId: first._id, selections: selection }]
    })).rejects.toThrow("同一张商品券不能重复使用");

    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "two-coupons-one-order",
      expectedPayableAmount: 0,
      expectedBuyerPoints: 0,
      lineItems: [],
      couponItems: [{ couponId: first._id, selections: selection }, { couponId: second._id, selections: selection }]
    });
    expect(created.order).toMatchObject({ source: "COUPON", status: "WAITING_FULFILLMENT", itemCount: 2, pickupNumber: "001" });
    expect(created.order.couponApplications).toHaveLength(2);
    expect((await repository.getCoupon(first._id))?.status).toBe("USED");
    expect((await repository.getCoupon(second._id))?.status).toBe("USED");
  });

  it("rejects a stale exchange price before deducting points", async () => {
    const { application, repository, buyer } = setup(100);
    await repository.saveExchangeItem({ ...exchangeItem, pointsCost: 80, version: 2 });
    await expect(application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-stale-price",
      exchangeItemId: exchangeItem._id,
      expectedVersion: 1,
      expectedPointsCost: 50
    })).rejects.toThrow("兑换所需积分已更新");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(100);
  });

  it("does not exchange points for an unavailable product", async () => {
    const { application, repository, buyer } = setup(100);
    await repository.saveProduct({ ...product, enabled: false });
    await expect(application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-disabled-product",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    })).rejects.toThrow("指定商品暂时不可兑换");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(100);
  });

  it("blocks paid ordering while closed but still allows coupon exchange and use", async () => {
    const { application, repository, buyer } = setup(100);
    await repository.saveStoreConfig({ ...storeConfig, businessOpen: false });
    const coupon = await application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-while-closed",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    });

    expect(coupon.status).toBe("AVAILABLE");
    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "order-while-closed",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    })).rejects.toThrow("当前暂停接单");
    const couponOrder = await application.useCoupon(buyer.openId, {
      requestId: "coupon-use-while-closed",
      couponId: coupon._id,
      selections: [{ groupId: "spice", choiceIds: ["none"] }]
    });
    expect(couponOrder.source).toBe("COUPON");
    expect(couponOrder.status).toBe("WAITING_FULFILLMENT");
  });

  it("exchanges once, creates one free order and restores coupon on cancellation", async () => {
    const { application, repository, buyer } = setup(100);
    const [coupon1, coupon2] = await Promise.all([
      application.exchangeCoupon(buyer.openId, {
        requestId: "coupon-request-001", exchangeItemId: exchangeItem._id,
        expectedVersion: exchangeItem.version, expectedPointsCost: exchangeItem.pointsCost
      }),
      application.exchangeCoupon(buyer.openId, {
        requestId: "coupon-request-001", exchangeItemId: exchangeItem._id,
        expectedVersion: exchangeItem.version, expectedPointsCost: exchangeItem.pointsCost
      })
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

  it("reuses an ambiguous exchange request and keeps issued coupons independent from later product edits", async () => {
    const { application, repository, buyer } = setup(100);
    const input = {
      requestId: "coupon-request-ambiguous",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    };
    const first = await application.exchangeCoupon(buyer.openId, input);
    await repository.saveExchangeItem({ ...exchangeItem, enabled: false, pointsCost: 80, version: 2 });
    await repository.saveProduct({ ...product, enabled: false, soldOut: true, specGroups: [], version: 2 });

    const retried = await application.exchangeCoupon(buyer.openId, input);
    expect(retried._id).toBe(first._id);
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(50);
    const order = await application.useCoupon(buyer.openId, {
      requestId: "coupon-use-snapshot",
      couponId: first._id,
      selections: [
        { groupId: "spice", choiceIds: ["mild"] },
        { groupId: "extras", choiceIds: ["coriander"] }
      ]
    });
    expect(order.lineItems[0].productVersion).toBe(1);
    expect(order.lineItems[0].productName).toBe("雄飞肉片");
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
    expect(getRounds(owner.passwordHash)).toBe(10);
    const repository = new InMemoryV2Repository("store-main", { ownerAccounts: [owner] });
    const session = await loginV2Owner(repository, { username: "owner", password: "strong-password" }, new Date(nowIso));
    expect((await requireV2Owner(repository, session.token))._id).toBe(owner._id);
    await repository.saveOwner({ ...owner, sessionVersion: 2 });
    await expect(requireV2Owner(repository, session.token)).rejects.toThrow("登录已失效");
  });

  it("temporarily locks repeated owner login attempts and unlocks after the cooldown", async () => {
    const owner: V2OwnerAccount = {
      _id: "owner-rate-limit",
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
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(loginV2Owner(repository, { username: "owner", password: "wrong-password" }, new Date(nowIso))).rejects.toThrow("账号或密码错误");
    }
    await expect(loginV2Owner(repository, { username: "owner", password: "wrong-password" }, new Date(nowIso))).rejects.toThrow("登录尝试较多");
    await expect(loginV2Owner(repository, { username: "owner", password: "strong-password" }, new Date(nowIso))).rejects.toThrow("登录尝试较多");
    await expect(loginV2Owner(repository, { username: "owner", password: "strong-password" }, new Date("2026-08-09T10:16:00.000Z"))).resolves.toBeTruthy();
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
    expect(v2DocumentSetOptions({ _id: "member-1", storeId: "store-main", pointsBalance: 10 })).toEqual({
      data: { storeId: "store-main", pointsBalance: 10 }
    });
  });
});

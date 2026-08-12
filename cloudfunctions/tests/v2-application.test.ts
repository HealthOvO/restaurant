import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRounds } from "bcryptjs";
import { DomainError, type V2Coupon, type V2ExchangeItem, type V2Member, type V2Order, type V2OwnerAccount, type V2PointLedger, type V2Product, type V2StoreConfig } from "@restaurant/shared";
import { V2Application, type V2Clock } from "../src/v2/application";
import { loginV2Owner, hashV2OwnerPassword, requireV2Owner } from "../src/v2/owner-auth";
import { MockV2PaymentProvider, type V2PaymentProvider } from "../src/v2/payment";
import { InMemoryV2Repository, isV2DocumentNotFoundError, v2DocumentSetOptions, withoutV2DocumentId, type V2Transaction } from "../src/v2/repository";
import { initializeV2Store, resetV2Owner } from "../src/v2/setup";

const nowIso = "2026-08-09T10:00:00.000Z";
const clock: V2Clock = { now: () => new Date(nowIso) };

const storeConfig: V2StoreConfig = {
  _id: "store-main:config",
  storeId: "store-main",
  storeName: "祯好七福鼎肉片",
  announcement: "现点现煮",
  businessOpen: true,
  dayBoundaryTime: "04:00",
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso
};

const product: V2Product = {
  _id: "product-fuding",
  storeId: "store-main",
  name: "祯好七福鼎肉片",
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
  name: "祯好七福鼎肉片兑换券",
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

function historicalCoupon(memberId: string, id: string, status: V2Coupon["status"], createdAt: string): V2Coupon {
  return {
    _id: id,
    storeId: "store-main",
    memberId,
    exchangeItemId: exchangeItem._id,
    exchangeItemVersion: exchangeItem.version,
    name: exchangeItem.name,
    productId: product._id,
    productName: product.name,
    productSnapshot: product,
    pointsCost: exchangeItem.pointsCost,
    status,
    expiresAt: status === "EXPIRED" ? "2026-08-08T10:00:00.000Z" : "2026-09-09T10:00:00.000Z",
    createdAt,
    updatedAt: createdAt
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

class BeforeTransactionRepository extends InMemoryV2Repository {
  private beforeTransaction?: () => void | Promise<void>;

  runBeforeNextTransaction(action: () => void | Promise<void>) {
    this.beforeTransaction = action;
  }

  override async runTransaction<T>(callback: (transaction: V2Transaction) => Promise<T>): Promise<T> {
    const action = this.beforeTransaction;
    this.beforeTransaction = undefined;
    if (action) await action();
    return super.runTransaction(callback);
  }
}

function interleavingSetup(points = 0, payments: V2PaymentProvider = new MockV2PaymentProvider()) {
  const inviter = member("member-inviter", "openid-inviter", "INVITER", 0);
  const buyer = { ...member("member-buyer", "openid-buyer", "BUYER001", points), inviterMemberId: inviter._id };
  const repository = new BeforeTransactionRepository("store-main", {
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

  it("initializes one deterministic member under concurrent first requests", async () => {
    const repository = new InMemoryV2Repository("store-main", { storeConfig: [storeConfig] });
    const application = new V2Application(repository, new MockV2PaymentProvider(), clock);
    const [first, second] = await Promise.all([
      application.bootstrapMember("openid-first-visit"),
      application.bootstrapMember("openid-first-visit")
    ]);
    expect(first._id).toBe(second._id);
    expect(repository.snapshot().members.size).toBe(1);
  });

  it("generates sufficiently long member and invitation codes for new users", async () => {
    const repository = new InMemoryV2Repository("store-main", { storeConfig: [storeConfig] });
    const application = new V2Application(repository, new MockV2PaymentProvider(), clock);
    const created = await application.bootstrapMember("openid-long-code");
    expect(created.memberCode).toMatch(/^M[A-F0-9]{12}$/);
    expect(created.inviteCode).toMatch(/^[A-F0-9]{12}$/);
  });

  it("rejects one of two concurrent edits based on the same product version", async () => {
    const { application, repository } = setup();
    const input = {
      id: product._id,
      expectedVersion: product.version,
      name: product.name,
      description: product.description,
      basePrice: product.basePrice,
      enabled: product.enabled,
      soldOut: product.soldOut,
      sortOrder: product.sortOrder,
      pointsEnabled: product.pointsEnabled,
      buyerPointsPerUnit: product.buyerPointsPerUnit,
      inviterPointsPerUnit: product.inviterPointsPerUnit,
      specGroups: product.specGroups
    };
    const results = await Promise.allSettled([
      application.saveProduct({ ...input, name: "版本更新 A" }),
      application.saveProduct({ ...input, name: "版本更新 B" })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await repository.getProduct(product._id))?.version).toBe(product.version + 1);
  });

  it("rejects stale category and exchange-item edits instead of overwriting newer changes", async () => {
    const { application } = setup();
    const category = await application.saveCategory({ name: "小吃", enabled: true, sortOrder: 20 });
    await application.saveCategory({ id: category._id, expectedVersion: category.version, name: "小食", enabled: true, sortOrder: 20 });
    await expect(application.saveCategory({ id: category._id, expectedVersion: category.version, name: "旧名称", enabled: true, sortOrder: 20 }))
      .rejects.toThrow("分类已被更新");

    const savedExchange = await application.saveExchangeItem({
      id: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      name: "新版兑换券",
      productId: product._id,
      pointsCost: 60,
      validDays: 30,
      enabled: true,
      sortOrder: 1
    });
    await expect(application.saveExchangeItem({
      id: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      name: "旧版兑换券",
      productId: product._id,
      pointsCost: 50,
      validDays: 30,
      enabled: true,
      sortOrder: 1
    })).rejects.toThrow("兑换项已被更新");
    expect(savedExchange.version).toBe(exchangeItem.version + 1);
  });

  it("serializes category disable operations so at least one enabled category remains", async () => {
    const { application, repository } = setup();
    const first = await application.saveCategory({ name: "肉片", enabled: true, sortOrder: 10 });
    const second = await application.saveCategory({ name: "饮品", enabled: true, sortOrder: 20 });

    const results = await Promise.allSettled([
      application.saveCategory({ id: first._id, expectedVersion: first.version, name: first.name, enabled: false, sortOrder: first.sortOrder }),
      application.saveCategory({ id: second._id, expectedVersion: second.version, name: second.name, enabled: false, sortOrder: second.sortOrder })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await repository.listCategories(true)).filter((category) => category.enabled)).toHaveLength(1);
  });

  it("allows paid-only required choices but rejects enabling a coupon for that product", async () => {
    const { application } = setup();
    const paidOnly = await application.saveProduct({
      name: "加量肉片",
      description: "",
      basePrice: 1500,
      enabled: true,
      soldOut: false,
      sortOrder: 20,
      pointsEnabled: false,
      buyerPointsPerUnit: 0,
      inviterPointsPerUnit: 0,
      specGroups: [{
        id: "size",
        name: "份量",
        mode: "SINGLE",
        required: true,
        choices: [{ id: "large", name: "大份", priceDelta: 300, enabled: true }]
      }]
    });

    expect(paidOnly.specGroups[0].choices[0].priceDelta).toBe(300);
    await expect(application.saveExchangeItem({
      name: "加量肉片券",
      productId: paidOnly._id,
      pointsCost: 100,
      validDays: 30,
      enabled: true,
      sortOrder: 2
    })).rejects.toThrow("没有可用于商品券的免费选项");
  });

  it("uses the current product name in the customer exchange list", async () => {
    const { application, repository, buyer } = setup();
    await repository.saveProduct({ ...product, name: "新名称肉片", version: product.version + 1 });
    const home = await application.home(buyer.openId);
    expect(home.exchangeItems[0].productName).toBe("新名称肉片");
    expect(home.exchangeItems[0].productVersion).toBe(product.version + 1);
  });

  it("rejects a stale business setting save so an older tab cannot reopen paid ordering", async () => {
    const { application } = setup();
    const closed = await application.saveStoreConfig({
      expectedVersion: storeConfig.version,
      storeName: storeConfig.storeName,
      announcement: storeConfig.announcement,
      businessOpen: false,
      dayBoundaryTime: storeConfig.dayBoundaryTime
    });
    expect(closed).toMatchObject({ businessOpen: false, version: storeConfig.version + 1 });
    await expect(application.saveStoreConfig({
      expectedVersion: storeConfig.version,
      storeName: storeConfig.storeName,
      announcement: "旧标签页改公告",
      businessOpen: true,
      dayBoundaryTime: storeConfig.dayBoundaryTime
    })).rejects.toThrow("营业设置刚刚有更新");
  });

  it("upgrades a legacy business setting document without a version", async () => {
    const legacyConfig = { ...storeConfig } as Partial<V2StoreConfig>;
    delete legacyConfig.version;
    const repository = new InMemoryV2Repository("store-main", { storeConfig: [legacyConfig as V2StoreConfig] });
    const application = new V2Application(repository, new MockV2PaymentProvider(), clock);

    const saved = await application.saveStoreConfig({
      expectedVersion: 1,
      storeName: storeConfig.storeName,
      announcement: "版本迁移",
      businessOpen: false,
      dayBoundaryTime: storeConfig.dayBoundaryTime
    });

    expect(saved).toMatchObject({ version: 2, businessOpen: false, announcement: "版本迁移" });
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

  it("rejects checkout when the displayed product version changed at the same price", async () => {
    const { application, repository, buyer } = setup();
    await repository.saveProduct({
      ...product,
      name: "同价新名称肉片",
      specGroups: product.specGroups.map((group) => group.id === "spice"
        ? { ...group, choices: group.choices.map((choice) => choice.id === "mild" ? { ...choice, name: "同价新辣度" } : choice) }
        : group),
      version: 2
    });

    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "order-request-stale-version",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{
        productId: product._id,
        expectedProductVersion: 1,
        quantity: 1,
        selections: [{ groupId: "spice", choiceIds: ["mild"] }]
      }]
    })).rejects.toThrow("信息已更新");
    expect(repository.snapshot().orders.size).toBe(0);
  });

  it("rechecks product version inside the checkout transaction", async () => {
    const { application, repository, buyer } = interleavingSetup();
    repository.runBeforeNextTransaction(() => repository.saveProduct({
      ...product,
      description: "事务开始前已更新",
      version: 2,
      updatedAt: "2026-08-09T10:00:01.000Z"
    }));

    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "order-product-version-race",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    })).rejects.toThrow("商品价格或积分已更新");
    expect(repository.snapshot().orders.size).toBe(0);
    expect(repository.snapshot().payments.size).toBe(0);
  });

  it("rechecks sold-out state inside the checkout transaction", async () => {
    const { application, repository, buyer } = interleavingSetup();
    repository.runBeforeNextTransaction(() => repository.saveProduct({
      ...product,
      soldOut: true,
      version: 2,
      updatedAt: "2026-08-09T10:00:01.000Z"
    }));

    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "order-product-sold-out-race",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    })).rejects.toThrow("当前不可购买");
    expect(repository.snapshot().orders.size).toBe(0);
    expect(repository.snapshot().payments.size).toBe(0);
  });

  it("rechecks the business switch inside the checkout transaction", async () => {
    const { application, repository, buyer } = interleavingSetup();
    repository.runBeforeNextTransaction(() => repository.saveStoreConfig({
      ...storeConfig,
      businessOpen: false,
      version: storeConfig.version + 1,
      updatedAt: "2026-08-09T10:00:01.000Z"
    }));

    await expect(application.createPaymentOrder(buyer.openId, {
      requestId: "order-store-closed-race",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    })).rejects.toThrow("暂停接单");
    expect(repository.snapshot().orders.size).toBe(0);
    expect(repository.snapshot().payments.size).toBe(0);
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
    expect((await repository.listPointLedgerByMember(buyer._id)).rows).toHaveLength(1);
    expect((await repository.listPointLedgerByMember(inviter._id)).rows).toHaveLength(1);
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
      await tx.saveOrder({
        ...firstOrder,
        createdAt: "2026-08-09T09:00:00.000Z",
        settledAt: "2026-08-09T09:20:00.000Z"
      });
      await tx.saveOrder({
        ...secondOrder,
        createdAt: "2026-08-09T09:05:00.000Z",
        settledAt: "2026-08-09T09:10:00.000Z"
      });
    });

    expect((await application.ownerOrders({ status: "WAITING_FULFILLMENT" })).rows.map((order) => order._id)).toEqual([first.order._id, second.order._id]);
    expect((await application.ownerOrders()).rows.map((order) => order._id)).toEqual([second.order._id, first.order._id]);
    expect((await application.ownerOrders({ status: "WAITING_FULFILLMENT", direction: "RECENT" })).rows.map((order) => order._id)).toEqual([first.order._id, second.order._id]);
    const firstPage = await application.ownerOrders({ status: "WAITING_FULFILLMENT", limit: 1 });
    const queueCursor = JSON.parse(Buffer.from(firstPage.nextCursor!, "base64url").toString("utf8"));
    expect(queueCursor).toMatchObject({
      sortField: "createdAt",
      sortAt: "2026-08-09T09:00:00.000Z",
      direction: "asc",
      orderNo: first.order.orderNo
    });
    await expect(application.ownerOrders({
      status: "WAITING_FULFILLMENT",
      direction: "RECENT",
      limit: 1,
      cursor: firstPage.nextCursor
    })).rejects.toThrow("分页位置无效");
    const recentPage = await application.ownerOrders({ status: "WAITING_FULFILLMENT", direction: "RECENT", limit: 1 });
    expect(JSON.parse(Buffer.from(recentPage.nextCursor!, "base64url").toString("utf8"))).toMatchObject({
      sortField: "settledAt",
      sortAt: "2026-08-09T09:20:00.000Z",
      direction: "desc",
      orderNo: first.order.orderNo
    });
    await application.completeOrder(firstPage.rows[0]._id);
    const secondPage = await application.ownerOrders({ status: "WAITING_FULFILLMENT", limit: 1, cursor: firstPage.nextCursor });
    expect(firstPage.rows.map((order) => order._id)).toEqual([first.order._id]);
    expect(secondPage.rows.map((order) => order._id)).toEqual([second.order._id]);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("surfaces an older-created order in the recent waiting feed after delayed settlement", async () => {
    const { application, repository, buyer } = setup();
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "order-delayed-settlement",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(created.order._id);
      if (!order) throw new Error("missing order");
      await tx.saveOrder({ ...order, createdAt: "2026-08-09T08:00:00.000Z" });
    });
    expect((await application.ownerOrders({ status: "WAITING_FULFILLMENT", direction: "RECENT" })).rows).toEqual([]);

    await repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(created.order._id);
      if (!order) throw new Error("missing order");
      await tx.saveOrder({
        ...order,
        status: "WAITING_FULFILLMENT",
        paymentStatus: "SUCCESS",
        settledAt: "2026-08-09T10:30:00.000Z",
        updatedAt: "2026-08-09T10:30:00.000Z"
      });
    });

    const recent = await application.ownerOrders({ status: "WAITING_FULFILLMENT", direction: "RECENT" });
    expect(recent.rows.map((order) => order._id)).toEqual([created.order._id]);
    expect(recent.rows[0].createdAt).toBe("2026-08-09T08:00:00.000Z");
    expect(recent.rows[0].settledAt).toBe("2026-08-09T10:30:00.000Z");
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

  it("retries WeChat prepay for the same durable local order after the first request fails", async () => {
    class RetryPrepayProvider extends MockV2PaymentProvider {
      calls = 0;
      expiries: Array<string | undefined> = [];
      override async prepare(order: V2Order, expiresAt?: string) {
        this.calls += 1;
        this.expiries.push(expiresAt);
        if (this.calls === 1) throw new Error("prepay unavailable");
        return super.prepare(order);
      }
    }
    const payments = new RetryPrepayProvider();
    const { application, repository, buyer } = setup(0, payments);
    const payload = {
      requestId: "retry-wechat-prepay",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    };

    await expect(application.createPaymentOrder(buyer.openId, payload)).rejects.toThrow("prepay unavailable");
    expect(repository.snapshot().orders.size).toBe(1);
    expect(repository.snapshot().payments.size).toBe(1);
    const retried = await application.createPaymentOrder(buyer.openId, payload);
    expect(retried.order.status).toBe("PENDING_PAYMENT");
    expect(retried.payParams?.mode).toBe("MOCK");
    expect(payments.expiries).toEqual(["2026-08-09T10:15:00.000Z", "2026-08-09T10:15:00.000Z"]);
  });

  it("keeps an unexpired local order payable when cancellation races with in-flight prepay", async () => {
    class BarrierPrepayProvider extends MockV2PaymentProvider {
      private prepareCalls = 0;
      private startedResolve!: () => void;
      private releaseResolve!: () => void;
      private released = false;
      readonly started = new Promise<void>((resolve) => { this.startedResolve = resolve; });
      private readonly releaseBarrier = new Promise<void>((resolve) => { this.releaseResolve = resolve; });

      override async prepare(order: V2Order) {
        this.prepareCalls += 1;
        if (this.prepareCalls === 1) throw new Error("prepay result unknown");
        this.startedResolve();
        await this.releaseBarrier;
        return super.prepare(order);
      }

      override async query(outTradeNo: string) {
        if (!this.released) return { status: "NOT_FOUND" as const };
        return super.query(outTradeNo);
      }

      releasePrepare() {
        this.released = true;
        this.releaseResolve();
      }
    }

    const payments = new BarrierPrepayProvider();
    const { application, repository, buyer } = setup(0, payments);
    const payload = {
      requestId: "prepay-cancel-barrier",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    };
    await expect(application.createPaymentOrder(buyer.openId, payload)).rejects.toThrow("prepay result unknown");
    const creating = application.createPaymentOrder(buyer.openId, payload);
    await payments.started;
    const order = Array.from(repository.snapshot().orders.values())[0];
    if (!order) throw new Error("missing durable order");

    let cancellationResult: V2Order;
    let paymentStatus: string | undefined;
    try {
      cancellationResult = await application.cancelPendingPayment(buyer.openId, order._id);
      paymentStatus = (await repository.getPayment(order._id))?.status;
    } finally {
      payments.releasePrepare();
    }
    const created = await creating;

    expect(cancellationResult!.status).toBe("PENDING_PAYMENT");
    expect(paymentStatus).toBe("NOTPAY");
    payments.markPaid(created.order.orderNo, "wx-prepay-cancel-race");
    const settled = await application.queryPayment(buyer.openId, created.order._id);
    expect(settled).toMatchObject({ status: "WAITING_FULFILLMENT", paymentStatus: "SUCCESS" });
  });

  it("uses the winning transaction's payment expiry for concurrent duplicate checkout", async () => {
    let releaseInitialReads!: () => void;
    const initialReadsReady = new Promise<void>((resolve) => { releaseInitialReads = resolve; });
    class BarrierRepository extends InMemoryV2Repository {
      initialOrderReads = 0;
      override async getOrder(id: string) {
        this.initialOrderReads += 1;
        if (this.initialOrderReads === 2) releaseInitialReads();
        if (this.initialOrderReads <= 2) await initialReadsReady;
        return super.getOrder(id);
      }
    }
    class CaptureExpiryProvider extends MockV2PaymentProvider {
      expiries: Array<string | undefined> = [];
      override async prepare(order: V2Order, expiresAt?: string) {
        this.expiries.push(expiresAt);
        return super.prepare(order);
      }
    }
    const repository = new BarrierRepository("store-main", {
      storeConfig: [storeConfig],
      products: [product],
      exchangeItems: [exchangeItem],
      members: [member("member-race", "openid-race", "RACE0001")]
    });
    const times = [new Date("2026-08-09T10:00:00.000Z"), new Date("2026-08-09T10:05:00.000Z")];
    const raceClock: V2Clock = { now: () => times.shift() ?? new Date("2026-08-09T10:05:00.000Z") };
    const payments = new CaptureExpiryProvider();
    const application = new V2Application(repository, payments, raceClock);
    const payload = {
      requestId: "concurrent-expiry-request",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    };

    const [first, second] = await Promise.all([
      application.createPaymentOrder("openid-race", payload),
      application.createPaymentOrder("openid-race", payload)
    ]);
    const persistedPayment = await repository.getPayment(first.order._id);
    expect(second.order._id).toBe(first.order._id);
    expect(payments.expiries).toHaveLength(2);
    expect(new Set(payments.expiries)).toEqual(new Set([persistedPayment?.expiresAt]));
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
    await repository.runTransaction(async (tx) => {
      const order = await tx.getOrder(created.order._id);
      if (!order) throw new Error("missing order");
      await tx.saveOrder({ ...order, businessDate: "2026-08-08" });
    });
    const [first, second] = await Promise.all([
      application.refundOrder(created.order._id),
      application.refundOrder(created.order._id)
    ]);

    expect(first.status).toBe("REFUNDED");
    expect(second.status).toBe("REFUNDED");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(-25);
    expect((await repository.getMemberById(inviter._id))?.pointsBalance).toBe(0);
    expect((await repository.listPointLedgerByMember(buyer._id)).rows).toHaveLength(2);
    expect((await repository.getPayment(created.order._id))?.status).toBe("REFUND");
    expect((await application.ownerDashboard()).refundCount).toBe(1);
    expect((await application.inviteOverview(inviter.openId)).invitees[0]?.contributedPoints).toBe(0);
  });

  it("persists the refund intent before calling WeChat and keeps it recoverable when submission is uncertain", async () => {
    let repository!: InMemoryV2Repository;
    class FailingRefundProvider extends MockV2PaymentProvider {
      override async refund(order: V2Order, outRefundNo: string) {
        const persistedOrder = await repository.getOrder(order._id);
        const persistedRefund = persistedOrder?.activeRefundId ? await repository.getRefund(persistedOrder.activeRefundId) : null;
        expect(persistedOrder).toMatchObject({ status: "REFUNDING", refundStatus: "PROCESSING" });
        expect(persistedRefund).toMatchObject({ outRefundNo, status: "PROCESSING" });
        throw new Error("connection closed after submission");
      }
    }
    const payments = new FailingRefundProvider();
    const context = setup(0, payments);
    repository = context.repository;
    const created = await context.application.createPaymentOrder(context.buyer.openId, {
      requestId: "refund-intent-before-network",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await context.application.confirmPaidOrder(created.order._id, "MOCK");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const refunding = await context.application.refundOrder(created.order._id);
    errorLog.mockRestore();

    expect(refunding).toMatchObject({ status: "REFUNDING", refundStatus: "PROCESSING" });
    expect(repository.snapshot().refunds.size).toBe(1);
    expect((await repository.getMemberById(context.buyer._id))?.pointsBalance).toBe(10);
  });

  it("queries an uncertain refund, resubmits the same durable refund number, and settles once", async () => {
    class RecoveringRefundProvider extends MockV2PaymentProvider {
      submissions = 0;
      refundNumbers: string[] = [];
      override async refund(_order: V2Order, outRefundNo: string) {
        this.submissions += 1;
        this.refundNumbers.push(outRefundNo);
        if (this.submissions === 1) throw new Error("submission result unknown");
        return { status: "SUCCESS" as const, refundId: "wx-refund-recovered" };
      }
      override async queryRefund() { return { status: "NOT_FOUND" as const }; }
    }
    const payments = new RecoveringRefundProvider();
    const { application, repository, buyer } = setup(0, payments);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "refund-reconciliation-recovery",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await application.confirmPaidOrder(created.order._id, "MOCK");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await application.refundOrder(created.order._id);
    errorLog.mockRestore();
    const refundId = (await repository.getOrder(created.order._id))!.activeRefundId!;
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await repository.runTransaction(async (tx) => {
        const refund = await tx.getRefund(refundId);
        if (!refund) throw new Error("missing refund");
        await tx.saveRefund({ ...refund, nextQueryAt: "2026-08-09T09:59:00.000Z" });
      });
      await application.reconcileRefunds();
    }

    expect((await repository.getOrder(created.order._id))?.status).toBe("REFUNDED");
    expect(new Set(payments.refundNumbers).size).toBe(1);
    expect((await repository.listPointLedgerByMember(buyer._id)).rows.filter((row) => row.type === "PURCHASE_REFUND")).toHaveLength(1);
  });

  it("keeps a real WeChat ABNORMAL refund for query and manual handling without ordinary resubmission", async () => {
    class AbnormalRefundProvider extends MockV2PaymentProvider {
      submissions = 0;
      queries = 0;
      queryStatus: "ABNORMAL" | "SUCCESS" = "ABNORMAL";
      override async refund() {
        this.submissions += 1;
        return { status: "ABNORMAL" as const, refundId: "wx-abnormal-refund" };
      }
      override async queryRefund() {
        this.queries += 1;
        return { status: this.queryStatus, refundId: "wx-abnormal-refund" };
      }
    }
    const payments = new AbnormalRefundProvider();
    const { application, repository, buyer } = setup(0, payments);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "real-abnormal-refund",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await application.confirmPaidOrder(created.order._id, "MOCK");

    const abnormal = await application.refundOrder(created.order._id);
    expect(abnormal).toMatchObject({ status: "REFUNDING", refundStatus: "ABNORMAL" });
    const refundId = abnormal.activeRefundId!;
    expect(await repository.getRefund(refundId)).toMatchObject({
      providerErrorCode: "ABNORMAL",
      providerErrorMessage: "退款异常，请到微信支付商户平台处理",
      recoveryAction: "MANUAL"
    });
    await expect(application.refundOrder(created.order._id)).rejects.toThrow("退款异常，请到微信支付商户平台处理");
    expect(payments.submissions).toBe(1);

    await repository.runTransaction(async (tx) => {
      const refund = await tx.getRefund(refundId);
      if (!refund) throw new Error("missing refund");
      await tx.saveRefund({ ...refund, nextQueryAt: "2026-08-09T09:59:00.000Z" });
    });
    await application.reconcileRefunds();
    expect(payments).toMatchObject({ submissions: 1, queries: 1 });
    expect((await repository.getRefund(refundId))?.nextQueryAt).toBe("2026-08-09T10:30:00.000Z");

    payments.queryStatus = "SUCCESS";
    await repository.runTransaction(async (tx) => {
      const refund = await tx.getRefund(refundId);
      if (!refund) throw new Error("missing refund");
      await tx.saveRefund({ ...refund, nextQueryAt: "2026-08-09T09:59:00.000Z" });
    });
    await application.reconcileRefunds();
    expect((await repository.getOrder(created.order._id))?.status).toBe("REFUNDED");
    expect(payments.submissions).toBe(1);
  });

  it("closes a definitively rejected refund, restores the order, and reports the provider reason", async () => {
    class RejectedThenSuccessProvider extends MockV2PaymentProvider {
      reject = true;
      override async refund(_order: V2Order, outRefundNo: string) {
        if (this.reject) {
          throw new DomainError("WECHAT_PAY_API_ERROR", "refund rejected", {
            wechatCode: "USER_ACCOUNT_ABNORMAL",
            wechatMessage: "user account closed"
          });
        }
        return { status: "SUCCESS" as const, refundId: `wx-${outRefundNo}` };
      }
    }
    const payments = new RejectedThenSuccessProvider();
    const { application, repository, buyer } = setup(0, payments);
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "rejected-refund-request",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }]
    });
    await application.confirmPaidOrder(created.order._id, "MOCK");
    await application.completeOrder(created.order._id);

    await expect(application.refundOrder(created.order._id)).rejects.toMatchObject({
      code: "REFUND_REJECTED",
      meta: { providerCode: "USER_ACCOUNT_ABNORMAL", failureKind: "REJECTED_PERMANENT" }
    });
    const restored = await repository.getOrder(created.order._id);
    expect(restored).toMatchObject({ status: "COMPLETED", refundStatus: "CLOSED" });
    expect(await repository.getRefund(restored!.activeRefundId!)).toMatchObject({
      providerErrorCode: "USER_ACCOUNT_ABNORMAL",
      recoveryAction: undefined
    });
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(10);

    payments.reject = false;
    const refunded = await application.refundOrder(created.order._id);
    expect(refunded.status).toBe("REFUNDED");
    expect(refunded.refundAttempt).toBe(2);
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(0);
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

  it("closes an expired local order and releases coupons when WeChat reports ORDER_NOT_EXIST", async () => {
    class MissingPaymentProvider extends MockV2PaymentProvider {
      closeCalls = 0;
      override async query() { return { status: "NOT_FOUND" as const }; }
      override async close() { this.closeCalls += 1; }
    }
    const payments = new MissingPaymentProvider();
    const { application, repository, buyer } = setup(100, payments);
    const coupon = await application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-for-missing-prepay",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    });
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "local-order-without-wechat-prepay",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }],
      couponItems: [{ couponId: coupon._id, selections: [{ groupId: "spice", choiceIds: ["none"] }, { groupId: "extras", choiceIds: [] }] }]
    });
    await repository.runTransaction(async (tx) => {
      const payment = await tx.getPayment(created.order._id);
      if (!payment) throw new Error("missing payment");
      await tx.savePayment({ ...payment, expiresAt: "2026-08-09T09:59:00.000Z", nextQueryAt: "2026-08-09T09:59:00.000Z" });
    });

    await application.reconcilePayments();
    expect((await repository.getOrder(created.order._id))?.status).toBe("CANCELLED");
    expect((await repository.getCoupon(coupon._id))?.status).toBe("AVAILABLE");
    expect(payments.closeCalls).toBe(0);
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
    expect((await repository.listPointLedgerByMember(buyer._id)).rows).toHaveLength(2);
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
  it("enriches a legacy coupon from its disabled product so it remains usable", async () => {
    const { application, repository, buyer } = setup(100);
    const coupon = await application.exchangeCoupon(buyer.openId, {
      requestId: "legacy-coupon-fallback",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    });
    await repository.runTransaction(async (tx) => {
      const current = await tx.getCoupon(coupon._id);
      if (!current) throw new Error("missing coupon");
      await tx.saveCoupon({ ...current, productSnapshot: undefined });
    });
    await repository.saveProduct({ ...product, enabled: false, soldOut: true, version: 2 });

    const home = await application.home(buyer.openId);
    expect(home.products).toHaveLength(0);
    expect(home.coupons[0]).toMatchObject({
      _id: coupon._id,
      product: { _id: product._id, enabled: true, soldOut: false }
    });
    expect((await application.memberCoupons(buyer.openId))[0]).toHaveProperty("product._id", product._id);
    const used = await application.createPaymentOrder(buyer.openId, {
      requestId: "use-legacy-coupon-fallback",
      expectedPayableAmount: 0,
      expectedBuyerPoints: 0,
      lineItems: [],
      couponItems: [{ couponId: coupon._id, selections: [{ groupId: "spice", choiceIds: ["none"] }, { groupId: "extras", choiceIds: [] }] }]
    });
    expect(used.order).toMatchObject({ status: "WAITING_FULFILLMENT", source: "COUPON" });
  });

  it("keeps old active coupons visible behind more than fifty terminal coupons", async () => {
    const { application, repository, buyer } = setup();
    const oldAvailable = historicalCoupon(buyer._id, "coupon-old-available", "AVAILABLE", "2026-08-01T10:00:00.000Z");
    const oldReserved = {
      ...historicalCoupon(buyer._id, "coupon-old-reserved", "RESERVED", "2026-08-01T11:00:00.000Z"),
      reservedOrderId: "order-still-pending",
      reservedAt: "2026-08-01T11:00:00.000Z"
    };
    const terminalStatuses: V2Coupon["status"][] = ["USED", "EXPIRED", "VOID"];
    const recentTerminal = Array.from({ length: 55 }, (_, index) => historicalCoupon(
      buyer._id,
      `coupon-terminal-${index}`,
      terminalStatuses[index % terminalStatuses.length],
      new Date(Date.parse("2026-08-02T10:00:00.000Z") + index * 1000).toISOString()
    ));
    await repository.runTransaction(async (tx) => {
      for (const coupon of [oldAvailable, oldReserved, ...recentTerminal]) await tx.saveCoupon(coupon);
    });

    const home = await application.home(buyer.openId);
    const memberCoupons = await application.memberCoupons(buyer.openId);
    expect(home.coupons.map((coupon) => coupon._id)).toContain(oldAvailable._id);
    expect(home.availableCouponCount).toBe(1);
    expect(memberCoupons.map((coupon) => coupon._id)).toEqual(expect.arrayContaining([oldAvailable._id, oldReserved._id]));
    expect(memberCoupons).toHaveLength(52);
  });

  it("shows an old coupon again after a paid-order refund restores it", async () => {
    const { application, repository, buyer } = setup(100);
    const coupon = await application.exchangeCoupon(buyer.openId, {
      requestId: "old-refund-restored-coupon",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost
    });
    const created = await application.createPaymentOrder(buyer.openId, {
      requestId: "old-refund-restored-order",
      expectedPayableAmount: 1500,
      expectedBuyerPoints: 10,
      lineItems: [{ productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["none"] }] }],
      couponItems: [{ couponId: coupon._id, selections: [{ groupId: "spice", choiceIds: ["mild"] }, { groupId: "extras", choiceIds: [] }] }]
    });
    await application.confirmPaidOrder(created.order._id, "MOCK", "wx-old-refund-restored");
    await repository.runTransaction(async (tx) => {
      for (let index = 0; index < 55; index += 1) {
        await tx.saveCoupon(historicalCoupon(
          buyer._id,
          `coupon-newer-terminal-${index}`,
          index % 2 === 0 ? "USED" : "VOID",
          new Date(Date.parse(nowIso) + (index + 1) * 1000).toISOString()
        ));
      }
    });

    await application.refundOrder(created.order._id);
    expect((await repository.getCoupon(coupon._id))?.status).toBe("AVAILABLE");
    expect((await application.memberCoupons(buyer.openId)).map((item) => item._id)).toContain(coupon._id);
    expect((await application.home(buyer.openId)).coupons.map((item) => item._id)).toContain(coupon._id);
  });

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

  it("rechecks exchange version and cost inside the points transaction", async () => {
    const { application, repository, buyer } = interleavingSetup(100);
    repository.runBeforeNextTransaction(() => repository.saveExchangeItem({
      ...exchangeItem,
      pointsCost: 80,
      version: 2,
      updatedAt: "2026-08-09T10:00:01.000Z"
    }));

    await expect(application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-price-race",
      exchangeItemId: exchangeItem._id,
      expectedVersion: 1,
      expectedPointsCost: 50
    })).rejects.toThrow("兑换所需积分已更新");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(100);
    expect(repository.snapshot().coupons.size).toBe(0);
    expect(repository.snapshot().pointLedger.size).toBe(0);
  });

  it("rechecks exchange product availability inside the points transaction", async () => {
    const { application, repository, buyer } = interleavingSetup(100);
    repository.runBeforeNextTransaction(() => repository.saveProduct({
      ...product,
      soldOut: true,
      version: 2,
      updatedAt: "2026-08-09T10:00:01.000Z"
    }));

    await expect(application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-product-race",
      exchangeItemId: exchangeItem._id,
      expectedVersion: 1,
      expectedPointsCost: 50
    })).rejects.toThrow("指定商品暂时不可兑换");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(100);
    expect(repository.snapshot().coupons.size).toBe(0);
    expect(repository.snapshot().pointLedger.size).toBe(0);
  });

  it("does not exchange points after the displayed product changes at the same cost", async () => {
    const { application, repository, buyer } = setup(100);
    const home = await application.home(buyer.openId);
    await repository.saveProduct({ ...product, name: "同价新兑换商品", version: 2 });

    await expect(application.exchangeCoupon(buyer.openId, {
      requestId: "coupon-stale-product-version",
      exchangeItemId: exchangeItem._id,
      expectedVersion: exchangeItem.version,
      expectedPointsCost: exchangeItem.pointsCost,
      expectedProductVersion: home.exchangeItems[0].productVersion
    })).rejects.toThrow("兑换商品已更新");
    expect((await repository.getMemberById(buyer._id))?.pointsBalance).toBe(100);
    expect(repository.snapshot().coupons.size).toBe(0);
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
    expect(order.lineItems[0].productName).toBe("祯好七福鼎肉片");
  });
});

describe("V2 invite graph", () => {
  it("keeps contribution totals correct beyond the bounded ledger display", async () => {
    const inviter = member("inviter-many-ledgers", "openid-many-ledgers", "MANYLEDG");
    const invitee = member("invitee-many-ledgers", "openid-invitee-many", "MANYINVT");
    const pointLedger: V2PointLedger[] = Array.from({ length: 101 }, (_, index) => ({
      _id: `reward-${index}`,
      storeId: "store-main",
      memberId: inviter._id,
      type: "INVITE_REWARD",
      amount: 1,
      balanceAfter: index + 1,
      relatedMemberId: invitee._id,
      businessDate: "2026-08-09",
      note: "邀请奖励",
      createdAt: new Date(Date.parse(nowIso) + index).toISOString(),
      updatedAt: nowIso
    }));
    const repository = new InMemoryV2Repository("store-main", { members: [inviter, invitee], pointLedger });
    const firstPage = await repository.listPointLedgerByMember(inviter._id, { limit: 100 });
    const secondPage = await repository.listPointLedgerByMember(inviter._id, { limit: 100, cursor: firstPage.nextCursor });
    expect(firstPage.rows).toHaveLength(100);
    expect(secondPage.rows).toHaveLength(1);
    expect(new Set([...firstPage.rows, ...secondPage.rows].map((row) => row._id)).size).toBe(101);
    expect((await repository.inviteContributionTotals(inviter._id))[invitee._id]).toBe(101);
  });

  it("resolves an inviter for confirmation without writing the irreversible relation", async () => {
    const alice = member("alice-preview", "openid-alice-preview", "ALICEPRE");
    const bob = member("bob-preview", "openid-bob-preview", "BOBPREV1");
    const repository = new InMemoryV2Repository("store-main", {
      storeConfig: [storeConfig], products: [product], members: [alice, bob]
    });
    const application = new V2Application(repository, new MockV2PaymentProvider(), clock);

    await expect(application.resolveInvite(alice.openId, { inviteCode: bob.inviteCode })).resolves.toEqual({
      memberCode: bob.memberCode,
      nickname: undefined
    });
    expect(await repository.getInviteRelation(alice._id)).toBeNull();
    expect((await repository.getMemberById(alice._id))?.inviterMemberId).toBeUndefined();
  });

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
      storeName: "祯好七福鼎肉片",
      username: "owner",
      password: "Strong-password1",
      displayName: "老板"
    }, new Date(nowIso));
    expect(result.store.businessOpen).toBe(false);
    expect(result.product.buyerPointsPerUnit).toBe(10);
    expect(result.exchange.pointsCost).toBe(100);
    await expect(initializeV2Store(repository, {
      storeName: "重复摊位", username: "other", password: "Another-password1"
    })).rejects.toThrow("不能重复执行");

    const session = await loginV2Owner(repository, { username: "owner", password: "Strong-password1" }, new Date(nowIso));
    await resetV2Owner(repository, { username: "new-owner", password: "New-strong-password1", displayName: "新老板" }, new Date(nowIso));
    await expect(requireV2Owner(repository, session.token)).rejects.toThrow("登录已失效");
    await expect(loginV2Owner(repository, { username: "new-owner", password: "New-strong-password1" }, new Date(nowIso))).resolves.toBeTruthy();
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

  it("distinguishes a missing document from database and permission failures", () => {
    expect(isV2DocumentNotFoundError(Object.assign(new Error("document.get:fail document with _id member-1 does not exist"), { errCode: -1 }))).toBe(true);
    expect(isV2DocumentNotFoundError(Object.assign(new Error("document.get:fail permission denied"), { errCode: -502003 }))).toBe(false);
    expect(isV2DocumentNotFoundError(Object.assign(new Error("document.get:fail network timeout"), { errCode: -502001 }))).toBe(false);
  });
});

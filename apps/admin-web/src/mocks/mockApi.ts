import type {
  V2Category,
  V2CategorySaveInput,
  V2Coupon,
  V2DashboardStats,
  V2ExchangeItem,
  V2ExchangeItemSaveInput,
  V2Member,
  V2MemberDetail,
  V2Order,
  V2OwnerSession,
  V2PointLedger,
  V2Product,
  V2ProductSaveInput,
  V2StoreConfig,
  V2StoreConfigSaveInput
} from "@restaurant/shared";
import type { MerchantApi } from "../lib/api";
import { MerchantApiError } from "../lib/api";

const NOW = "2026-08-09T10:18:00.000Z";
const TOKEN = "mock-owner-session-token-for-browser-testing";

let config: V2StoreConfig = {
  _id: "store-main:config",
  storeId: "store-main",
  storeName: "祯好七福鼎肉片",
  announcement: "每日现打肉泥，现点现煮",
  businessOpen: true,
  dayBoundaryTime: "04:00",
  version: 1,
  createdAt: NOW,
  updatedAt: NOW
};

let categories: V2Category[] = [
  { _id: "category-signature", storeId: "store-main", name: "招牌肉片", enabled: true, sortOrder: 10, version: 1, createdAt: NOW, updatedAt: NOW },
  { _id: "category-snacks", storeId: "store-main", name: "小吃加料", enabled: true, sortOrder: 20, version: 1, createdAt: NOW, updatedAt: NOW }
];

let products: V2Product[] = [{
  _id: "product-fuding",
  storeId: "store-main",
  categoryId: "category-signature",
  name: "祯好七福鼎肉片",
  description: "鲜肉现打，紫菜虾皮汤底",
  imageUrl: "",
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
        { id: "mild", name: "微辣", priceDelta: 0, enabled: true, isDefault: true },
        { id: "hot", name: "加辣", priceDelta: 0, enabled: true }
      ]
    },
    {
      id: "extras",
      name: "小料",
      mode: "MULTIPLE",
      required: false,
      maxSelect: 3,
      choices: [
        { id: "coriander", name: "香菜", priceDelta: 0, enabled: true },
        { id: "seaweed", name: "紫菜", priceDelta: 0, enabled: true },
        { id: "extra-meat", name: "加肉", priceDelta: 500, enabled: true }
      ]
    }
  ],
  createdAt: NOW,
  updatedAt: NOW
}];

let exchangeItems: V2ExchangeItem[] = [{
  _id: "exchange-fuding",
  storeId: "store-main",
  name: "祯好七福鼎肉片兑换券",
  productId: "product-fuding",
  productName: "祯好七福鼎肉片",
  pointsCost: 100,
  validDays: 30,
  enabled: true,
  sortOrder: 1,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW
}];

const members: V2Member[] = [
  {
    _id: "member-chen", storeId: "store-main", openId: "openid-chen", memberCode: "M00128",
    inviteCode: "CHEN0828", nickname: "小陈", pointsBalance: 126, createdAt: "2026-08-02T04:00:00.000Z", updatedAt: NOW
  },
  {
    _id: "member-lin", storeId: "store-main", openId: "openid-lin", memberCode: "M00129",
    inviteCode: "LIN00129", nickname: "阿林", pointsBalance: 42, inviterMemberId: "member-chen",
    createdAt: "2026-08-08T12:00:00.000Z", updatedAt: NOW
  },
  {
    _id: "member-wu", storeId: "store-main", openId: "openid-wu", memberCode: "M00130",
    inviteCode: "WU000130", nickname: "吴女士", pointsBalance: 18, inviterMemberId: "member-chen",
    createdAt: "2026-08-09T08:00:00.000Z", updatedAt: NOW
  }
];

let orders: V2Order[] = [
  {
    _id: "order-103", storeId: "store-main", orderNo: "V2MOCK000103", requestKey: "mock-103",
    memberId: "member-lin", memberOpenId: "openid-lin", inviterMemberId: "member-chen", source: "WECHAT_PAY",
    status: "WAITING_FULFILLMENT", paymentStatus: "SUCCESS", payableAmount: 3500, paidAmount: 3500,
    itemCount: 2, buyerPoints: 20, inviterPoints: 2, businessDate: "2026-08-09", pickupSequence: 103,
    pickupNumber: "103", settledAt: "2026-08-09T10:15:00.000Z", createdAt: "2026-08-09T10:14:00.000Z", updatedAt: NOW,
    lineItems: [{
      lineId: "line-1", productId: "product-fuding", productVersion: 1, productName: "祯好七福鼎肉片", quantity: 2,
      basePrice: 1500, unitPrice: 1750, lineTotal: 3500, buyerPointsPerUnit: 10, inviterPointsPerUnit: 1,
      buyerPointsTotal: 20, inviterPointsTotal: 2,
      selectedChoices: [
        { groupId: "spice", groupName: "辣度", choiceId: "mild", choiceName: "微辣", priceDelta: 0 },
        { groupId: "extras", groupName: "小料", choiceId: "extra-meat", choiceName: "加肉", priceDelta: 500 }
      ]
    }]
  },
  {
    _id: "order-102", storeId: "store-main", orderNo: "V2MOCK000102", requestKey: "mock-102",
    memberId: "member-wu", memberOpenId: "openid-wu", source: "COUPON", status: "WAITING_FULFILLMENT",
    payableAmount: 0, paidAmount: 0, itemCount: 1, buyerPoints: 0, inviterPoints: 0,
    couponId: "coupon-wu", couponName: "祯好七福鼎肉片兑换券", couponPointsCost: 100,
    businessDate: "2026-08-09", pickupSequence: 102, pickupNumber: "102", settledAt: "2026-08-09T10:08:00.000Z",
    createdAt: "2026-08-09T10:08:00.000Z", updatedAt: NOW,
    lineItems: [{
      lineId: "line-1", productId: "product-fuding", productVersion: 1, productName: "祯好七福鼎肉片", quantity: 1,
      basePrice: 0, unitPrice: 0, lineTotal: 0, buyerPointsPerUnit: 0, inviterPointsPerUnit: 0,
      buyerPointsTotal: 0, inviterPointsTotal: 0,
      selectedChoices: [{ groupId: "spice", groupName: "辣度", choiceId: "none", choiceName: "不辣", priceDelta: 0 }]
    }]
  },
  {
    _id: "order-101", storeId: "store-main", orderNo: "V2MOCK000101", requestKey: "mock-101",
    memberId: "member-chen", memberOpenId: "openid-chen", source: "WECHAT_PAY", status: "COMPLETED",
    paymentStatus: "SUCCESS", payableAmount: 1500, paidAmount: 1500, itemCount: 1, buyerPoints: 10, inviterPoints: 0,
    businessDate: "2026-08-09", pickupSequence: 101, pickupNumber: "101", settledAt: "2026-08-09T09:50:00.000Z",
    completedAt: "2026-08-09T10:02:00.000Z", createdAt: "2026-08-09T09:49:00.000Z", updatedAt: NOW,
    lineItems: [{
      lineId: "line-1", productId: "product-fuding", productVersion: 1, productName: "祯好七福鼎肉片", quantity: 1,
      basePrice: 1500, unitPrice: 1500, lineTotal: 1500, buyerPointsPerUnit: 10, inviterPointsPerUnit: 1,
      buyerPointsTotal: 10, inviterPointsTotal: 1,
      selectedChoices: [{ groupId: "spice", groupName: "辣度", choiceId: "hot", choiceName: "加辣", priceDelta: 0 }]
    }]
  }
];

let mockSessionExpired = false;
let mockOrderListFailure = false;
let mockOrderListDelays: Record<string, number> = {};
let mockStoreConfigDelay = 90;
let mockMemberSearchDelays: Record<string, number> = {};
let mockMemberDetailDelays: Record<string, number> = {};

const initialMutableState = {
  config: structuredClone(config),
  categories: structuredClone(categories),
  products: structuredClone(products),
  exchangeItems: structuredClone(exchangeItems),
  orders: structuredClone(orders)
};

export function resetMockMerchantApi() {
  config = structuredClone(initialMutableState.config);
  categories = structuredClone(initialMutableState.categories);
  products = structuredClone(initialMutableState.products);
  exchangeItems = structuredClone(initialMutableState.exchangeItems);
  orders = structuredClone(initialMutableState.orders);
  mockSessionExpired = false;
  mockOrderListFailure = false;
  mockOrderListDelays = {};
  mockStoreConfigDelay = 90;
  mockMemberSearchDelays = {};
  mockMemberDetailDelays = {};
}

export function expireMockMerchantSession(): void {
  mockSessionExpired = true;
}

export function setMockOrderListFailure(enabled: boolean): void {
  mockOrderListFailure = enabled;
}

export function setMockOrderListDelay(status: V2Order["status"] | "ALL", milliseconds: number): void {
  mockOrderListDelays[status] = milliseconds;
}

export function setMockStoreConfigDelay(milliseconds: number): void {
  mockStoreConfigDelay = milliseconds;
}

export function setMockMemberSearchDelay(query: string, milliseconds: number): void {
  mockMemberSearchDelays[query.trim().toLowerCase()] = milliseconds;
}

export function setMockMemberDetailDelay(memberId: string, milliseconds: number): void {
  mockMemberDetailDelays[memberId] = milliseconds;
}

export function emptyMockWaitingQueue(): void {
  orders = orders.filter((order) => order.status !== "WAITING_FULFILLMENT");
}

export function addMockDelayedPaymentOrder(): void {
  const template = initialMutableState.orders.find((order) => order._id === "order-103");
  if (!template || orders.some((order) => order._id === "order-delayed-payment")) return;
  orders = [...orders, {
    ...structuredClone(template),
    _id: "order-delayed-payment",
    orderNo: "V2MOCK000104",
    pickupSequence: 104,
    pickupNumber: "104",
    createdAt: "2026-08-09T09:00:00.000Z",
    settledAt: "2026-08-09T10:30:00.000Z",
    updatedAt: "2026-08-09T10:30:00.000Z"
  }];
}

export function seedMockWaitingOrders(count: number): void {
  const template = initialMutableState.orders.find((order) => order._id === "order-103");
  if (!template) return;
  const firstCreatedAt = Date.parse("2026-08-09T06:00:00.000Z");
  orders = [
    ...orders.filter((order) => order.status !== "WAITING_FULFILLMENT"),
    ...Array.from({ length: count }, (_, index) => {
      const sequence = index + 1;
      const createdAt = new Date(firstCreatedAt + index * 60_000).toISOString();
      return {
        ...structuredClone(template),
        _id: `order-bulk-${sequence}`,
        orderNo: `V2MOCKBULK${String(sequence).padStart(6, "0")}`,
        pickupSequence: sequence,
        pickupNumber: String(sequence).padStart(3, "0"),
        createdAt,
        settledAt: createdAt,
        updatedAt: createdAt
      };
    })
  ];
}

export function addMockRefundingOrders(): void {
  const template = orders.find((order) => order._id === "order-101");
  if (!template || orders.some((order) => order._id === "order-refund-abnormal")) return;
  orders = [...orders,
    {
      ...structuredClone(template),
      _id: "order-refund-abnormal",
      orderNo: "V2MOCK000201",
      pickupSequence: 201,
      pickupNumber: "201",
      status: "REFUNDING",
      refundStatus: "ABNORMAL",
      createdAt: "2026-08-09T10:20:00.000Z",
      updatedAt: "2026-08-09T10:31:00.000Z"
    },
    {
      ...structuredClone(template),
      _id: "order-refund-closed",
      orderNo: "V2MOCK000202",
      pickupSequence: 202,
      pickupNumber: "202",
      status: "REFUNDING",
      refundStatus: "CLOSED",
      createdAt: "2026-08-09T10:21:00.000Z",
      updatedAt: "2026-08-09T10:32:00.000Z"
    }
  ];
}

const ledger: V2PointLedger[] = [
  { _id: "ledger-1", storeId: "store-main", memberId: "member-chen", type: "PURCHASE", amount: 10, balanceAfter: 124, orderId: "order-101", businessDate: "2026-08-09", note: "订单消费积分", createdAt: "2026-08-09T09:50:00.000Z", updatedAt: NOW },
  { _id: "ledger-2", storeId: "store-main", memberId: "member-chen", type: "INVITE_REWARD", amount: 2, balanceAfter: 126, orderId: "order-103", relatedMemberId: "member-lin", businessDate: "2026-08-09", note: "下级消费奖励", createdAt: "2026-08-09T10:15:00.000Z", updatedAt: NOW }
];

const coupons: V2Coupon[] = [{
  _id: "coupon-chen", storeId: "store-main", memberId: "member-chen", exchangeItemId: "exchange-fuding",
  exchangeItemVersion: 1, name: "祯好七福鼎肉片兑换券", productId: "product-fuding", productName: "祯好七福鼎肉片",
  pointsCost: 100, status: "AVAILABLE", expiresAt: "2026-09-08T10:00:00.000Z", createdAt: NOW, updatedAt: NOW
}];

function delay<T>(value: T, ms = 90): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(structuredClone(value)), ms));
}

function auth(token: string) {
  if (mockSessionExpired || token !== TOKEN) throw new MerchantApiError("登录已失效，请重新登录", "UNAUTHORIZED");
}

function dashboard(): V2DashboardStats {
  const active = orders.filter((order) => order.status !== "CANCELLED");
  return {
    businessDate: "2026-08-09",
    paymentOrderCount: active.filter((order) => order.paidAmount > 0).length,
    couponOrderCount: active.filter((order) => order.source === "COUPON" || order.source === "MIXED").length,
    paymentAmount: active.reduce((sum, order) => sum + order.paidAmount, 0),
    completedOrderCount: active.filter((order) => order.status === "COMPLETED").length,
    refundCount: active.filter((order) => order.status === "REFUNDED").length,
    newMemberCount: 1,
    buyerPointsIssued: 30,
    inviterPointsIssued: 2,
    exchangePointsSpent: 100
  };
}

function memberDetail(memberId: string): V2MemberDetail {
  const current = members.find((item) => item._id === memberId);
  if (!current) throw new MerchantApiError("用户不存在", "MEMBER_NOT_FOUND");
  const inviter = current.inviterMemberId ? members.find((item) => item._id === current.inviterMemberId) : undefined;
  const invitees = members.filter((item) => item.inviterMemberId === current._id).map((item) => ({
    _id: item._id, memberCode: item.memberCode, nickname: item.nickname, createdAt: item.createdAt,
    contributedPoints: ledger.filter((row) => row.memberId === current._id && row.relatedMemberId === item._id).reduce((sum, row) => sum + row.amount, 0)
  }));
  return {
    ...current,
    inviter: inviter ? { _id: inviter._id, memberCode: inviter.memberCode, nickname: inviter.nickname } : undefined,
    invitees,
    coupons: coupons.filter((item) => item.memberId === current._id),
    pointLedger: ledger.filter((item) => item.memberId === current._id),
    recentOrders: orders.filter((item) => item.memberId === current._id)
  };
}

export const mockMerchantApi: MerchantApi = {
  async login(username, password): Promise<V2OwnerSession> {
    if (username !== "owner" || password !== "demo12345") {
      await delay(null);
      throw new MerchantApiError("账号或密码错误", "INVALID_CREDENTIALS");
    }
    return delay({
      token: TOKEN,
      owner: { _id: "owner-main", username: "owner", displayName: "老板" },
      expiresAt: "2099-12-31T23:59:59.000Z"
    });
  },
  async profile(token) { auth(token); return delay({ _id: "owner-main", username: "owner", displayName: "老板" }); },
  async getDashboard(token) { auth(token); return delay(dashboard()); },
  async listOrders(token, status, cursor, limit = 50, direction = "QUEUE") {
    auth(token);
    if (mockOrderListFailure) throw new MerchantApiError("订单同步失败，请稍后重试", "NETWORK_ERROR");
    const rows = orders.filter((order) => !status || order.status === status).slice().sort((left, right) => {
      const queueOrder = status === "WAITING_FULFILLMENT" && direction === "QUEUE";
      const leftSortAt = status === "WAITING_FULFILLMENT" && direction === "RECENT" ? left.settledAt ?? left.createdAt : left.createdAt;
      const rightSortAt = status === "WAITING_FULFILLMENT" && direction === "RECENT" ? right.settledAt ?? right.createdAt : right.createdAt;
      const byTime = leftSortAt.localeCompare(rightSortAt);
      if (byTime !== 0) return queueOrder ? byTime : -byTime;
      return queueOrder ? left.orderNo.localeCompare(right.orderNo) : right.orderNo.localeCompare(left.orderNo);
    });
    const offset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
    const pageRows = rows.slice(offset, offset + limit);
    return delay(
      { rows: pageRows, nextCursor: offset + limit < rows.length ? String(offset + limit) : undefined },
      mockOrderListDelays[status ?? "ALL"] ?? 90
    );
  },
  async completeOrder(token, orderId) {
    auth(token);
    const order = orders.find((item) => item._id === orderId);
    if (!order) throw new MerchantApiError("订单不存在", "ORDER_NOT_FOUND");
    order.status = "COMPLETED"; order.completedAt = new Date().toISOString(); order.updatedAt = order.completedAt;
    return delay(order);
  },
  async cancelCouponOrder(token, orderId) {
    auth(token);
    const order = orders.find((item) => item._id === orderId && item.source === "COUPON");
    if (!order) throw new MerchantApiError("券订单不存在", "ORDER_NOT_FOUND");
    order.status = "CANCELLED"; order.cancelledAt = new Date().toISOString(); order.updatedAt = order.cancelledAt;
    return delay(order);
  },
  async refundOrder(token, orderId) {
    auth(token);
    const order = orders.find((item) => item._id === orderId && item.paidAmount > 0);
    if (!order) throw new MerchantApiError("订单不能退款", "ORDER_NOT_REFUNDABLE");
    order.status = "REFUNDED"; order.refundStatus = "SUCCESS"; order.refundedAt = new Date().toISOString(); order.updatedAt = order.refundedAt;
    return delay(order);
  },
  async listProducts(token) { auth(token); return delay(products); },
  async saveProduct(token, input: V2ProductSaveInput) {
    auth(token);
    const existing = input.id ? products.find((item) => item._id === input.id) : undefined;
    if (existing && input.expectedVersion !== existing.version) {
      throw new MerchantApiError("商品已被其他页面修改，请刷新后重试", "VERSION_CONFLICT");
    }
    const row: V2Product = {
      _id: existing?._id ?? `product-${Date.now()}`, storeId: "store-main", name: input.name,
      categoryId: input.categoryId,
      description: input.description, imageUrl: input.imageUrl, basePrice: input.basePrice,
      enabled: input.enabled, soldOut: input.soldOut, sortOrder: input.sortOrder,
      pointsEnabled: input.pointsEnabled,
      buyerPointsPerUnit: input.pointsEnabled ? input.buyerPointsPerUnit : 0,
      inviterPointsPerUnit: input.pointsEnabled ? input.inviterPointsPerUnit : 0,
      specGroups: input.specGroups, version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    products = existing ? products.map((item) => item._id === row._id ? row : item) : [...products, row];
    return delay(row);
  },
  async listCategories(token) { auth(token); return delay(categories.slice().sort((a, b) => a.sortOrder - b.sortOrder)); },
  async saveCategory(token, input: V2CategorySaveInput) {
    auth(token);
    const existing = input.id ? categories.find((item) => item._id === input.id) : undefined;
    if (existing && input.expectedVersion !== existing.version) throw new MerchantApiError("分类已被其他页面修改，请刷新后重试", "VERSION_CONFLICT");
    const row: V2Category = {
      _id: existing?._id ?? `category-${Date.now()}`,
      storeId: "store-main",
      name: input.name,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    categories = existing ? categories.map((item) => item._id === row._id ? row : item) : [...categories, row];
    return delay(row);
  },
  async listExchangeItems(token) { auth(token); return delay(exchangeItems); },
  async saveExchangeItem(token, input: V2ExchangeItemSaveInput) {
    auth(token);
    const product = products.find((item) => item._id === input.productId);
    if (!product) throw new MerchantApiError("指定商品不存在", "PRODUCT_NOT_FOUND");
    if (input.enabled && (!product.enabled || product.soldOut)) throw new MerchantApiError("指定商品已下架或售罄，不能开启兑换", "PRODUCT_UNAVAILABLE");
    if (input.enabled && product.specGroups.some((group) => group.required && !group.choices.some((choice) => choice.enabled && choice.priceDelta === 0))) throw new MerchantApiError("指定商品的必选规格需要保留一个免费选项", "COUPON_PRODUCT_UNAVAILABLE");
    const existing = input.id ? exchangeItems.find((item) => item._id === input.id) : undefined;
    if (existing && input.expectedVersion !== existing.version) throw new MerchantApiError("兑换项已被其他页面修改，请刷新后重试", "VERSION_CONFLICT");
    const row: V2ExchangeItem = {
      _id: existing?._id ?? `exchange-${Date.now()}`, storeId: "store-main", name: input.name,
      productId: product._id, productName: product.name, pointsCost: input.pointsCost,
      validDays: input.validDays, enabled: input.enabled, sortOrder: input.sortOrder,
      version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    exchangeItems = existing ? exchangeItems.map((item) => item._id === row._id ? row : item) : [...exchangeItems, row];
    return delay(row);
  },
  async searchMembers(token, query) {
    auth(token);
    const normalized = query.trim().toLowerCase();
    return delay(
      members.filter((item) => !normalized || [item.memberCode, item.inviteCode, item.nickname].some((value) => value?.toLowerCase().includes(normalized))),
      mockMemberSearchDelays[normalized] ?? 90
    );
  },
  async getMemberDetail(token, memberId) { auth(token); return delay(memberDetail(memberId), mockMemberDetailDelays[memberId] ?? 90); },
  async getStoreConfig(token) { auth(token); return delay(config, mockStoreConfigDelay); },
  async saveStoreConfig(token, input: V2StoreConfigSaveInput) {
    auth(token);
    const currentVersion = config.version ?? 1;
    if (input.expectedVersion !== currentVersion) throw new MerchantApiError("营业设置刚刚有更新，请刷新后再保存", "VERSION_CONFLICT");
    const { expectedVersion: _expectedVersion, ...values } = input;
    config = { ...config, ...values, version: currentVersion + 1, updatedAt: new Date().toISOString() };
    return delay(config);
  }
};

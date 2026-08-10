const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..", "miniprogram");

function pageInstance(definition) {
  const instance = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(updates, callback) { this.data = { ...this.data, ...updates }; if (callback) callback(); }
  };
  Object.entries(definition).forEach(([key, value]) => { if (key !== "data") instance[key] = value; });
  return instance;
}

function loadPage(relativePath, mocks, wx) {
  const filename = path.join(root, relativePath);
  const previous = { Page: global.Page, wx: global.wx, getApp: global.getApp };
  const mocked = [];
  let definition;
  global.Page = (value) => { definition = value; };
  global.wx = wx;
  global.getApp = () => ({ globalData: { cart: [] } });
  for (const [request, exports] of Object.entries(mocks || {})) {
    const resolved = require.resolve(path.resolve(path.dirname(filename), request));
    mocked.push(resolved);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }
  delete require.cache[require.resolve(filename)];
  require(filename);
  return {
    page: pageInstance(definition),
    restore() {
      delete require.cache[require.resolve(filename)];
      mocked.forEach((entry) => delete require.cache[entry]);
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete global[key]; else global[key] = value;
      }
    }
  };
}

function wxMock() {
  const storage = new Map();
  return {
    redirects: [], toasts: [], modals: [],
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    redirectTo(options) { this.redirects.push(options); },
    showToast(options) { this.toasts.push(options); },
    showModal(options) { this.modals.push(options); if (options.success) options.success({ confirm: true }); }
  };
}

test("home tab reuses fresh data without another loading request", async () => {
  const wx = wxMock();
  const cache = require(path.join(root, "utils", "v2-cache"));
  cache.clearCache();
  let calls = 0;
  const loaded = loadPage("pages/home/home.js", {
    "../../services/v2": {
      getHome: async () => {
        calls += 1;
        return { products: [], config: { businessOpen: true }, member: { pointsBalance: 0 }, availableCouponCount: 0 };
      }
    },
    "../../utils/v2-cart": {
      addCartLine: () => [],
      cartSummary: () => ({ count: 0, amount: 0, points: 0 }),
      loadCart: () => [],
      reconcileCart: (cart) => ({ cart, changed: false, removedCount: 0 }),
      saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.onLoad();
    loaded.page.onShow();
    await loaded.page.homeRequest;
    loaded.page.onShow();
    assert.equal(calls, 1);
    assert.equal(loaded.page.data.loading, false);
  } finally {
    cache.clearCache();
    loaded.restore();
  }
});

test("home refreshes coupons after returning from benefits and closes open sheets when hidden", async () => {
  const wx = wxMock();
  const cache = require(path.join(root, "utils", "v2-cache"));
  cache.clearCache();
  cache.writeCache("home", {
    categories: [{ _id: "food", name: "肉片" }], products: [], coupons: [],
    config: { businessOpen: true }, member: { pointsBalance: 100 }, availableCouponCount: 0
  });
  wx.setStorageSync("v2-home-section", "coupons");
  let calls = 0;
  const loaded = loadPage("pages/home/home.js", {
    "../../services/v2": {
      getHome: async () => {
        calls += 1;
        return {
          categories: [{ _id: "food", name: "肉片" }], products: [],
          coupons: [{ _id: "coupon-1", productName: "祯好七福鼎肉片", productSnapshot: { basePrice: 1500 } }],
          config: { businessOpen: true }, member: { pointsBalance: 0 }, availableCouponCount: 1
        };
      }
    },
    "../../utils/v2-cart": {
      addCartLine: () => [], addCouponLine: () => [], changeCartQuantity: () => [], clearCart: () => [], removeCartLine: () => [],
      cartSummary: () => ({ count: 0, paidCount: 0, couponCount: 0, amount: 0, discount: 0, points: 0 }),
      loadCart: () => [], reconcileCart: (cart) => ({ cart, changed: false, removedCount: 0 }), saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.onLoad();
    loaded.page.setData({ cartOpen: true, activeProduct: { _id: "product-1" }, activeCoupon: { _id: "coupon-1" } });
    loaded.page.onHide();
    assert.equal(loaded.page.data.cartOpen, false);
    assert.equal(loaded.page.data.activeProduct, null);

    loaded.page.onShow();
    await loaded.page.homeRequest;
    assert.equal(calls, 1);
    assert.equal(loaded.page.data.activeCategoryId, "__coupons__");
    assert.equal(loaded.page.data.visibleCoupons.length, 1);
  } finally {
    cache.clearCache();
    loaded.restore();
  }
});

test("home keeps a sold-out product visible but does not open its selector", () => {
  const wx = wxMock();
  const loaded = loadPage("pages/home/home.js", {
    "../../services/v2": { getHome: async () => ({}) },
    "../../utils/v2-cart": {
      addCartLine: () => [], cartSummary: () => ({ count: 0, amount: 0, points: 0 }),
      loadCart: () => [], reconcileCart: (cart) => ({ cart, changed: false, removedCount: 0 }), saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.setData({ products: [{ _id: "sold-out-product", name: "祯好七福鼎肉片", enabled: true, soldOut: true }] });
    loaded.page.openProduct({ currentTarget: { dataset: { id: "sold-out-product" } } });
    assert.equal(loaded.page.data.products.length, 1);
    assert.equal(loaded.page.data.activeProduct, null);
  } finally { loaded.restore(); }
});

test("product selector updates the displayed total when quantity changes", () => {
  const wx = wxMock();
  const loaded = loadPage("pages/home/home.js", {
    "../../services/v2": { getHome: async () => ({}) },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 0, amount: 0, points: 0 }),
      loadCart: () => [], reconcileCart: (cart) => ({ cart, changed: false, removedCount: 0 }), saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.setData({
      activeMode: "PAID",
      quantity: 2,
      activeProduct: {
        basePrice: 1500,
        pointsEnabled: true,
        buyerPointsPerUnit: 10,
        specGroups: [{ choices: [{ selected: true, priceDelta: 200 }] }]
      }
    });
    loaded.page.syncActiveTotals();
    assert.equal(loaded.page.data.activeUnitPriceText, "¥34.00");
    assert.equal(loaded.page.data.activePoints, 20);
  } finally { loaded.restore(); }
});

test("checkout completes mock payment before opening the result page", async () => {
  const wx = wxMock();
  const calls = [];
  let orderPayload;
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async (payload) => { orderPayload = payload; return { order: { _id: "order-1", status: "PENDING_PAYMENT" }, payParams: { mode: "MOCK" } }; },
      mockPay: async (orderId) => calls.push(orderId)
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }),
      clearCart: () => {},
      createRequestId: () => "order-request-123",
      loadCart: () => [],
      saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2, amountText: "¥15.00" } });
    await loaded.page.submitOrder();
    assert.deepEqual(calls, ["order-1"]);
    assert.equal(orderPayload.expectedPayableAmount, 1500);
    assert.equal(orderPayload.expectedBuyerPoints, 2);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=order-1");
  } finally { loaded.restore(); }
});

test("checkout sends paid lines and coupon lines in one order", async () => {
  const wx = wxMock();
  let payload;
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async (value) => { payload = value; return { order: { _id: "mixed-order", status: "PENDING_PAYMENT" }, payParams: { mode: "MOCK" } }; },
      mockPay: async () => {}
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 2, paidCount: 1, couponCount: 1, amount: 1500, discount: 1500, points: 10 }),
      clearCart: () => {}, createRequestId: () => "mixed-order-request", loadCart: () => [], saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.rawCart = [
      { kind: "PAID", productId: "p1", quantity: 1, selections: [] },
      { kind: "COUPON", couponId: "coupon-1", productId: "p1", quantity: 1, selections: [] }
    ];
    loaded.page.setData({ cart: loaded.page.rawCart, summary: { count: 2, amount: 1500, points: 10 } });
    await loaded.page.submitOrder();
    assert.equal(payload.lineItems.length, 1);
    assert.equal(payload.couponItems.length, 1);
    assert.equal(payload.couponItems[0].couponId, "coupon-1");
    assert.equal(payload.expectedPayableAmount, 1500);
  } finally { loaded.restore(); }
});

test("checkout replaces a closed idempotency key before creating a new payment", async () => {
  const wx = wxMock();
  const requestIds = [];
  let sequence = 0;
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async (payload) => {
        requestIds.push(payload.requestId);
        return requestIds.length === 1
          ? { order: { _id: "closed-order", status: "CANCELLED" } }
          : { order: { _id: "new-order", status: "PENDING_PAYMENT" }, payParams: { mode: "MOCK" } };
      },
      mockPay: async () => {}
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }),
      clearCart: () => {},
      createRequestId: () => `order-request-${++sequence}`,
      loadCart: () => [],
      saveCart: () => {}
    }
  }, wx);
  try {
    wx.setStorageSync("v2-checkout-request", "old-order-request");
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2 } });
    await loaded.page.submitOrder();
    assert.deepEqual(requestIds, ["old-order-request", "order-request-1"]);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=new-order");
  } finally { loaded.restore(); }
});

test("checkout clears a stale cart when the server detects a quote change", async () => {
  const wx = wxMock();
  let clearCount = 0;
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async () => { const error = new Error("商品价格或积分已更新"); error.code = "ORDER_QUOTE_CHANGED"; throw error; }
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 0, amount: 0, points: 0 }),
      clearCart: () => { clearCount += 1; },
      createRequestId: () => "order-request-stale",
      loadCart: () => [],
      saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2 } });
    await loaded.page.submitOrder();
    assert.equal(clearCount, 1);
    assert.equal(loaded.page.data.cart.length, 0);
    assert.equal(wx.modals[0].title, "商品信息有更新");
  } finally { loaded.restore(); }
});

test("coupon exchange reuses its request id and submits the confirmed version", async () => {
  const wx = wxMock();
  const payloads = [];
  const loaded = loadPage("pages/benefits/benefits.js", {
    "../../services/v2": {
      exchangeCoupon: async (payload) => { payloads.push(payload); if (payloads.length === 1) throw new Error("network lost"); },
      getHome: async () => ({ config: { businessOpen: true }, exchangeItems: [] }),
      listCoupons: async () => [],
      listPoints: async () => ({ balance: 50, rows: [] })
    },
    "../../utils/v2-cart": { createRequestId: () => "exchange-request-stable" },
    "../../utils/v2-format": { dateTime: () => "", preparePoint: (row) => row }
  }, wx);
  try {
    const item = { _id: "exchange-1", name: "祯好七福鼎肉片商品券", pointsCost: 50, version: 3, canExchange: true };
    loaded.page.setData({ exchangeItems: [item] });
    await loaded.page.exchange({ currentTarget: { dataset: { id: item._id } } });
    await loaded.page.exchange({ currentTarget: { dataset: { id: item._id } } });
    assert.equal(payloads[0].requestId, "exchange-request-stable");
    assert.equal(payloads[1].requestId, "exchange-request-stable");
    assert.equal(payloads[1].expectedVersion, 3);
    assert.equal(payloads[1].expectedPointsCost, 50);
  } finally { loaded.restore(); }
});

test("benefits prepares a clear points gap and keeps usable coupons first", () => {
  const wx = wxMock();
  const loaded = loadPage("pages/benefits/benefits.js", {
    "../../services/v2": {},
    "../../utils/v2-cart": { createRequestId: () => "exchange-request" },
    "../../utils/v2-format": { dateTime: (value) => value, preparePoint: (row) => row }
  }, wx);
  try {
    loaded.page.applyBenefits({
      home: {
        config: { businessOpen: true },
        exchangeItems: [{ _id: "exchange-1", pointsCost: 100, productName: "祯好七福鼎肉片" }]
      },
      coupons: [
        { _id: "used", status: "USED", expiresAt: "2099-09-01T00:00:00.000Z" },
        { _id: "available", status: "AVAILABLE", expiresAt: "2099-08-01T00:00:00.000Z" }
      ],
      points: { balance: 80, rows: [] }
    });
    assert.equal(loaded.page.data.exchangeItems[0].canExchange, false);
    assert.equal(loaded.page.data.exchangeItems[0].pointsGap, 20);
    assert.equal(loaded.page.data.coupons[0]._id, "available");
  } finally { loaded.restore(); }
});

test("coupon order submits selected free specs and opens pickup result", async () => {
  const wx = wxMock();
  let payload;
  const loaded = loadPage("pages/coupon-use/coupon-use.js", {
    "../../services/v2": {
      useCoupon: async (value) => { payload = value; return { _id: "coupon-order-1" }; }
    },
    "../../utils/v2-cart": { createRequestId: () => "coupon-request-123" }
  }, wx);
  try {
    loaded.page.setData({
      couponId: "coupon-1",
      businessOpen: false,
      product: { specGroups: [{ id: "spice", required: true, choices: [{ id: "mild", selected: true }] }] }
    });
    await loaded.page.submit();
    assert.deepEqual(payload.selections, [{ groupId: "spice", choiceIds: ["mild"] }]);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=coupon-order-1");
  } finally { loaded.restore(); }
});

test("coupon use renders its issued product snapshot after the live product is disabled", async () => {
  const wx = wxMock();
  const snapshot = {
    _id: "product-1",
    name: "祯好七福鼎肉片",
    specGroups: [{ id: "spice", mode: "SINGLE", required: true, choices: [{ id: "mild", enabled: true, priceDelta: 0, isDefault: true }] }]
  };
  const loaded = loadPage("pages/coupon-use/coupon-use.js", {
    "../../services/v2": {
      getHome: async () => ({ config: { businessOpen: true }, products: [] }),
      listCoupons: async () => [{ _id: "coupon-1", productId: "product-1", status: "AVAILABLE", productSnapshot: snapshot }]
    },
    "../../utils/v2-cart": { createRequestId: () => "coupon-request-123" }
  }, wx);
  try {
    loaded.page.setData({ couponId: "coupon-1" });
    await loaded.page.loadCoupon();
    assert.equal(loaded.page.data.product.name, "祯好七福鼎肉片");
    assert.equal(loaded.page.data.product.specGroups[0].choices[0].selected, true);
  } finally { loaded.restore(); }
});

test("payment result clears the cart only after settlement", async () => {
  const wx = wxMock();
  let clearCount = 0;
  const loaded = loadPage("pages/payment-result/payment-result.js", {
    "../../services/v2": { queryPayment: async () => ({ _id: "order-1", source: "WECHAT_PAY", status: "WAITING_FULFILLMENT", pickupNumber: "018" }) },
    "../../utils/v2-cart": { clearCart: () => { clearCount += 1; } }
  }, wx);
  try {
    loaded.page.setData({ orderId: "order-1" });
    await loaded.page.query();
    assert.equal(clearCount, 1);
    assert.equal(loaded.page.data.order.pickupNumber, "018");
  } finally { loaded.restore(); }
});

test("unified coupon checkout clears the submitted cart after pickup creation", async () => {
  const wx = wxMock();
  let clearCount = 0;
  const loaded = loadPage("pages/payment-result/payment-result.js", {
    "../../services/v2": { queryPayment: async () => ({ _id: "coupon-order-1", source: "COUPON", status: "WAITING_FULFILLMENT", pickupNumber: "019" }) },
    "../../utils/v2-cart": { clearCart: () => { clearCount += 1; } }
  }, wx);
  try {
    loaded.page.setData({ orderId: "coupon-order-1" });
    await loaded.page.query();
    assert.equal(clearCount, 1);
    assert.equal(loaded.page.data.order.pickupNumber, "019");
  } finally { loaded.restore(); }
});

test("refunded payment result stops polling and never renders earned points as a success", async () => {
  const wx = wxMock();
  const loaded = loadPage("pages/payment-result/payment-result.js", {
    "../../services/v2": { queryPayment: async () => ({ _id: "order-refunded", source: "WECHAT_PAY", status: "REFUNDED", pickupNumber: "020", buyerPoints: 10 }) },
    "../../utils/v2-cart": { clearCart: () => {} }
  }, wx);
  try {
    loaded.page.setData({ orderId: "order-refunded" });
    await loaded.page.query();
    assert.equal(loaded.page.data.loading, false);
    assert.equal(loaded.page.data.attempts, 0);
    assert.match(loaded.page.data.error, /积分已回收/);
  } finally { loaded.restore(); }
});

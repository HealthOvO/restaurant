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

test("member reads wait for the first home bootstrap instead of racing it", async () => {
  const servicePath = require.resolve(path.join(root, "services", "v2.js"));
  const previousWx = global.wx;
  const actions = [];
  let finishHome;
  global.wx = {
    cloud: {
      callFunction({ data }) {
        actions.push(data.action);
        if (data.action === "home.get") {
          return new Promise((resolve) => { finishHome = () => resolve({ result: { ok: true, data: { products: [] } } }); });
        }
        return Promise.resolve({ result: { ok: true, data: [] } });
      }
    }
  };
  delete require.cache[servicePath];
  try {
    const api = require(servicePath);
    const homeRequest = api.getHome();
    const ordersRequest = api.listOrders();
    await Promise.resolve();
    assert.deepEqual(actions, ["home.get"]);
    finishHome();
    await homeRequest;
    await ordersRequest;
    assert.deepEqual(actions, ["home.get", "order.listMine"]);
  } finally {
    delete require.cache[servicePath];
    if (previousWx === undefined) delete global.wx; else global.wx = previousWx;
  }
});

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
      mockPay: async (orderId) => calls.push(`pay:${orderId}`),
      queryPayment: async (orderId) => { calls.push(`query:${orderId}`); return { _id: orderId, status: "WAITING_FULFILLMENT" }; }
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }),
      clearCart: () => {},
      createRequestId: () => "order-request-123",
      loadCart: () => [],
      saveCart: () => {},
      validateCartLimits: () => ""
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2, amountText: "¥15.00" } });
    await loaded.page.submitOrder();
    assert.deepEqual(calls, ["pay:order-1", "query:order-1"]);
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
      mockPay: async () => {},
      queryPayment: async () => ({ _id: "mixed-order", status: "WAITING_FULFILLMENT" })
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 2, paidCount: 1, couponCount: 1, amount: 1500, discount: 1500, points: 10 }),
      clearCart: () => {}, createRequestId: () => "mixed-order-request", loadCart: () => [], saveCart: () => {}, validateCartLimits: () => ""
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
      mockPay: async () => {},
      queryPayment: async () => ({ _id: "new-order", status: "WAITING_FULFILLMENT" })
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }),
      clearCart: () => {},
      createRequestId: () => `order-request-${++sequence}`,
      loadCart: () => [],
      saveCart: () => {},
      validateCartLimits: () => ""
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

test("checkout refreshes a stale cart without discarding valid lines", async () => {
  const wx = wxMock();
  let savedCart = null;
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async () => { const error = new Error("商品价格或积分已更新"); error.code = "ORDER_QUOTE_CHANGED"; throw error; },
      getHome: async () => ({ products: [{ _id: "p1" }], coupons: [] })
    },
    "../../utils/v2-cart": {
      cartSummary: (cart) => ({ count: cart.length, amount: 1500, points: 2 }),
      createRequestId: () => "order-request-stale",
      loadCart: () => [],
      reconcileCart: (cart) => ({ cart, changed: true, removedCount: 0 }),
      saveCart: (cart) => { savedCart = cart; },
      validateCartLimits: () => ""
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2 } });
    await loaded.page.submitOrder();
    assert.equal(savedCart.length, 1);
    assert.equal(loaded.page.data.cart.length, 1);
    assert.equal(wx.modals[0].title, "购物车已更新");
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

test("invite binding resolves the inviter and asks for permanent confirmation first", async () => {
  const wx = wxMock();
  const calls = [];
  const loaded = loadPage("pages/profile/profile.js", {
    "../../services/v2": {
      resolveInvite: async (inviteCode) => { calls.push(`resolve:${inviteCode}`); return { memberCode: "M100", nickname: "小陈" }; },
      bindInvite: async (inviteCode) => { calls.push(`bind:${inviteCode}`); },
      getHome: async () => ({ member: { pointsBalance: 0 } }),
      getInviteOverview: async () => ({ inviteCode: "SELF", inviter: { memberCode: "M100" }, invitees: [] })
    },
    "../../utils/v2-format": { dateTime: (value) => value }
  }, wx);
  try {
    loaded.page.setData({ inviteInput: "ABC123", overview: { inviter: null, invitees: [] } });
    await loaded.page.bindInvite();
    assert.deepEqual(calls.slice(0, 2), ["resolve:ABC123", "bind:ABC123"]);
    assert.match(wx.modals[0].content, /邀请人：小陈/);
    assert.match(wx.modals[0].content, /无法更改/);
  } finally { loaded.restore(); }
});

test("home can configure a legacy coupon from the live product fallback", () => {
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
      home: { coupons: [{ _id: "coupon-1", productId: "product-1", productName: "祯好七福鼎肉片" }] },
      products: [{
        _id: "product-1", name: "祯好七福鼎肉片", basePrice: 1500,
        specGroups: [{ id: "spice", mode: "SINGLE", required: true, choices: [{ id: "mild", enabled: true, priceDelta: 0, isDefault: true }] }]
      }],
      cart: []
    });
    loaded.page.openCoupon({ currentTarget: { dataset: { id: "coupon-1" } } });
    assert.equal(loaded.page.data.activeProduct.name, "祯好七福鼎肉片");
    assert.equal(loaded.page.data.activeProduct.specGroups[0].choices[0].selected, true);
  } finally { loaded.restore(); }
});

test("requestPayment failure still queries the authoritative order result", async () => {
  const wx = wxMock();
  wx.requestPayment = (options) => options.fail({ errMsg: "requestPayment:fail system error" });
  const calls = [];
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async () => ({ order: { _id: "payment-failed", status: "PENDING_PAYMENT" }, payParams: { timeStamp: "1", nonceStr: "n", package: "prepay_id=x", paySign: "s" } }),
      queryPayment: async () => { calls.push("query"); return { _id: "payment-failed", status: "PENDING_PAYMENT" }; },
      cancelPayment: async () => { calls.push("cancel"); return { _id: "payment-failed", status: "CANCELLED" }; }
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }), createRequestId: () => "payment-failed-request",
      loadCart: () => [], saveCart: () => {}, validateCartLimits: () => ""
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2 } });
    await loaded.page.submitOrder();
    assert.deepEqual(calls, ["query"]);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=payment-failed");
  } finally { loaded.restore(); }
});

test("an explicit payment cancellation closes only after server confirmation", async () => {
  const wx = wxMock();
  wx.requestPayment = (options) => options.fail({ errMsg: "requestPayment:fail cancel" });
  const calls = [];
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async () => ({ order: { _id: "payment-cancelled", status: "PENDING_PAYMENT" }, payParams: { timeStamp: "1", nonceStr: "n", package: "prepay_id=x", paySign: "s" } }),
      queryPayment: async () => { calls.push("query"); return { _id: "payment-cancelled", status: "PENDING_PAYMENT" }; },
      cancelPayment: async () => { calls.push("cancel"); return { _id: "payment-cancelled", status: "CANCELLED" }; }
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }), createRequestId: () => "payment-cancelled-request",
      loadCart: () => [], saveCart: () => {}, validateCartLimits: () => ""
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2 } });
    await loaded.page.submitOrder();
    assert.deepEqual(calls, ["query", "cancel"]);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=payment-cancelled");
  } finally { loaded.restore(); }
});

test("a cancel callback never closes an order already confirmed as paid", async () => {
  const wx = wxMock();
  wx.requestPayment = (options) => options.fail({ errMsg: "requestPayment:fail cancel" });
  let cancelCalls = 0;
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async () => ({ order: { _id: "cancel-but-paid", status: "PENDING_PAYMENT" }, payParams: { timeStamp: "1", nonceStr: "n", package: "prepay_id=x", paySign: "s" } }),
      queryPayment: async () => ({ _id: "cancel-but-paid", status: "WAITING_FULFILLMENT" }),
      cancelPayment: async () => { cancelCalls += 1; return { _id: "cancel-but-paid", status: "CANCELLED" }; }
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }), createRequestId: () => "cancel-but-paid-request",
      loadCart: () => [], saveCart: () => {}, validateCartLimits: () => ""
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }], summary: { count: 1, amount: 1500, points: 2 } });
    await loaded.page.submitOrder();
    assert.equal(cancelCalls, 0);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=cancel-but-paid");
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
  let clearCount = 0;
  wx.setStorageSync("v2-checkout-request", "request-refunded");
  const loaded = loadPage("pages/payment-result/payment-result.js", {
    "../../services/v2": { queryPayment: async () => ({ _id: "order-refunded", source: "WECHAT_PAY", status: "REFUNDED", pickupNumber: "020", buyerPoints: 10 }) },
    "../../utils/v2-cart": { clearCart: () => { clearCount += 1; } }
  }, wx);
  try {
    loaded.page.setData({ orderId: "order-refunded" });
    await loaded.page.query();
    assert.equal(loaded.page.data.loading, false);
    assert.equal(loaded.page.data.attempts, 0);
    assert.match(loaded.page.data.error, /积分已回收/);
    assert.equal(clearCount, 1);
    assert.equal(wx.getStorageSync("v2-checkout-request"), undefined);
  } finally { loaded.restore(); }
});

test("payment result keeps only one query in flight", async () => {
  const wx = wxMock();
  let finishQuery;
  let calls = 0;
  const loaded = loadPage("pages/payment-result/payment-result.js", {
    "../../services/v2": {
      queryPayment: () => {
        calls += 1;
        return new Promise((resolve) => { finishQuery = resolve; });
      }
    },
    "../../utils/v2-cart": { clearCart: () => {} }
  }, wx);
  try {
    loaded.page.setData({ orderId: "order-one-query" });
    const first = loaded.page.query();
    const second = loaded.page.query();
    assert.equal(first, second);
    assert.equal(calls, 1);
    finishQuery({ _id: "order-one-query", status: "WAITING_FULFILLMENT", pickupNumber: "021" });
    await first;
    assert.equal(loaded.page.data.order.pickupNumber, "021");
  } finally { loaded.restore(); }
});

test("manual payment-result retry resets an exhausted attempt counter", async () => {
  const wx = wxMock();
  const loaded = loadPage("pages/payment-result/payment-result.js", {
    "../../services/v2": { queryPayment: async () => ({ _id: "order-retry", status: "WAITING_FULFILLMENT", pickupNumber: "022" }) },
    "../../utils/v2-cart": { clearCart: () => {} }
  }, wx);
  try {
    loaded.page.setData({ orderId: "order-retry", attempts: 11 });
    loaded.page.visible = true;
    loaded.page.polling = true;
    loaded.page.pollToken = 1;
    loaded.page.continueOrStop(1, null, "网络连接失败");
    assert.equal(loaded.page.data.loading, false);
    assert.equal(loaded.page.polling, false);
    await loaded.page.query();
    assert.equal(loaded.page.data.attempts, 0);
    assert.equal(loaded.page.data.order.pickupNumber, "022");
  } finally { loaded.restore(); }
});

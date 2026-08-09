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
    redirects: [], toasts: [],
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    redirectTo(options) { this.redirects.push(options); },
    showToast(options) { this.toasts.push(options); }
  };
}

test("checkout completes mock payment before opening the result page", async () => {
  const wx = wxMock();
  const calls = [];
  const loaded = loadPage("pages/checkout/checkout.js", {
    "../../services/v2": {
      createOrder: async () => ({ order: { _id: "order-1", status: "PENDING_PAYMENT" }, payParams: { mode: "MOCK" } }),
      mockPay: async (orderId) => calls.push(orderId)
    },
    "../../utils/v2-cart": {
      cartSummary: () => ({ count: 1, amount: 1500, points: 2 }),
      createRequestId: () => "order-request-123",
      loadCart: () => [],
      saveCart: () => {}
    }
  }, wx);
  try {
    loaded.page.setData({ cart: [{ productId: "p1", quantity: 1, selections: [] }] });
    await loaded.page.submitOrder();
    assert.deepEqual(calls, ["order-1"]);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=order-1");
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
      product: { specGroups: [{ id: "spice", required: true, choices: [{ id: "mild", selected: true }] }] }
    });
    await loaded.page.submit();
    assert.deepEqual(payload.selections, [{ groupId: "spice", choiceIds: ["mild"] }]);
    assert.equal(wx.redirects[0].url, "/pages/payment-result/payment-result?orderId=coupon-order-1");
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

test("coupon pickup result preserves an unrelated paid cart", async () => {
  const wx = wxMock();
  let clearCount = 0;
  const loaded = loadPage("pages/payment-result/payment-result.js", {
    "../../services/v2": { queryPayment: async () => ({ _id: "coupon-order-1", source: "COUPON", status: "WAITING_FULFILLMENT", pickupNumber: "019" }) },
    "../../utils/v2-cart": { clearCart: () => { clearCount += 1; } }
  }, wx);
  try {
    loaded.page.setData({ orderId: "coupon-order-1" });
    await loaded.page.query();
    assert.equal(clearCount, 0);
    assert.equal(loaded.page.data.order.pickupNumber, "019");
  } finally { loaded.restore(); }
});

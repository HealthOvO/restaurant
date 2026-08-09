const test = require("node:test");
const assert = require("node:assert/strict");

const cartPath = require.resolve("../miniprogram/utils/v2-cart");
const formatPath = require.resolve("../miniprogram/utils/v2-format");

test("cart merges identical selections and calculates integer points", () => {
  const previousWx = global.wx;
  const storage = new Map();
  global.wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key)
  };
  delete require.cache[cartPath];
  try {
    const { addCartLine, addCouponLine, cartSummary, loadCart, reconcileCart, saveCart } = require(cartPath);
    const base = { productId: "p1", unitPrice: 1600, buyerPointsPerUnit: 3, selections: [{ groupId: "spice", choiceIds: ["mild"] }] };
    const first = addCartLine([], { ...base, quantity: 2 });
    const merged = addCartLine(first, { ...base, quantity: 1 });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].quantity, 3);
    assert.deepEqual(cartSummary(merged), { count: 3, paidCount: 3, couponCount: 0, amount: 4800, discount: 0, points: 9 });
    storage.set("v2-checkout-request", "stale-request");
    saveCart(merged);
    assert.deepEqual(loadCart(), merged);
    assert.equal(storage.has("v2-checkout-request"), false);
    assert.throws(() => addCartLine(merged, { ...base, quantity: 97 }), /最多放 99 份/);
    assert.throws(() => addCartLine([{ ...base, key: "p1|a", quantity: 60 }], {
      ...base,
      selections: [{ groupId: "spice", choiceIds: ["hot"] }],
      quantity: 40
    }), /最多放 99 份/);

    const stale = [{
      key: "p1|spice:mild",
      productId: "p1",
      productName: "福鼎肉片",
      unitPrice: 1200,
      buyerPointsPerUnit: 1,
      quantity: 1,
      selections: [{ groupId: "spice", choiceIds: ["mild"] }],
      selectedChoices: [{ groupName: "辣度", choiceName: "旧微辣", priceDelta: 0 }]
    }];
    const reconciled = reconcileCart(stale, [{
      _id: "p1",
      name: "雄飞肉片",
      enabled: true,
      soldOut: false,
      imageUrl: "",
      basePrice: 1500,
      pointsEnabled: true,
      buyerPointsPerUnit: 10,
      specGroups: [{ id: "spice", name: "辣度", mode: "SINGLE", required: true, choices: [{ id: "mild", name: "微辣", enabled: true, priceDelta: 0 }] }]
    }]);
    assert.equal(reconciled.changed, true);
    assert.equal(reconciled.cart[0].productName, "雄飞肉片");
    assert.equal(reconciled.cart[0].unitPrice, 1500);
    assert.equal(reconciled.cart[0].buyerPointsPerUnit, 10);
    assert.equal(reconciled.cart[0].selectedChoices[0].choiceName, "微辣");

    const withCoupon = addCouponLine(reconciled.cart, {
      couponId: "coupon-1", couponName: "肉片券", productId: "p1", productName: "雄飞肉片",
      basePrice: 1500, originalUnitPrice: 1500, selections: [], selectedChoices: []
    });
    assert.deepEqual(cartSummary(withCoupon), { count: 2, paidCount: 1, couponCount: 1, amount: 1500, discount: 1500, points: 10 });
    assert.throws(() => addCouponLine(withCoupon, {
      couponId: "coupon-1", productId: "p1", productName: "雄飞肉片", selections: []
    }), /已经在购物车/);
  } finally {
    delete require.cache[cartPath];
    if (previousWx === undefined) delete global.wx; else global.wx = previousWx;
  }
});

test("order and point formatting distinguishes payment, coupon and mixed orders", () => {
  delete require.cache[formatPath];
  const { prepareOrder, preparePoint } = require(formatPath);
  const coupon = prepareOrder({ source: "COUPON", status: "WAITING_FULFILLMENT", lineItems: [{ productName: "雄飞肉片", quantity: 1 }], itemCount: 1 });
  assert.equal(coupon.sourceText, "商品券");
  assert.equal(coupon.amountText, "商品券抵扣");
  assert.equal(coupon.statusText, "制作中");
  const mixed = prepareOrder({ source: "MIXED", status: "WAITING_FULFILLMENT", paidAmount: 1500, couponApplications: [{ couponId: "c1" }], lineItems: [], itemCount: 2 });
  assert.equal(mixed.sourceText, "支付 + 商品券");
  assert.equal(mixed.couponCount, 1);
  const reward = preparePoint({ type: "INVITE_REWARD", amount: 2, balanceAfter: 8 });
  assert.equal(reward.titleText, "邀请奖励积分");
  assert.equal(reward.amountText, "+2");
});

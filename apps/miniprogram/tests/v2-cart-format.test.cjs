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
    const { addCartLine, cartSummary, loadCart, saveCart } = require(cartPath);
    const base = { productId: "p1", unitPrice: 1600, buyerPointsPerUnit: 3, selections: [{ groupId: "spice", choiceIds: ["mild"] }] };
    const first = addCartLine([], { ...base, quantity: 2 });
    const merged = addCartLine(first, { ...base, quantity: 1 });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].quantity, 3);
    assert.deepEqual(cartSummary(merged), { count: 3, amount: 4800, points: 9 });
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
  } finally {
    delete require.cache[cartPath];
    if (previousWx === undefined) delete global.wx; else global.wx = previousWx;
  }
});

test("order and point formatting distinguishes payment and coupon orders", () => {
  delete require.cache[formatPath];
  const { prepareOrder, preparePoint } = require(formatPath);
  const coupon = prepareOrder({ source: "COUPON", status: "WAITING_FULFILLMENT", lineItems: [{ productName: "福鼎肉片", quantity: 1 }], itemCount: 1 });
  assert.equal(coupon.sourceText, "商品券");
  assert.equal(coupon.amountText, "商品券抵扣");
  assert.equal(coupon.statusText, "制作中");
  const reward = preparePoint({ type: "INVITE_REWARD", amount: 2, balanceAfter: 8 });
  assert.equal(reward.titleText, "邀请奖励积分");
  assert.equal(reward.amountText, "+2");
});

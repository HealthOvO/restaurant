const test = require("node:test");
const assert = require("node:assert/strict");

const { loadCart, saveCart, updateCartItemQuantity, MAX_CART_ITEM_QUANTITY } = require("../miniprogram/utils/cart");

function createWxMock() {
  const storage = new Map();
  return {
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    getStorageSync(key) {
      return storage.get(key);
    },
    removeStorageSync(key) {
      storage.delete(key);
    }
  };
}

function withWxMock(run) {
  const previousWx = global.wx;
  global.wx = createWxMock();

  try {
    run(global.wx);
  } finally {
    if (typeof previousWx === "undefined") {
      delete global.wx;
    } else {
      global.wx = previousWx;
    }
  }
}

test("cart utils clamp quantity and recompute stale line totals while loading", () => {
  withWxMock(() => {
    saveCart("default-store", [
      {
        lineId: "dish-1",
        menuItemId: "dish-1",
        quantity: 120,
        unitPrice: 18,
        lineTotal: 1
      }
    ]);

    const items = loadCart("default-store");

    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, MAX_CART_ITEM_QUANTITY);
    assert.equal(items[0].lineTotal, MAX_CART_ITEM_QUANTITY * 18);
  });
});

test("cart utils cap manual quantity updates and remove lines when quantity drops to zero", () => {
  withWxMock(() => {
    saveCart("default-store", [
      {
        lineId: "dish-2",
        menuItemId: "dish-2",
        quantity: 1,
        unitPrice: 25,
        lineTotal: 25
      }
    ]);

    updateCartItemQuantity("default-store", "dish-2", 999);
    let items = loadCart("default-store");
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, MAX_CART_ITEM_QUANTITY);
    assert.equal(items[0].lineTotal, MAX_CART_ITEM_QUANTITY * 25);

    updateCartItemQuantity("default-store", "dish-2", 0);
    items = loadCart("default-store");
    assert.equal(items.length, 0);
  });
});

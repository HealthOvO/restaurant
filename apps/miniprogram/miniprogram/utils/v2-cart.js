const STORAGE_KEY = "fuding-cart-v2";
const CHECKOUT_REQUEST_KEY = "v2-checkout-request";
const MAX_CART_QUANTITY = 99;

function loadCart() {
  const value = wx.getStorageSync(STORAGE_KEY);
  return Array.isArray(value) ? value : [];
}

function saveCart(cart) {
  wx.setStorageSync(STORAGE_KEY, Array.isArray(cart) ? cart : []);
  wx.removeStorageSync(CHECKOUT_REQUEST_KEY);
}

function clearCart() {
  wx.removeStorageSync(STORAGE_KEY);
  wx.removeStorageSync(CHECKOUT_REQUEST_KEY);
  const app = typeof getApp === "function" ? getApp() : null;
  if (app && app.globalData) app.globalData.cart = [];
}

function cartSummary(cart) {
  return (Array.isArray(cart) ? cart : []).reduce((result, item) => ({
    count: result.count + item.quantity,
    amount: result.amount + item.unitPrice * item.quantity,
    points: result.points + item.buyerPointsPerUnit * item.quantity
  }), { count: 0, amount: 0, points: 0 });
}

function selectionKey(productId, selections) {
  const key = (selections || [])
    .map((selection) => `${selection.groupId}:${[...(selection.choiceIds || [])].sort().join(",")}`)
    .sort()
    .join("|");
  return `${productId}|${key}`;
}

function addCartLine(cart, line) {
  const currentQuantity = cartSummary(cart).count;
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || currentQuantity + line.quantity > MAX_CART_QUANTITY) {
    const error = new Error(`购物车最多放 ${MAX_CART_QUANTITY} 份`);
    error.code = "CART_QUANTITY_LIMIT";
    throw error;
  }
  const key = selectionKey(line.productId, line.selections);
  const existingIndex = cart.findIndex((item) => item.key === key);
  if (existingIndex >= 0) {
    const next = [...cart];
    next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + line.quantity };
    return next;
  }
  return [...cart, { ...line, key }];
}

function createRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = { MAX_CART_QUANTITY, loadCart, saveCart, clearCart, cartSummary, addCartLine, createRequestId };

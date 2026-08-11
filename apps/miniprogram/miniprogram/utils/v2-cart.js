const STORAGE_KEY = "fuding-cart-v2";
const CHECKOUT_REQUEST_KEY = "v2-checkout-request";
const MAX_CART_QUANTITY = 99;
const MAX_PAID_LINE_ITEMS = 30;
const MAX_COUPON_ITEMS = 5;

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

function lineKind(item) {
  return item && item.kind === "COUPON" ? "COUPON" : "PAID";
}

function cartSummary(cart) {
  return (Array.isArray(cart) ? cart : []).reduce((result, item) => {
    const kind = lineKind(item);
    const quantity = kind === "COUPON" ? 1 : Number(item.quantity || 0);
    return {
      count: result.count + quantity,
      paidCount: result.paidCount + (kind === "PAID" ? quantity : 0),
      couponCount: result.couponCount + (kind === "COUPON" ? 1 : 0),
      amount: result.amount + (kind === "PAID" ? Number(item.unitPrice || 0) * quantity : 0),
      discount: result.discount + (kind === "COUPON" ? Number(item.originalUnitPrice || item.basePrice || 0) : 0),
      points: result.points + (kind === "PAID" ? Number(item.buyerPointsPerUnit || 0) * quantity : 0)
    };
  }, { count: 0, paidCount: 0, couponCount: 0, amount: 0, discount: 0, points: 0 });
}

function selectionKey(productId, selections) {
  const key = (selections || [])
    .map((selection) => `${selection.groupId}:${[...(selection.choiceIds || [])].sort().join(",")}`)
    .sort()
    .join("|");
  return `paid|${productId}|${key}`;
}

function couponKey(couponId) {
  return `coupon|${couponId}`;
}

function validateCartLimits(cart) {
  const rows = Array.isArray(cart) ? cart : [];
  const summary = cartSummary(rows);
  const paidLineCount = rows.filter((item) => lineKind(item) === "PAID").length;
  const couponCount = rows.filter((item) => lineKind(item) === "COUPON").length;
  if (summary.count > MAX_CART_QUANTITY) return `购物车最多放 ${MAX_CART_QUANTITY} 份`;
  if (paidLineCount > MAX_PAID_LINE_ITEMS) return `购物车最多选择 ${MAX_PAID_LINE_ITEMS} 种商品规格`;
  if (couponCount > MAX_COUPON_ITEMS) return `每单最多使用 ${MAX_COUPON_ITEMS} 张商品券`;
  return "";
}

function normalizeSelections(product, source, couponMode) {
  const groups = product.specGroups || [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const sourceSelections = source.selections || [];
  const selectionByGroup = new Map(sourceSelections.map((selection) => [selection.groupId, selection.choiceIds || []]));
  let valid = sourceSelections.every((selection) => groupById.has(selection.groupId));
  let optionPrice = 0;
  const selections = [];
  const selectedChoices = [];

  for (const group of groups) {
    const choiceIds = [...new Set(selectionByGroup.get(group.id) || [])];
    const choices = choiceIds.map((choiceId) => (group.choices || []).find((choice) => choice.id === choiceId && choice.enabled));
    if (choices.some((choice) => !choice)
      || (group.required && choices.length === 0)
      || (group.mode === "SINGLE" && choices.length > 1)
      || (group.mode === "MULTIPLE" && group.maxSelect && choices.length > group.maxSelect)) {
      valid = false;
      break;
    }
    const validChoices = choices.filter(Boolean);
    if (couponMode && validChoices.some((choice) => choice.priceDelta > 0)) {
      valid = false;
      break;
    }
    selections.push({ groupId: group.id, choiceIds: validChoices.map((choice) => choice.id) });
    validChoices.forEach((choice) => {
      optionPrice += choice.priceDelta;
      selectedChoices.push({ groupName: group.name, choiceName: choice.name, priceDelta: choice.priceDelta });
    });
  }
  return { valid, optionPrice, selections, selectedChoices };
}

function reconcileCart(cart, products, coupons) {
  const productById = new Map((products || []).map((product) => [product._id, product]));
  const couponById = new Map((coupons || []).map((coupon) => [coupon._id, coupon]));
  const next = [];
  let changed = false;
  let removedCount = 0;
  let totalQuantity = 0;
  let paidLineCount = 0;
  let couponCount = 0;

  for (const source of Array.isArray(cart) ? cart : []) {
    const kind = lineKind(source);
    if (kind === "COUPON") {
      const coupon = couponById.get(source.couponId);
      const product = coupon && (coupon.productSnapshot || coupon.product || productById.get(coupon.productId));
      if (!coupon || coupon.status !== "AVAILABLE" || totalQuantity >= MAX_CART_QUANTITY || couponCount >= MAX_COUPON_ITEMS) {
        changed = true;
        removedCount += 1;
        continue;
      }
      if (!product) {
        changed = true;
        removedCount += 1;
        continue;
      }
      const normalizedSelections = normalizeSelections({ ...product, enabled: true, soldOut: false }, source, true);
      if (!normalizedSelections.valid) {
        changed = true;
        removedCount += 1;
        continue;
      }
      const normalized = {
        kind: "COUPON",
        key: couponKey(coupon._id),
        couponId: coupon._id,
        couponName: coupon.name,
        productId: coupon.productId,
        productName: coupon.productName,
        imageUrl: product.imageUrl,
        basePrice: product.basePrice,
        originalUnitPrice: product.basePrice + normalizedSelections.optionPrice,
        unitPrice: 0,
        buyerPointsPerUnit: 0,
        quantity: 1,
        selections: normalizedSelections.selections,
        selectedChoices: normalizedSelections.selectedChoices
      };
      next.push(normalized);
      totalQuantity += 1;
      couponCount += 1;
      if (JSON.stringify(normalized) !== JSON.stringify(source)) changed = true;
      continue;
    }

    const product = productById.get(source.productId);
    if (!product || !product.enabled || product.soldOut || !Number.isInteger(source.quantity) || source.quantity < 1) {
      changed = true;
      removedCount += 1;
      continue;
    }
    const normalizedSelections = normalizeSelections(product, source, false);
    if (!normalizedSelections.valid || totalQuantity >= MAX_CART_QUANTITY) {
      changed = true;
      removedCount += 1;
      continue;
    }
    const quantity = Math.min(source.quantity, MAX_CART_QUANTITY - totalQuantity);
    const normalized = {
      ...source,
      kind: "PAID",
      key: selectionKey(product._id, normalizedSelections.selections),
      productId: product._id,
      productName: product.name,
      imageUrl: product.imageUrl,
      basePrice: product.basePrice,
      unitPrice: product.basePrice + normalizedSelections.optionPrice,
      buyerPointsPerUnit: product.pointsEnabled ? product.buyerPointsPerUnit : 0,
      quantity,
      selections: normalizedSelections.selections,
      selectedChoices: normalizedSelections.selectedChoices
    };
    const duplicate = next.find((item) => item.kind === "PAID" && item.key === normalized.key);
    if (duplicate) {
      duplicate.quantity += quantity;
      changed = true;
    } else {
      if (paidLineCount >= MAX_PAID_LINE_ITEMS) {
        changed = true;
        removedCount += 1;
        continue;
      }
      next.push(normalized);
      paidLineCount += 1;
    }
    totalQuantity += quantity;
    if (quantity !== source.quantity || JSON.stringify(normalized) !== JSON.stringify(source)) changed = true;
  }

  return { cart: next, changed, removedCount };
}

function addCartLine(cart, line) {
  const currentQuantity = cartSummary(cart).count;
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || currentQuantity + line.quantity > MAX_CART_QUANTITY) {
    const error = new Error(`购物车最多放 ${MAX_CART_QUANTITY} 份`);
    error.code = "CART_QUANTITY_LIMIT";
    throw error;
  }
  const key = selectionKey(line.productId, line.selections);
  const existingIndex = cart.findIndex((item) => lineKind(item) === "PAID" && item.key === key);
  const paidLineCount = cart.filter((item) => lineKind(item) === "PAID").length;
  if (existingIndex < 0 && paidLineCount >= MAX_PAID_LINE_ITEMS) {
    const error = new Error(`购物车最多选择 ${MAX_PAID_LINE_ITEMS} 种商品规格`);
    error.code = "CART_PAID_LINE_LIMIT";
    throw error;
  }
  if (existingIndex >= 0) {
    const next = [...cart];
    next[existingIndex] = { ...next[existingIndex], kind: "PAID", quantity: next[existingIndex].quantity + line.quantity };
    return next;
  }
  return [...cart, { ...line, kind: "PAID", key }];
}

function addCouponLine(cart, line) {
  if (!line.couponId) throw new Error("商品券信息不完整");
  if (cart.some((item) => lineKind(item) === "COUPON" && item.couponId === line.couponId)) {
    const error = new Error("这张商品券已经在购物车里");
    error.code = "COUPON_ALREADY_IN_CART";
    throw error;
  }
  if (cartSummary(cart).count >= MAX_CART_QUANTITY) {
    const error = new Error(`购物车最多放 ${MAX_CART_QUANTITY} 份`);
    error.code = "CART_QUANTITY_LIMIT";
    throw error;
  }
  if (cart.filter((item) => lineKind(item) === "COUPON").length >= MAX_COUPON_ITEMS) {
    const error = new Error(`每单最多使用 ${MAX_COUPON_ITEMS} 张商品券`);
    error.code = "CART_COUPON_LIMIT";
    throw error;
  }
  return [...cart, { ...line, kind: "COUPON", key: couponKey(line.couponId), quantity: 1, unitPrice: 0, buyerPointsPerUnit: 0 }];
}

function changeCartQuantity(cart, key, offset) {
  const index = cart.findIndex((item) => item.key === key);
  if (index < 0) return cart;
  const item = cart[index];
  if (lineKind(item) === "COUPON") return offset < 0 ? cart.filter((row) => row.key !== key) : cart;
  const delta = Number(offset || 0);
  if (!Number.isInteger(delta)) return cart;
  if (delta > 0 && cartSummary(cart).count + delta > MAX_CART_QUANTITY) {
    const error = new Error(`购物车最多放 ${MAX_CART_QUANTITY} 份`);
    error.code = "CART_QUANTITY_LIMIT";
    throw error;
  }
  const quantity = item.quantity + delta;
  if (quantity <= 0) return cart.filter((row) => row.key !== key);
  return cart.map((row) => row.key === key ? { ...row, quantity: Math.min(99, quantity) } : row);
}

function removeCartLine(cart, key) {
  return cart.filter((item) => item.key !== key);
}

function createRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  MAX_CART_QUANTITY,
  MAX_PAID_LINE_ITEMS,
  MAX_COUPON_ITEMS,
  loadCart,
  saveCart,
  clearCart,
  lineKind,
  cartSummary,
  validateCartLimits,
  addCartLine,
  addCouponLine,
  changeCartQuantity,
  removeCartLine,
  reconcileCart,
  createRequestId
};

const CART_KEY_PREFIX = "menuCart:";
const MAX_CART_ITEM_QUANTITY = 99;

function buildCartKey(storeId) {
  return `${CART_KEY_PREFIX}${storeId || "default-store"}`;
}

function normalizeQuantity(value) {
  const quantity = Math.trunc(Number(value) || 0);
  if (quantity <= 0) {
    return 0;
  }

  return Math.min(MAX_CART_ITEM_QUANTITY, quantity);
}

function normalizeCartItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && item.menuItemId)
    .map((item) => ({
      lineId: item.lineId,
      menuItemId: item.menuItemId,
      categoryId: item.categoryId,
      name: item.name,
      imageUrl: item.imageUrl,
      quantity: normalizeQuantity(item.quantity),
      basePrice: Number(item.basePrice) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      lineTotal: normalizeQuantity(item.quantity) * (Number(item.unitPrice) || 0),
      selectedOptions: Array.isArray(item.selectedOptions) ? item.selectedOptions : [],
      note: item.note || ""
    }))
    .filter((item) => item.quantity > 0);
}

function loadCart(storeId) {
  return normalizeCartItems(wx.getStorageSync(buildCartKey(storeId)));
}

function saveCart(storeId, items) {
  const normalizedItems = normalizeCartItems(items);
  wx.setStorageSync(buildCartKey(storeId), normalizedItems);
  return normalizedItems;
}

function clearCart(storeId) {
  wx.removeStorageSync(buildCartKey(storeId));
  return [];
}

function summarizeCart(items) {
  const normalizedItems = normalizeCartItems(items);
  return normalizedItems.reduce(
    (summary, item) => {
      summary.itemCount += item.quantity;
      summary.totalAmount += item.lineTotal;
      return summary;
    },
    {
      itemCount: 0,
      totalAmount: 0
    }
  );
}

function buildCartLineId(menuItemId, selectedOptions) {
  const optionKey = (selectedOptions || [])
    .map((item) => `${item.groupId}:${item.choiceId}`)
    .sort()
    .join("|");

  return optionKey ? `${menuItemId}__${optionKey}` : menuItemId;
}

function addCartItem(storeId, item) {
  const currentItems = loadCart(storeId);
  const existingIndex = currentItems.findIndex((current) => current.lineId === item.lineId);
  if (existingIndex >= 0) {
    const existing = currentItems[existingIndex];
    const quantity = normalizeQuantity(existing.quantity + (Number(item.quantity) || 0));
    currentItems[existingIndex] = {
      ...existing,
      quantity,
      lineTotal: quantity * existing.unitPrice
    };
  } else {
    const quantity = normalizeQuantity(item.quantity || 1) || 1;
    currentItems.push({
      ...item,
      quantity,
      lineTotal: quantity * (Number(item.unitPrice) || 0)
    });
  }

  return saveCart(storeId, currentItems);
}

function updateCartItemQuantity(storeId, lineId, nextQuantity) {
  const currentItems = loadCart(storeId);
  const updatedItems = currentItems
    .map((item) => {
      if (item.lineId !== lineId) {
        return item;
      }

      const quantity = normalizeQuantity(nextQuantity);
      if (quantity <= 0) {
        return null;
      }

      return {
        ...item,
        quantity,
        lineTotal: quantity * item.unitPrice
      };
    })
    .filter(Boolean);

  return saveCart(storeId, updatedItems);
}

module.exports = {
  MAX_CART_ITEM_QUANTITY,
  loadCart,
  saveCart,
  clearCart,
  summarizeCart,
  buildCartLineId,
  addCartItem,
  updateCartItemQuantity
};

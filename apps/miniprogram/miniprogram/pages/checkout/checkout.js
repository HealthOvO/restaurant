const { previewOrder, createOrder, fetchMenuCatalog } = require("../../services/order");
const { getAppState } = require("../../utils/session");
const { loadCart, summarizeCart, clearCart } = require("../../utils/cart");

function createOrderRequestId() {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatAmount(value) {
  return Number(value || 0).toFixed(0);
}

function buildPayloadItems(cartItems) {
  return (cartItems || []).map((item) => ({
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    note: item.note || "",
    selectedOptions: (item.selectedOptions || []).map((option) => ({
      groupId: option.groupId,
      choiceId: option.choiceId
    }))
  }));
}

function decorateCartItems(cartItems) {
  return (cartItems || []).map((item) => ({
    ...item,
    lineTotalText: formatAmount(item.lineTotal),
    selectedOptionsText:
      item.selectedOptions && item.selectedOptions.length
        ? item.selectedOptions.map((option) => option.choiceName).join(" / ")
      : ""
  }));
}

function buildOrderContext(data, overrides) {
  const fulfillmentMode = overrides && overrides.fulfillmentMode ? overrides.fulfillmentMode : data.fulfillmentMode;
  const tableNo =
    overrides && Object.prototype.hasOwnProperty.call(overrides, "tableNo") ? overrides.tableNo : data.tableNo;
  const contactName =
    overrides && Object.prototype.hasOwnProperty.call(overrides, "contactName") ? overrides.contactName : data.contactName;
  const contactPhone =
    overrides && Object.prototype.hasOwnProperty.call(overrides, "contactPhone")
      ? overrides.contactPhone
      : data.contactPhone;
  const remark =
    overrides && Object.prototype.hasOwnProperty.call(overrides, "remark") ? overrides.remark : data.remark;

  return {
    fulfillmentMode,
    tableNo: fulfillmentMode === "DINE_IN" ? (tableNo || "").trim() : "",
    contactName: fulfillmentMode === "PICKUP" ? (contactName || "").trim() : "",
    contactPhone: fulfillmentMode === "PICKUP" ? (contactPhone || "").trim() : "",
    remark: (remark || "").trim()
  };
}

function resolveModeSupport(storeConfig) {
  return {
    dineInEnabled: !storeConfig || storeConfig.dineInEnabled !== false,
    pickupEnabled: !storeConfig || storeConfig.pickupEnabled !== false
  };
}

function isModeEnabled(fulfillmentMode, storeConfig) {
  const support = resolveModeSupport(storeConfig);
  if (fulfillmentMode === "DINE_IN") {
    return support.dineInEnabled;
  }
  if (fulfillmentMode === "PICKUP") {
    return support.pickupEnabled;
  }
  return true;
}

function resolveAvailableFulfillmentMode(preferredMode, storeConfig) {
  if (isModeEnabled(preferredMode, storeConfig)) {
    return preferredMode;
  }

  if (isModeEnabled("DINE_IN", storeConfig)) {
    return "DINE_IN";
  }

  if (isModeEnabled("PICKUP", storeConfig)) {
    return "PICKUP";
  }

  return preferredMode;
}

function resolveModeDisabledMessage(fulfillmentMode) {
  return fulfillmentMode === "DINE_IN" ? "堂食暂未开启" : "自提暂未开启";
}

function getSubmitValidationMessage(orderContext, storeConfig) {
  if (!isModeEnabled(orderContext.fulfillmentMode, storeConfig)) {
    return resolveModeDisabledMessage(orderContext.fulfillmentMode);
  }

  if (orderContext.fulfillmentMode === "DINE_IN" && !orderContext.tableNo) {
    return "堂食请先填写桌号";
  }

  if (orderContext.fulfillmentMode === "PICKUP" && !orderContext.contactName) {
    return "自提请填写联系人";
  }

  return "";
}

function getCachedStoreConfig(storeId) {
  if (!storeId) {
    return null;
  }

  const appState = getAppState();
  const cache = appState.storeConfigCache || {};
  return cache[storeId] || null;
}

function cacheStoreConfig(storeId, storeConfig) {
  if (!storeId || !storeConfig) {
    return;
  }

  const appState = getAppState();
  appState.storeConfigCache = {
    ...(appState.storeConfigCache || {}),
    [storeId]: storeConfig
  };
}

Page({
  data: {
    loading: true,
    submitting: false,
    errorMessage: "",
    cartItems: [],
    itemCount: 0,
    totalAmount: 0,
    totalAmountText: "0",
    fulfillmentMode: "DINE_IN",
    tableNo: "",
    contactName: "",
    contactPhone: "",
    remark: "",
    storeConfig: null,
    supportDineIn: true,
    supportPickup: true
  },
  onShow() {
    this.refresh();
  },
  async refreshPreview(cartItems, overrides) {
    if (!cartItems.length) {
      this.setData({
        loading: false,
        totalAmountText: "0"
      });
      return;
    }

    try {
      const orderContext = buildOrderContext(this.data, overrides);
      const normalizedMode = resolveAvailableFulfillmentMode(orderContext.fulfillmentMode, this.data.storeConfig);
      const normalizedContext =
        normalizedMode === orderContext.fulfillmentMode
          ? orderContext
          : buildOrderContext(
              {
                ...this.data,
                fulfillmentMode: normalizedMode
              },
              {
                ...overrides,
                fulfillmentMode: normalizedMode
              }
            );
      const response = await previewOrder({
        fulfillmentMode: normalizedContext.fulfillmentMode,
        tableNo: normalizedContext.tableNo,
        contactName: normalizedContext.contactName,
        contactPhone: normalizedContext.contactPhone,
        remark: normalizedContext.remark,
        items: buildPayloadItems(cartItems)
      });

      const storeConfig = response.storeConfig || this.data.storeConfig;
      cacheStoreConfig(getAppState().storeId, storeConfig);
      const support = resolveModeSupport(storeConfig);
      const effectiveMode = resolveAvailableFulfillmentMode(normalizedContext.fulfillmentMode, storeConfig);
      const nextContext =
        effectiveMode === normalizedContext.fulfillmentMode
          ? normalizedContext
          : buildOrderContext(
              {
                ...this.data,
                fulfillmentMode: effectiveMode
              },
              {
                ...overrides,
                fulfillmentMode: effectiveMode
              }
            );

      this.setData({
        storeConfig,
        supportDineIn: support.dineInEnabled,
        supportPickup: support.pickupEnabled,
        fulfillmentMode: effectiveMode,
        tableNo: nextContext.tableNo,
        contactName: nextContext.contactName,
        contactPhone: nextContext.contactPhone,
        remark: nextContext.remark,
        totalAmount: response.preview.payableAmount,
        totalAmountText: formatAmount(response.preview.payableAmount)
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "订单预览失败，请返回购物车重试"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  async refresh() {
    this.setData({
      loading: true,
      errorMessage: ""
    });

    const appState = getAppState();
    const cartItems = decorateCartItems(loadCart(appState.storeId));
    const summary = summarizeCart(cartItems);
    const tableNo = appState.activeTableNo || "";
    const cachedStoreConfig = getCachedStoreConfig(appState.storeId) || this.data.storeConfig;
    const shouldFetchMenuCatalog = !cachedStoreConfig || cartItems.length === 0;
    const menuCatalog = shouldFetchMenuCatalog ? await fetchMenuCatalog().catch(() => null) : null;
    const storeConfig = menuCatalog ? menuCatalog.storeConfig : cachedStoreConfig;
    cacheStoreConfig(appState.storeId, storeConfig);
    const support = resolveModeSupport(storeConfig);
    const defaultMode = tableNo ? "DINE_IN" : this.data.fulfillmentMode;
    const fulfillmentMode = resolveAvailableFulfillmentMode(defaultMode, storeConfig);
    const normalizedTableNo = fulfillmentMode === "DINE_IN" ? tableNo : "";
    this.setData({
      cartItems,
      itemCount: summary.itemCount,
      totalAmount: summary.totalAmount,
      totalAmountText: formatAmount(summary.totalAmount),
      fulfillmentMode,
      tableNo: normalizedTableNo,
      storeConfig,
      supportDineIn: support.dineInEnabled,
      supportPickup: support.pickupEnabled
    });

    await this.refreshPreview(cartItems, {
      fulfillmentMode,
      tableNo: normalizedTableNo
    });
  },
  changeFulfillmentMode(event) {
    const nextMode = event.currentTarget.dataset.mode;
    if (!isModeEnabled(nextMode, this.data.storeConfig)) {
      wx.showToast({
        icon: "none",
        title: resolveModeDisabledMessage(nextMode)
      });
      return;
    }
    this.setData({
      fulfillmentMode: nextMode,
      loading: true,
      errorMessage: ""
    });
    void this.refreshPreview(this.data.cartItems, {
      fulfillmentMode: nextMode
    });
  },
  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [field]: event.detail.value
    });
  },
  async submitOrder() {
    if (!this.data.cartItems.length) {
      wx.showToast({
        icon: "none",
        title: "购物车还是空的"
      });
      return;
    }

    const orderContext = buildOrderContext(this.data);
    const validationMessage = getSubmitValidationMessage(orderContext, this.data.storeConfig);
    if (validationMessage) {
      wx.showToast({
        icon: "none",
        title: validationMessage
      });
      return;
    }

    this.setData({
      submitting: true
    });

    try {
      const response = await createOrder({
        requestId: createOrderRequestId(),
        fulfillmentMode: orderContext.fulfillmentMode,
        tableNo: orderContext.tableNo,
        contactName: orderContext.contactName,
        contactPhone: orderContext.contactPhone,
        remark: orderContext.remark,
        items: buildPayloadItems(this.data.cartItems)
      });

      clearCart(getAppState().storeId);
      wx.showToast({
        title: "下单成功"
      });
      wx.redirectTo({
        url: `/pages/order-detail/order-detail?orderId=${response.order._id}`
      });
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: error.message || "下单失败"
      });
    } finally {
      this.setData({
        submitting: false
      });
    }
  },
  goMenu() {
    wx.switchTab({ url: "/pages/menu/menu" });
  }
});

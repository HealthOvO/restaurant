const { previewOrder, createOrder, fetchMenuCatalog } = require("../../services/order");
const { getAppState } = require("../../utils/session");
const { loadCart, summarizeCart, clearCart } = require("../../utils/cart");
const { refreshMemberState } = require("../../utils/member-access");

function createOrderRequestId() {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildOrderRequestSignature(storeId, orderContext, cartItems) {
  return JSON.stringify({
    storeId: storeId || "default-store",
    fulfillmentMode: orderContext.fulfillmentMode,
    tableNo: orderContext.tableNo,
    contactName: orderContext.contactName,
    contactPhone: orderContext.contactPhone,
    remark: orderContext.remark,
    memberBenefitsChoice: orderContext.memberBenefitsChoice || "VERIFY_AND_PARTICIPATE",
    items: buildPayloadItems(cartItems)
  });
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
  const memberBenefitsChoice =
    overrides && Object.prototype.hasOwnProperty.call(overrides, "memberBenefitsChoice")
      ? overrides.memberBenefitsChoice
      : data.memberBenefitsChoice;

  return {
    fulfillmentMode,
    tableNo: fulfillmentMode === "DINE_IN" ? (tableNo || "").trim() : "",
    contactName: fulfillmentMode === "PICKUP" ? (contactName || "").trim() : "",
    contactPhone: fulfillmentMode === "PICKUP" ? (contactPhone || "").trim() : "",
    remark: (remark || "").trim(),
    memberBenefitsChoice: memberBenefitsChoice || "VERIFY_AND_PARTICIPATE"
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

function resolveInviterLabel(inviterSummary) {
  if (!inviterSummary) {
    return "";
  }

  return inviterSummary.nickname || inviterSummary.memberCode || "邀请人";
}

function buildMemberBenefitsState(memberState, currentChoice) {
  const member = memberState && memberState.member;
  const relation = memberState && memberState.relation;
  const inviterLabel = resolveInviterLabel(memberState && memberState.inviterSummary);
  const hasVerifiedPhone = !!(member && member.phone && member.phoneVerifiedAt);

  if (hasVerifiedPhone) {
    return {
      requiresChoice: false,
      choice: "VERIFY_AND_PARTICIPATE",
      statusText: "已参与",
      title: "本单会参与会员活动",
      copy:
        relation && relation.status === "PENDING"
          ? "首单完成后会自动更新邀请进度和积分。"
          : "订单完成后会正常累计积分和券。"
    };
  }

  const choice = currentChoice === "SKIP_THIS_ORDER" ? "SKIP_THIS_ORDER" : "VERIFY_AND_PARTICIPATE";
  const verifyCopy = inviterLabel
    ? `${inviterLabel} 正在邀请你。想让这单计入邀请和积分，先验证手机号。`
    : "验证手机号后，这单才会计入邀请和积分。";
  const skipCopy = "这单不计邀请和积分，后续不补记。";
  return {
    requiresChoice: true,
    choice,
    statusText: choice === "SKIP_THIS_ORDER" ? "本单不参与" : "待验证",
    title: choice === "SKIP_THIS_ORDER" ? "本单不参与会员活动" : "先验证手机号",
    copy: choice === "SKIP_THIS_ORDER" ? skipCopy : verifyCopy,
    verifyCopy,
    skipCopy
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
    supportPickup: true,
    memberBenefitsRequiresChoice: false,
    memberBenefitsChoice: "VERIFY_AND_PARTICIPATE",
    memberBenefitsStatusText: "已参与",
    memberBenefitsTitle: "本单会参与会员活动",
    memberBenefitsCopy: "订单完成后会正常累计积分和券。",
    memberBenefitsVerifyCopy: "",
    memberBenefitsSkipCopy: ""
  },
  onShow() {
    this.refresh();
  },
  resolveSubmitRequestId(orderContext) {
    const signature = buildOrderRequestSignature(getAppState().storeId, orderContext, this.data.cartItems);
    const pendingOrderRequest = this.pendingOrderRequest || null;
    if (pendingOrderRequest && pendingOrderRequest.signature === signature && pendingOrderRequest.requestId) {
      return pendingOrderRequest.requestId;
    }

    const requestId = createOrderRequestId();
    this.pendingOrderRequest = {
      signature,
      requestId
    };
    return requestId;
  },
  resetPendingOrderRequest() {
    this.pendingOrderRequest = null;
  },
  async refreshPreview(cartItems, overrides) {
    if (!cartItems.length) {
      this.resetPendingOrderRequest();
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
    const memberStatePromise = refreshMemberState().catch(() => ({
      member: null,
      relation: null,
      pendingInviteCode: "",
      inviterSummary: null,
      canBindInvite: false
    }));
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
    const memberState = await memberStatePromise;
    const memberBenefits = buildMemberBenefitsState(memberState, this.data.memberBenefitsChoice);
    this.setData({
      cartItems,
      itemCount: summary.itemCount,
      totalAmount: summary.totalAmount,
      totalAmountText: formatAmount(summary.totalAmount),
      fulfillmentMode,
      tableNo: normalizedTableNo,
      storeConfig,
      supportDineIn: support.dineInEnabled,
      supportPickup: support.pickupEnabled,
      memberBenefitsRequiresChoice: memberBenefits.requiresChoice,
      memberBenefitsChoice: memberBenefits.choice,
      memberBenefitsStatusText: memberBenefits.statusText,
      memberBenefitsTitle: memberBenefits.title,
      memberBenefitsCopy: memberBenefits.copy,
      memberBenefitsVerifyCopy: memberBenefits.verifyCopy || "",
      memberBenefitsSkipCopy: memberBenefits.skipCopy || ""
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
  selectMemberBenefitsChoice(event) {
    const choice = event.currentTarget.dataset.choice;
    if (!this.data.memberBenefitsRequiresChoice || !choice) {
      return;
    }
    this.setData({
      memberBenefitsChoice: choice,
      memberBenefitsStatusText: choice === "SKIP_THIS_ORDER" ? "本单不参与" : "待验证",
      memberBenefitsTitle: choice === "SKIP_THIS_ORDER" ? "本单不参与会员活动" : "先验证手机号",
      memberBenefitsCopy:
        choice === "SKIP_THIS_ORDER"
        ? this.data.memberBenefitsSkipCopy || "这单不计邀请和积分，后续不补记。"
        : this.data.memberBenefitsVerifyCopy || "验证手机号后，这单才会计入邀请和积分。"
    });
  },
  goVerifyMemberBenefits() {
    if (this.data.submitting) {
      return;
    }

    if (this.data.memberBenefitsRequiresChoice) {
      this.selectMemberBenefitsChoice({
        currentTarget: {
          dataset: {
            choice: "VERIFY_AND_PARTICIPATE"
          }
        }
      });
    }

    wx.navigateTo({ url: "/pages/register/register" });
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

    if (this.data.memberBenefitsRequiresChoice && this.data.memberBenefitsChoice !== "SKIP_THIS_ORDER") {
      wx.showModal({
        title: "先验证手机号",
        content: "验证后，这单才能参与邀请和积分。",
        confirmText: "去验证",
        success: (result) => {
          if (result.confirm) {
            wx.navigateTo({ url: "/pages/register/register" });
          }
        }
      });
      return;
    }

    this.setData({
      submitting: true
    });

    try {
      const requestId = this.resolveSubmitRequestId(orderContext);
      const response = await createOrder({
        requestId,
        fulfillmentMode: orderContext.fulfillmentMode,
        tableNo: orderContext.tableNo,
        contactName: orderContext.contactName,
        contactPhone: orderContext.contactPhone,
        remark: orderContext.remark,
        memberBenefitsChoice: this.data.memberBenefitsRequiresChoice ? this.data.memberBenefitsChoice : undefined,
        items: buildPayloadItems(this.data.cartItems)
      });

      this.resetPendingOrderRequest();
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

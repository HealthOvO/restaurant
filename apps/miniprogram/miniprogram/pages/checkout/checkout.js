const api = require("../../services/v2");
const {
  cartSummary,
  changeCartQuantity,
  createRequestId,
  loadCart,
  reconcileCart,
  removeCartLine,
  saveCart,
  validateCartLimits
} = require("../../utils/v2-cart");

function money(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function prepareCart(cart) {
  return cart.map((item) => ({
    ...item,
    isCoupon: item.kind === "COUPON",
    unitPriceText: item.kind === "COUPON" ? "商品券抵扣" : `${money(item.unitPrice)} / 份`,
    lineTotalText: item.kind === "COUPON" ? "¥0.00" : money(item.unitPrice * item.quantity),
    originalPriceText: item.kind === "COUPON" ? money(item.originalUnitPrice || item.basePrice || 0) : "",
    specText: (item.selectedChoices || []).map((choice) => choice.choiceName).join(" · ") || "标准规格"
  }));
}

function requestWechatPayment(payParams) {
  return new Promise((resolve) => {
    try {
      wx.requestPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType || "RSA",
        paySign: payParams.paySign,
        success: () => resolve({ kind: "SUCCESS" }),
        fail: (error) => resolve({
          kind: error && error.errMsg && String(error.errMsg).includes("cancel") ? "CANCELLED" : "FAILED",
          error
        })
      });
    } catch (error) {
      resolve({ kind: "FAILED", error });
    }
  });
}

function hasSettled(status) {
  return ["WAITING_FULFILLMENT", "COMPLETED", "REFUNDING", "REFUNDED", "CANCELLED"].includes(status);
}

function queryPaymentSoon(orderId, waitForConfirmation) {
  const request = api.queryPayment(orderId);
  if (waitForConfirmation) return request;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 1600);
  });
  return Promise.race([request, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const CART_REFRESH_ERRORS = new Set([
  "ORDER_QUOTE_CHANGED",
  "COUPON_EXPIRED",
  "COUPON_NOT_FOUND",
  "COUPON_PRODUCT_UNAVAILABLE",
  "COUPON_UNAVAILABLE",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_UNAVAILABLE",
  "SPEC_REQUIRED",
  "SPEC_UNAVAILABLE"
]);

Page({
  data: {
    cart: [],
    summary: {
      count: 0, paidCount: 0, couponCount: 0, amount: 0, discount: 0, points: 0,
      amountText: "¥0.00", discountText: "¥0.00", submitText: "确认下单"
    },
    submitting: false,
    error: ""
  },

  onShow() {
    this.syncCart(loadCart());
  },

  syncCart(rawCart) {
    const summary = cartSummary(rawCart);
    this.rawCart = rawCart;
    this.setData({
      cart: prepareCart(rawCart),
      summary: {
        ...summary,
        amountText: money(summary.amount),
        discountText: money(summary.discount),
        submitText: summary.amount > 0 ? `微信支付 ${money(summary.amount)}` : "确认免费下单"
      }
    });
  },

  changeQuantity(event) {
    if (this.data.submitting) return;
    let next;
    try {
      next = changeCartQuantity(loadCart(), event.currentTarget.dataset.key, Number(event.currentTarget.dataset.offset || 0));
    } catch (error) {
      wx.showToast({ title: error.message || "数量已达上限", icon: "none" });
      return;
    }
    saveCart(next);
    getApp().globalData.cart = next;
    this.syncCart(next);
  },

  removeLine(event) {
    if (this.data.submitting) return;
    const next = removeCartLine(loadCart(), event.currentTarget.dataset.key);
    saveCart(next);
    getApp().globalData.cart = next;
    this.syncCart(next);
  },

  async refreshChangedCart(rawCart) {
    try {
      const home = await api.getHome();
      const reconciled = reconcileCart(rawCart, home.products || [], home.coupons || []);
      saveCart(reconciled.cart);
      getApp().globalData.cart = reconciled.cart;
      this.syncCart(reconciled.cart);
      wx.showModal({
        title: "购物车已更新",
        content: reconciled.cart.length ? "商品信息刚刚有变化，请重新确认后下单。" : "已选内容暂时无法下单，请返回菜单重新选择。",
        showCancel: false,
        confirmText: "知道了"
      });
    } catch (_refreshError) {
      this.setData({ error: "菜单信息刚刚有变化，请返回点餐页刷新后再试" });
    }
  },

  async confirmPaymentResult(orderId, outcome) {
    let order = null;
    try {
      order = await queryPaymentSoon(orderId, outcome.kind === "CANCELLED");
    } catch (_queryError) {
      // The result page keeps querying when this immediate check is unavailable.
    }
    if (outcome.kind === "CANCELLED" && (!order || !hasSettled(order.status))) {
      try {
        order = await api.cancelPayment(orderId);
      } catch (_cancelError) {
        // cancelPayment verifies the WeChat order before closing; reconciliation remains the fallback.
      }
    }
    wx.redirectTo({ url: `/pages/payment-result/payment-result?orderId=${orderId}` });
  },

  async submitOrder() {
    if (this.data.submitting || !this.data.cart.length) return;
    const initialCart = this.rawCart && this.rawCart.length
      ? this.rawCart
      : (this.data.cart && this.data.cart.length ? this.data.cart : loadCart());
    const limitError = validateCartLimits(initialCart);
    if (limitError) {
      wx.showToast({ title: limitError, icon: "none" });
      return;
    }
    this.setData({ submitting: true, error: "" });
    const requestKey = "v2-checkout-request";
    let requestId = wx.getStorageSync(requestKey) || createRequestId("order");
    wx.setStorageSync(requestKey, requestId);
    let created = null;
    try {
      const rawCart = initialCart;
      const paidLines = rawCart.filter((item) => item.kind !== "COUPON");
      const couponLines = rawCart.filter((item) => item.kind === "COUPON");
      const payload = {
        requestId,
        expectedPayableAmount: this.data.summary.amount,
        expectedBuyerPoints: this.data.summary.points,
        lineItems: paidLines.map((item) => ({ productId: item.productId, quantity: item.quantity, selections: item.selections })),
        couponItems: couponLines.map((item) => ({ couponId: item.couponId, selections: item.selections }))
      };
      created = await api.createOrder(payload);
      if (created.order.status === "CANCELLED") {
        wx.removeStorageSync(requestKey);
        requestId = createRequestId("order");
        wx.setStorageSync(requestKey, requestId);
        created = await api.createOrder({ ...payload, requestId });
      }
      if (created.order.status !== "PENDING_PAYMENT") {
        wx.redirectTo({ url: `/pages/payment-result/payment-result?orderId=${created.order._id}` });
        return;
      }
      let outcome;
      if (created.payParams && created.payParams.mode === "MOCK") {
        try {
          await api.mockPay(created.order._id);
          outcome = { kind: "SUCCESS" };
        } catch (error) {
          outcome = { kind: "FAILED", error };
        }
      } else {
        outcome = await requestWechatPayment(created.payParams);
      }
      await this.confirmPaymentResult(created.order._id, outcome);
    } catch (error) {
      if (error && CART_REFRESH_ERRORS.has(error.code)) {
        wx.removeStorageSync(requestKey);
        await this.refreshChangedCart(initialCart);
        return;
      }
      this.setData({ error: (error && error.message) || "下单失败，请稍后重试" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

const api = require("../../services/v2");
const { cartSummary, changeCartQuantity, clearCart, createRequestId, loadCart, removeCartLine, saveCart } = require("../../utils/v2-cart");

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

  async submitOrder() {
    if (this.data.submitting || !this.data.cart.length) return;
    this.setData({ submitting: true, error: "" });
    const requestKey = "v2-checkout-request";
    let requestId = wx.getStorageSync(requestKey) || createRequestId("order");
    wx.setStorageSync(requestKey, requestId);
    let created = null;
    try {
      const rawCart = this.rawCart && this.rawCart.length ? this.rawCart : this.data.cart;
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
      if (created.payParams && created.payParams.mode === "MOCK") {
        await api.mockPay(created.order._id);
      } else {
        await new Promise((resolve, reject) => wx.requestPayment({
          timeStamp: created.payParams.timeStamp,
          nonceStr: created.payParams.nonceStr,
          package: created.payParams.package,
          signType: created.payParams.signType || "RSA",
          paySign: created.payParams.paySign,
          success: resolve,
          fail: reject
        }));
      }
      wx.redirectTo({ url: `/pages/payment-result/payment-result?orderId=${created.order._id}` });
    } catch (error) {
      if (error && error.code === "ORDER_QUOTE_CHANGED") {
        wx.removeStorageSync(requestKey);
        clearCart();
        this.syncCart([]);
        wx.showModal({
          title: "商品信息有更新",
          content: "价格或积分刚刚发生变化，请返回点餐页重新选择。",
          showCancel: false,
          confirmText: "知道了"
        });
        return;
      }
      const cancelled = error && error.errMsg && String(error.errMsg).includes("cancel");
      if (cancelled) {
        let couponsReleased = false;
        if (created && created.order) {
          try {
            const closed = await api.cancelPayment(created.order._id);
            if (closed.status === "WAITING_FULFILLMENT" || closed.status === "COMPLETED") {
              wx.redirectTo({ url: `/pages/payment-result/payment-result?orderId=${closed._id}` });
              return;
            }
            couponsReleased = closed.status === "CANCELLED";
          } catch (_closeError) {
            // Payment reconciliation remains the final safety net when immediate close fails.
          }
        }
        wx.showToast({
          title: this.data.summary.couponCount > 0
            ? (couponsReleased ? "商品券已返还" : "支付已取消，商品券稍后返还")
            : "已取消支付",
          icon: "none"
        });
      } else {
        this.setData({ error: error.message || "下单失败，请稍后重试" });
      }
    } finally {
      this.setData({ submitting: false });
    }
  }
});

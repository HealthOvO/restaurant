const api = require("../../services/v2");
const { MAX_CART_QUANTITY, cartSummary, createRequestId, loadCart, saveCart } = require("../../utils/v2-cart");

function money(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function prepareCart(cart) {
  return cart.map((item) => ({
    ...item,
    unitPriceText: money(item.unitPrice),
    lineTotalText: money(item.unitPrice * item.quantity),
    specText: (item.selectedChoices || []).map((choice) => choice.choiceName).join(" · ") || "标准规格"
  }));
}

Page({
  data: {
    cart: [],
    summary: { count: 0, amount: 0, points: 0, amountText: "¥0.00" },
    submitting: false,
    error: ""
  },

  onShow() {
    this.syncCart(loadCart());
  },

  syncCart(cart) {
    const summary = cartSummary(cart);
    this.setData({ cart: prepareCart(cart), summary: { ...summary, amountText: money(summary.amount) } });
  },

  changeQuantity(event) {
    if (this.data.submitting) return;
    const { key, offset } = event.currentTarget.dataset;
    const raw = loadCart();
    const index = raw.findIndex((item) => item.key === key);
    if (index < 0) return;
    if (Number(offset || 0) > 0 && cartSummary(raw).count >= MAX_CART_QUANTITY) {
      wx.showToast({ title: `单笔最多 ${MAX_CART_QUANTITY} 份`, icon: "none" });
      return;
    }
    const nextQuantity = raw[index].quantity + Number(offset || 0);
    if (nextQuantity <= 0) raw.splice(index, 1);
    else raw[index].quantity = Math.min(99, nextQuantity);
    saveCart(raw);
    getApp().globalData.cart = raw;
    this.syncCart(raw);
  },

  async submitOrder() {
    if (this.data.submitting || !this.data.cart.length) return;
    this.setData({ submitting: true, error: "" });
    const requestKey = "v2-checkout-request";
    const requestId = wx.getStorageSync(requestKey) || createRequestId("order");
    wx.setStorageSync(requestKey, requestId);
    try {
      const created = await api.createOrder({
        requestId,
        lineItems: this.data.cart.map((item) => ({ productId: item.productId, quantity: item.quantity, selections: item.selections }))
      });
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
      const cancelled = error && error.errMsg && String(error.errMsg).includes("cancel");
      if (cancelled) {
        wx.showToast({ title: "已取消支付", icon: "none" });
      } else {
        this.setData({ error: error.message || "下单失败，请稍后重试" });
      }
    } finally {
      this.setData({ submitting: false });
    }
  }
});

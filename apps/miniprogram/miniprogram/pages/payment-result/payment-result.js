const api = require("../../services/v2");
const { clearCart } = require("../../utils/v2-cart");

Page({
  data: {
    orderId: "",
    loading: true,
    order: null,
    error: "",
    attempts: 0
  },

  onLoad(options) {
    const orderId = options && options.orderId ? options.orderId : "";
    this.setData({ orderId });
    this.query();
  },

  onUnload() {
    if (this.timer) clearTimeout(this.timer);
  },

  query() {
    if (!this.data.orderId) {
      this.setData({ loading: false, error: "订单信息不完整" });
      return Promise.resolve();
    }
    return api.queryPayment(this.data.orderId).then((order) => {
      if (order.status === "WAITING_FULFILLMENT" || order.status === "COMPLETED") {
        if (order.source === "WECHAT_PAY") {
          clearCart();
          wx.removeStorageSync("v2-checkout-request");
        }
        this.setData({ loading: false, order, error: "" });
        return;
      }
      if (order.status === "CANCELLED") {
        this.setData({ loading: false, order, error: "订单未支付，已关闭" });
        return;
      }
      const attempts = this.data.attempts + 1;
      this.setData({ attempts, order });
      if (attempts < 8) this.timer = setTimeout(() => this.query(), 1200);
      else this.setData({ loading: false, error: "支付结果还在确认，可稍后到订单页查看" });
    }).catch((error) => {
      this.setData({ loading: false, error: error.message || "支付结果查询失败" });
    });
  },

  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/home" });
  }
});

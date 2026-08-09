const api = require("../../services/v2");
const { prepareOrder } = require("../../utils/v2-format");

Page({
  data: { loading: true, error: "", orders: [] },

  onShow() {
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh());
  },

  loadOrders() {
    this.setData({ loading: true, error: "" });
    return api.listOrders().then((orders) => {
      this.setData({ loading: false, orders: (orders || []).map(prepareOrder) });
    }).catch((error) => {
      this.setData({ loading: false, error: error.message || "订单加载失败" });
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/home" });
  }
});

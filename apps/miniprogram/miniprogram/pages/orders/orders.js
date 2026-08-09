const api = require("../../services/v2");
const { prepareOrder } = require("../../utils/v2-format");
const { isCacheFresh, readCache, writeCache } = require("../../utils/v2-cache");

const ORDERS_CACHE_KEY = "orders";
const ORDERS_CACHE_MS = 8_000;

Page({
  data: { loading: true, error: "", orders: [] },

  onLoad() {
    const cached = readCache(ORDERS_CACHE_KEY);
    if (cached !== undefined) this.applyOrders(cached);
  },

  onShow() {
    if (!isCacheFresh(ORDERS_CACHE_KEY, ORDERS_CACHE_MS)) this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh());
  },

  loadOrders() {
    if (this.ordersRequest) return this.ordersRequest;
    const hasData = this.hasOrdersData || readCache(ORDERS_CACHE_KEY) !== undefined;
    this.setData({ loading: !hasData, error: "" });
    this.ordersRequest = api.listOrders().then((orders) => {
      writeCache(ORDERS_CACHE_KEY, orders || []);
      this.applyOrders(orders || []);
    }).catch((error) => {
      if (this.hasOrdersData) wx.showToast({ title: "订单刷新失败", icon: "none" });
      else this.setData({ loading: false, error: error.message || "订单加载失败" });
    }).finally(() => {
      this.ordersRequest = null;
    });
    return this.ordersRequest;
  },

  applyOrders(orders) {
    this.hasOrdersData = true;
    this.setData({ loading: false, error: "", orders: orders.map(prepareOrder) });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/home" });
  }
});

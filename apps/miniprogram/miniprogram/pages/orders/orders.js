const api = require("../../services/v2");
const { prepareOrder } = require("../../utils/v2-format");
const { cacheGeneration, isCacheFresh, readCache, writeCacheIfCurrent } = require("../../utils/v2-cache");

const ORDERS_CACHE_KEY = "orders";
const ORDERS_CACHE_MS = 8_000;

Page({
  data: { loading: true, loadingMore: false, error: "", orders: [], nextCursor: "" },

  onLoad() {
    const cached = readCache(ORDERS_CACHE_KEY);
    if (cached !== undefined) this.applyOrders(Array.isArray(cached) ? { rows: cached } : cached);
  },

  onShow() {
    if (!isCacheFresh(ORDERS_CACHE_KEY, ORDERS_CACHE_MS)) this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh());
  },

  loadOrders() {
    const currentGeneration = cacheGeneration(ORDERS_CACHE_KEY);
    if (this.ordersRequest) {
      if (this.ordersRequestGeneration === currentGeneration) return this.ordersRequest;
      const staleRequest = this.ordersRequest;
      return staleRequest.catch(() => undefined).then(() => this.loadOrders());
    }
    const hasData = this.hasOrdersData || readCache(ORDERS_CACHE_KEY) !== undefined;
    const generation = currentGeneration;
    const requestRevision = Number(this.ordersRevision || 0) + 1;
    this.ordersRevision = requestRevision;
    this.ordersRequestGeneration = generation;
    this.setData({ loading: !hasData, error: "" });
    this.ordersRequest = api.listOrders().then((result) => {
      const page = Array.isArray(result) ? { rows: result } : (result || { rows: [] });
      if (this.ordersRevision !== requestRevision || cacheGeneration(ORDERS_CACHE_KEY) !== generation) return;
      writeCacheIfCurrent(ORDERS_CACHE_KEY, page, generation);
      this.applyOrders(page);
    }).catch((error) => {
      if (this.ordersRevision !== requestRevision || cacheGeneration(ORDERS_CACHE_KEY) !== generation) return;
      if (this.hasOrdersData) wx.showToast({ title: "订单刷新失败", icon: "none" });
      else this.setData({ loading: false, error: error.message || "订单加载失败" });
    }).finally(() => {
      this.ordersRequest = null;
    });
    return this.ordersRequest;
  },

  applyOrders(page) {
    this.hasOrdersData = true;
    this.setData({ loading: false, error: "", orders: (page.rows || []).map(prepareOrder), nextCursor: page.nextCursor || "" });
  },

  async loadMoreOrders() {
    if (!this.data.nextCursor || this.data.loadingMore) return;
    const generation = cacheGeneration(ORDERS_CACHE_KEY);
    const requestRevision = Number(this.ordersRevision || 0);
    const cursor = this.data.nextCursor;
    this.setData({ loadingMore: true });
    try {
      const result = await api.listOrders(cursor);
      if (Number(this.ordersRevision || 0) !== requestRevision || this.data.nextCursor !== cursor || cacheGeneration(ORDERS_CACHE_KEY) !== generation) return;
      const page = Array.isArray(result) ? { rows: result } : (result || { rows: [] });
      const merged = Array.from(new Map([
        ...this.data.orders,
        ...(page.rows || []).map(prepareOrder)
      ].map((order) => [order._id, order])).values());
      const cached = { rows: merged, nextCursor: page.nextCursor };
      writeCacheIfCurrent(ORDERS_CACHE_KEY, cached, generation);
      this.setData({ orders: merged, nextCursor: page.nextCursor || "" });
    } catch (error) {
      wx.showToast({ title: error.message || "更早订单加载失败", icon: "none" });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/home" });
  }
});

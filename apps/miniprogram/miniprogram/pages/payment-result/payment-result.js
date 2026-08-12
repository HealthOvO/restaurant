const api = require("../../services/v2");
const { invalidateCache } = require("../../utils/v2-cache");
const { clearCart } = require("../../utils/v2-cart");

const MAX_QUERY_ATTEMPTS = 12;

function retryDelay(attempts) {
  return Math.min(3000, 900 + attempts * 250);
}

Page({
  data: {
    orderId: "",
    loading: true,
    order: null,
    error: "",
    attempts: 0,
    progressText: "请稍等，不要重复支付。"
  },

  onLoad(options) {
    const orderId = options && options.orderId ? options.orderId : "";
    this.visible = true;
    this.setData({ orderId });
    this.startPolling(true);
  },

  onShow() {
    this.visible = true;
    if (this.hasShown && !this.terminal && !this.polling) this.resumePolling();
    this.hasShown = true;
  },

  onHide() {
    this.pausePolling();
  },

  onUnload() {
    this.pausePolling();
  },

  pausePolling() {
    this.visible = false;
    this.pollToken = Number(this.pollToken || 0) + 1;
    this.polling = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  },

  query() {
    return this.startPolling(true);
  },

  resumePolling() {
    const pending = this.queryRequest;
    if (!pending) return this.startPolling(false);
    if (this.resumeRequestSource === pending) return this.resumeRequest;
    this.setData({ loading: true, error: "", progressText: "正在继续确认支付结果。" });
    const resumeRequest = pending.catch(() => undefined).then(() => {
      if (this.resumeRequestSource === pending) {
        this.resumeRequestSource = null;
        this.resumeRequest = null;
      }
      if (this.visible === false || this.terminal || this.polling || this.queryRequest) return undefined;
      return this.startPolling(false);
    });
    this.resumeRequestSource = pending;
    this.resumeRequest = resumeRequest;
    return resumeRequest;
  },

  startPolling(resetAttempts) {
    if (!this.data.orderId) {
      this.setData({ loading: false, error: "订单信息不完整" });
      return Promise.resolve();
    }
    if (this.polling) return this.queryRequest || Promise.resolve();
    if (resetAttempts) {
      this.terminal = false;
      this.setData({ loading: true, error: "", attempts: 0, progressText: "请稍等，不要重复支付。" });
    } else {
      this.setData({ loading: true, error: "", progressText: "正在继续确认支付结果。" });
    }
    this.visible = true;
    this.polling = true;
    const token = Number(this.pollToken || 0) + 1;
    this.pollToken = token;
    return this.pollOnce(token);
  },

  pollOnce(token) {
    if (!this.polling || token !== this.pollToken) return Promise.resolve();
    const request = api.queryPayment(this.data.orderId).then((order) => {
      if (token !== this.pollToken) return;
      if (order.status === "WAITING_FULFILLMENT" || order.status === "COMPLETED") {
        this.finishSuccess(order);
        return;
      }
      if (order.status === "CANCELLED") {
        wx.removeStorageSync("v2-checkout-request");
        this.finishTerminal(order, "订单未支付，已关闭");
        return;
      }
      if (order.status === "REFUNDING") {
        this.finalizeSubmittedCart();
        this.finishTerminal(order, "退款正在处理中，请稍后查看");
        return;
      }
      if (order.status === "REFUNDED") {
        this.finalizeSubmittedCart();
        this.finishTerminal(order, "订单已退款，本单发放的积分已回收");
        return;
      }
      this.continueOrStop(token, order, "");
    }).catch((error) => {
      if (token !== this.pollToken) return;
      this.continueOrStop(token, this.data.order, error && error.message ? error.message : "网络连接不稳定");
    }).finally(() => {
      if (this.queryRequest === request) this.queryRequest = null;
    });
    this.queryRequest = request;
    return request;
  },

  continueOrStop(token, order, networkError) {
    const attempts = this.data.attempts + 1;
    const canRetry = attempts < MAX_QUERY_ATTEMPTS && this.visible !== false;
    this.setData({
      attempts,
      order,
      progressText: networkError ? "网络不稳定，正在重新连接。" : "支付结果还在确认，请稍等。"
    });
    if (canRetry) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pollOnce(token);
      }, retryDelay(attempts));
      return;
    }
    this.polling = false;
    this.setData({
      loading: false,
      error: networkError ? "暂时无法查询支付结果，请重新查询" : "支付结果还在确认，可稍后到订单页查看"
    });
  },

  finalizeSubmittedCart() {
    clearCart();
    wx.removeStorageSync("v2-checkout-request");
    this.refreshTabCaches();
  },

  refreshTabCaches() {
    if (!this.tabCachesInvalidated) {
      invalidateCache("home", "orders", "benefits", "profile");
      if (typeof api.invalidateCurrentReads === "function") api.invalidateCurrentReads();
      this.tabCachesInvalidated = true;
    }
    if (this.tabPreloadRequest) return this.tabPreloadRequest;
    const app = typeof getApp === "function" ? getApp() : null;
    if (!app || typeof app.preloadTabs !== "function") return Promise.resolve();
    let request;
    try {
      request = Promise.resolve(app.preloadTabs()).catch(() => undefined);
    } catch (_error) {
      request = Promise.resolve();
    }
    this.tabPreloadRequest = request;
    return request;
  },

  finishSuccess(order) {
    this.finalizeSubmittedCart();
    this.terminal = true;
    this.polling = false;
    this.setData({ loading: false, order, error: "" });
  },

  finishTerminal(order, message) {
    this.refreshTabCaches();
    this.terminal = true;
    this.polling = false;
    this.setData({ loading: false, order, error: message });
  },

  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },

  goHome() {
    wx.switchTab({ url: "/pages/home/home" });
  }
});

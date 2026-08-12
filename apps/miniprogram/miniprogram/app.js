const { CLOUD_ENV_ID } = require("./config");
const api = require("./services/v2");
const { loadCart } = require("./utils/v2-cart");
const { cacheGeneration, writeCacheIfCurrent } = require("./utils/v2-cache");

App({
  globalData: {
    envId: CLOUD_ENV_ID,
    source: "direct",
    home: null,
    cart: [],
    bootstrapPromise: null
  },

  onLaunch(options) {
    if (!wx.cloud) {
      throw new Error("当前微信版本不支持云开发，请升级微信后重试");
    }
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
    this.globalData.cart = loadCart();
    this.captureSource(options);
    const homeGeneration = cacheGeneration("home");
    const bootstrapPromise = api.getHome().then((home) => {
      if (cacheGeneration("home") === homeGeneration) {
        this.globalData.home = home;
        writeCacheIfCurrent("home", home, homeGeneration);
        this.preloadTabs(home);
      }
      return home;
    }).catch(() => undefined);
    this.globalData.bootstrapPromise = bootstrapPromise;
  },

  onShow(options) {
    this.captureSource(options);
  },

  captureSource(options) {
    const query = options && options.query ? options.query : {};
    const source = typeof query.source === "string" && query.source.trim() ? query.source.trim() : "";
    if (source) {
      this.globalData.source = source;
      wx.setStorageSync("v2-entry-source", source);
    } else {
      this.globalData.source = wx.getStorageSync("v2-entry-source") || "direct";
    }
  },

  preloadTabs(home) {
    const ordersGeneration = cacheGeneration("orders");
    const benefitsGeneration = cacheGeneration("benefits");
    const profileGeneration = cacheGeneration("profile");
    api.listOrders().then((page) => writeCacheIfCurrent("orders", Array.isArray(page) ? { rows: page } : (page || { rows: [] }), ordersGeneration)).catch(() => undefined);
    Promise.all([api.listCoupons(), api.listPoints()]).then((results) => {
      writeCacheIfCurrent("benefits", { home, coupons: results[0] || [], points: results[1] }, benefitsGeneration);
    }).catch(() => undefined);
    api.getInviteOverview().then((overview) => {
      writeCacheIfCurrent("profile", { home, overview }, profileGeneration);
    }).catch(() => undefined);
  }
});

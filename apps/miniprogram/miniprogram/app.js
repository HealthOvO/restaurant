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
    bootstrapPromise: null,
    tabPreloadPromise: null
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
    const homeGeneration = cacheGeneration("home");
    const ordersGeneration = cacheGeneration("orders");
    const benefitsGeneration = cacheGeneration("benefits");
    const profileGeneration = cacheGeneration("profile");
    const homeRequest = home === undefined ? api.getHome() : Promise.resolve(home);
    const cacheHomeRequest = homeRequest.then((latestHome) => {
      if (cacheGeneration("home") === homeGeneration) this.globalData.home = latestHome;
      writeCacheIfCurrent("home", latestHome, homeGeneration);
      return latestHome;
    });
    const ordersRequest = api.listOrders().then((page) => {
      writeCacheIfCurrent("orders", Array.isArray(page) ? { rows: page } : (page || { rows: [] }), ordersGeneration);
    });
    const benefitsRequest = Promise.all([homeRequest, api.listCoupons(), api.listPoints()]).then((results) => {
      writeCacheIfCurrent("benefits", { home: results[0], coupons: results[1] || [], points: results[2] }, benefitsGeneration);
    });
    const profileRequest = Promise.all([homeRequest, api.getInviteOverview()]).then((results) => {
      writeCacheIfCurrent("profile", { home: results[0], overview: results[1] }, profileGeneration);
    });
    const preloadPromise = Promise.all([
      cacheHomeRequest.catch(() => undefined),
      ordersRequest.catch(() => undefined),
      benefitsRequest.catch(() => undefined),
      profileRequest.catch(() => undefined)
    ]).then(() => undefined);
    this.globalData.tabPreloadPromise = preloadPromise;
    return preloadPromise;
  }
});

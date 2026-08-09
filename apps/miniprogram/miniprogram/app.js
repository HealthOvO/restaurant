const { CLOUD_ENV_ID } = require("./config");
const api = require("./services/v2");
const { loadCart } = require("./utils/v2-cart");
const { writeCache } = require("./utils/v2-cache");

App({
  globalData: {
    envId: CLOUD_ENV_ID,
    source: "direct",
    home: null,
    cart: []
  },

  onLaunch(options) {
    if (!wx.cloud) {
      throw new Error("当前微信版本不支持云开发，请升级微信后重试");
    }
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
    this.globalData.cart = loadCart();
    this.captureSource(options);
    api.getHome().then((home) => {
      this.globalData.home = home;
      writeCache("home", home);
    }).catch(() => undefined);
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
  }
});

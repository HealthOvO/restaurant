const { CLOUD_ENV_ID, STORE_ID } = require("./config");
const { applyStoreLaunchContext } = require("./utils/store-context");

App({
  globalData: {
    envId: CLOUD_ENV_ID,
    storeId: STORE_ID,
    storeConfigCache: {},
    activeTableNo: "",
    member: null,
    relation: null,
    pendingInviteCode: "",
    inviterSummary: null,
    canBindInvite: false,
    staffProfile: null,
    staffSessionToken: "",
    staffRedirectPath: "",
    inviteCode: ""
  },
  onLaunch(options) {
    if (!wx.cloud) {
      throw new Error("请使用 2.2.3 或以上的基础库以支持云能力");
    }

    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true
    });

    const cachedStoreId = wx.getStorageSync("storeId");
    if (cachedStoreId) {
      this.globalData.storeId = cachedStoreId;
    }
    const cachedTableNo = wx.getStorageSync("activeTableNo");
    if (cachedTableNo) {
      this.globalData.activeTableNo = cachedTableNo;
    }

    const cachedToken = wx.getStorageSync("staffSessionToken");
    const cachedStaffProfile = wx.getStorageSync("staffProfile");
    if (cachedToken) {
      this.globalData.staffSessionToken = cachedToken;
    }
    if (cachedStaffProfile) {
      this.globalData.staffProfile = cachedStaffProfile;
    }
    const cachedStaffRedirectPath = wx.getStorageSync("staffRedirectPath");
    if (cachedStaffRedirectPath) {
      this.globalData.staffRedirectPath = cachedStaffRedirectPath;
    }

    applyStoreLaunchContext(options && options.query ? options.query : {});
  },
  onShow(options) {
    applyStoreLaunchContext(options && options.query ? options.query : {});
  }
});

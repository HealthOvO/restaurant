const { getAppState } = require("../../utils/session");
const { applyStoreLaunchContext } = require("../../utils/store-context");

Page({
  data: {
    hasSession: false
  },
  onLoad(query) {
    applyStoreLaunchContext(query);
  },
  onShow() {
    const appState = getAppState();
    this.setData({
      hasSession: Boolean(appState.staffSessionToken)
    });
  },
  goLogin() {
    wx.navigateTo({
      url: "/pages/staff-login/staff-login?redirect=/pages/staff-home/staff-home"
    });
  },
  goWorkbench() {
    wx.redirectTo({ url: "/pages/staff-home/staff-home" });
  }
});

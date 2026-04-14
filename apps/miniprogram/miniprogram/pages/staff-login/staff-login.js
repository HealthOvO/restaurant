const { loginStaff } = require("../../services/staff");
const { saveStaffSession, saveStaffRedirectPath, consumeStaffRedirectPath } = require("../../utils/session");
const { refreshStaffAccess } = require("../../utils/staff-access");
const { applyStoreLaunchContext } = require("../../utils/store-context");

function resolveRedirectTarget(currentPath) {
  const target = consumeStaffRedirectPath(currentPath);
  if (!target || target === "/pages/staff-login/staff-login") {
    return "/pages/staff-home/staff-home";
  }
  return target;
}

Page({
  data: {
    username: "",
    password: "",
    loading: false,
    redirectPath: "",
    redirectHint: "登录后进入店员工作台。"
  },
  onLoad(query) {
    applyStoreLaunchContext(query);
    const redirectPath = query && query.redirect ? decodeURIComponent(query.redirect) : "";
    if (!redirectPath) {
      return;
    }

    saveStaffRedirectPath(redirectPath);
    this.setData({
      redirectPath,
      redirectHint: "登录后会回到刚才的店员页面。"
    });
  },
  async onShow() {
    const access = await refreshStaffAccess().catch(() => null);
    if (!access) {
      return;
    }

    wx.redirectTo({ url: resolveRedirectTarget(this.data.redirectPath) });
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [field]: event.detail.value
    });
  },
  async submit() {
    const username = (this.data.username || "").trim();
    const password = (this.data.password || "").trim();
    if (!username || !password) {
      wx.showToast({ icon: "none", title: "请输入账号和密码" });
      return;
    }

    this.setData({ loading: true });
    try {
      const response = await loginStaff({
        username,
        password
      });
      saveStaffSession(response.sessionToken, response.staff);
      wx.showToast({ title: "登录成功" });
      setTimeout(() => {
        wx.redirectTo({ url: resolveRedirectTarget(this.data.redirectPath) });
      }, 400);
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: error.message || "登录失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});

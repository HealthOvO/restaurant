const { clearStaffSession, saveStaffRedirectPath } = require("../../utils/session");
const { refreshStaffAccess } = require("../../utils/staff-access");

function formatRoleLabel(role) {
  return role === "OWNER" ? "老板账号" : "店员账号";
}

function resolveWorkHint(hasSession, staffProfile) {
  if (!hasSession || !staffProfile) {
    return {
      title: "先登录店员账号",
      copy: "登录后再核销、补录、查单。"
    };
  }

  return {
    title: `${staffProfile.displayName} 已登录`,
    copy: "核销、补录、查会员。"
  };
}

Page({
  data: {
    loading: true,
    errorMessage: "",
    hasSession: false,
    staffProfile: null,
    staffRoleLabel: "",
    loginStatusText: "未登录",
    workHintTitle: "先登录店员账号",
    workHintCopy: "登录后再核销、查单、查会员。"
  },
  onShow() {
    this.refresh();
  },
  async onPullDownRefresh() {
    await this.refresh().catch(() => null);
    if (typeof wx.stopPullDownRefresh === "function") {
      wx.stopPullDownRefresh();
    }
  },
  async refresh() {
    this.setData({
      loading: true,
      errorMessage: ""
    });

    try {
      const access = await refreshStaffAccess();
      if (!access) {
        const hint = resolveWorkHint(false, null);
        this.setData({
          hasSession: false,
          staffProfile: null,
          staffRoleLabel: "",
          loginStatusText: "未登录",
          workHintTitle: hint.title,
          workHintCopy: hint.copy
        });
        return;
      }

      const hint = resolveWorkHint(true, access.staffProfile);
      this.setData({
        hasSession: true,
        staffProfile: access.staffProfile,
        staffRoleLabel: formatRoleLabel(access.staffProfile.role),
        loginStatusText: "已登录",
        workHintTitle: hint.title,
        workHintCopy: hint.copy
      });
    } catch (error) {
      const hint = resolveWorkHint(false, null);
      this.setData({
        hasSession: false,
        staffProfile: null,
        staffRoleLabel: "",
        loginStatusText: "登录失效",
        workHintTitle: hint.title,
        workHintCopy: hint.copy,
        errorMessage: error.message || "登录已失效，请重新登录"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  goLogin() {
    wx.redirectTo({ url: "/pages/staff-login/staff-login" });
  },
  goVisit() {
    wx.navigateTo({ url: "/pages/staff-visit/staff-visit" });
  },
  goOrders() {
    wx.navigateTo({ url: "/pages/staff-orders/staff-orders" });
  },
  goVoucher() {
    wx.navigateTo({ url: "/pages/staff-voucher/staff-voucher" });
  },
  goSearch() {
    wx.navigateTo({ url: "/pages/staff-member-search/staff-member-search" });
  },
  goFeedback() {
    wx.navigateTo({ url: "/pages/staff-feedback/staff-feedback" });
  },
  logout() {
    clearStaffSession();
    saveStaffRedirectPath("");
    this.setData({
      hasSession: false,
      staffProfile: null,
      staffRoleLabel: "",
      loginStatusText: "未登录",
      workHintTitle: "先登录店员账号",
      workHintCopy: "登录后再核销、补录、查单。",
      errorMessage: ""
    });
    wx.showToast({
      title: "已退出"
    });
  }
});

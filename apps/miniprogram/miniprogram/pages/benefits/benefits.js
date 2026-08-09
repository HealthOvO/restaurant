const api = require("../../services/v2");
const { createRequestId } = require("../../utils/v2-cart");
const { dateTime, preparePoint } = require("../../utils/v2-format");

function confirmExchange(item) {
  return new Promise((resolve) => wx.showModal({
    title: `兑换${item.name}`,
    content: `将使用 ${item.pointsCost} 积分，兑换后可用于指定商品。`,
    confirmText: "确认兑换",
    success: (result) => resolve(Boolean(result.confirm)),
    fail: () => resolve(false)
  }));
}

function prepareCoupon(coupon) {
  const expired = coupon.status === "AVAILABLE" && coupon.expiresAt <= new Date().toISOString();
  const status = expired ? "EXPIRED" : coupon.status;
  const statusText = { AVAILABLE: "可使用", USED: "已使用", EXPIRED: "已过期", VOID: "已作废" }[status] || status;
  return { ...coupon, status, statusText, canUse: status === "AVAILABLE", expiresText: dateTime(coupon.expiresAt) };
}

Page({
  data: {
    loading: true, error: "", activeTab: "coupon", pointsBalance: 0,
    exchangeItems: [], coupons: [], pointRows: [], exchangingId: ""
  },

  onShow() { this.loadBenefits(); },
  onPullDownRefresh() { this.loadBenefits().finally(() => wx.stopPullDownRefresh()); },

  loadBenefits() {
    this.setData({ loading: true, error: "" });
    return Promise.all([api.getHome(), api.listCoupons(), api.listPoints()]).then(([home, coupons, points]) => {
      const balance = points.balance || 0;
      this.setData({
        loading: false,
        pointsBalance: balance,
        exchangeItems: (home.exchangeItems || []).map((item) => ({ ...item, canExchange: balance >= item.pointsCost })),
        coupons: (coupons || []).map(prepareCoupon),
        pointRows: (points.rows || []).map(preparePoint)
      });
    }).catch((error) => this.setData({ loading: false, error: error.message || "权益加载失败" }));
  },

  switchTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }); },

  async exchange(event) {
    const item = this.data.exchangeItems.find((row) => row._id === event.currentTarget.dataset.id);
    if (!item || !item.canExchange || this.data.exchangingId) return;
    if (!(await confirmExchange(item))) return;
    this.setData({ exchangingId: item._id });
    try {
      await api.exchangeCoupon({ requestId: createRequestId("exchange"), exchangeItemId: item._id });
      wx.showToast({ title: "兑换成功", icon: "success" });
      await this.loadBenefits();
    } catch (error) {
      wx.showToast({ title: error.message || "兑换失败", icon: "none" });
    } finally {
      this.setData({ exchangingId: "" });
    }
  },

  useCoupon(event) {
    wx.navigateTo({ url: `/pages/coupon-use/coupon-use?couponId=${event.currentTarget.dataset.id}` });
  }
});

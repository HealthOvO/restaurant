const api = require("../../services/v2");
const { createRequestId } = require("../../utils/v2-cart");
const { invalidateCache, isCacheFresh, readCache, writeCache } = require("../../utils/v2-cache");
const { dateTime, preparePoint } = require("../../utils/v2-format");

const BENEFITS_CACHE_KEY = "benefits";
const BENEFITS_CACHE_MS = 15_000;

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
  const statusText = { AVAILABLE: "可使用", RESERVED: "待支付占用", USED: "已使用", EXPIRED: "已过期", VOID: "已作废" }[status] || status;
  return { ...coupon, status, statusText, canUse: status === "AVAILABLE", expiresText: dateTime(coupon.expiresAt) };
}

function prepareCoupons(coupons) {
  const statusOrder = { AVAILABLE: 0, RESERVED: 1, USED: 2, EXPIRED: 3, VOID: 4 };
  return (coupons || []).map(prepareCoupon).sort((left, right) => {
    const byStatus = (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return left.expiresAt.localeCompare(right.expiresAt);
  });
}

Page({
  data: {
    loading: true, error: "", activeTab: "coupon", pointsBalance: 0,
    exchangeItems: [], coupons: [], pointRows: [], exchangingId: ""
  },

  onLoad() {
    const cached = readCache(BENEFITS_CACHE_KEY);
    if (cached) this.applyBenefits(cached);
  },

  onShow() {
    if (!isCacheFresh(BENEFITS_CACHE_KEY, BENEFITS_CACHE_MS)) this.loadBenefits();
  },
  onPullDownRefresh() { this.loadBenefits().finally(() => wx.stopPullDownRefresh()); },

  loadBenefits() {
    if (this.benefitsRequest) return this.benefitsRequest;
    const hasData = this.hasBenefitsData || Boolean(readCache(BENEFITS_CACHE_KEY));
    this.setData({ loading: !hasData, error: "" });
    this.benefitsRequest = Promise.all([api.getHome(), api.listCoupons(), api.listPoints()]).then((results) => {
      const home = results[0];
      const coupons = results[1];
      const points = results[2];
      const value = { home, coupons: coupons || [], points };
      writeCache(BENEFITS_CACHE_KEY, value);
      this.applyBenefits(value);
    }).catch((error) => {
      if (this.hasBenefitsData) wx.showToast({ title: "权益刷新失败", icon: "none" });
      else this.setData({ loading: false, error: error.message || "权益加载失败" });
    }).finally(() => {
      this.benefitsRequest = null;
    });
    return this.benefitsRequest;
  },

  applyBenefits({ home, coupons, points }) {
      const balance = points.balance || 0;
      this.hasBenefitsData = true;
      this.setData({
        loading: false,
        error: "",
        pointsBalance: balance,
        exchangeItems: (home.exchangeItems || []).map((item) => ({
          ...item,
          canExchange: balance >= item.pointsCost,
          pointsGap: Math.max(0, item.pointsCost - balance)
        })),
        coupons: prepareCoupons(coupons),
        pointRows: (points.rows || []).map(preparePoint)
      });
  },

  switchTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }); },

  async exchange(event) {
    const item = this.data.exchangeItems.find((row) => row._id === event.currentTarget.dataset.id);
    if (!item || !item.canExchange || this.data.exchangingId) return;
    if (!(await confirmExchange(item))) return;
    const storageKey = `coupon-exchange-request-${item._id}`;
    const requestId = wx.getStorageSync(storageKey) || createRequestId("exchange");
    wx.setStorageSync(storageKey, requestId);
    this.setData({ exchangingId: item._id });
    try {
      await api.exchangeCoupon({
        requestId,
        exchangeItemId: item._id,
        expectedVersion: item.version,
        expectedPointsCost: item.pointsCost
      });
      wx.removeStorageSync(storageKey);
      invalidateCache("home", "profile", BENEFITS_CACHE_KEY);
      wx.showToast({ title: "兑换成功", icon: "success" });
      await this.loadBenefits();
    } catch (error) {
      if (error && error.code === "EXCHANGE_ITEM_CHANGED") {
        wx.removeStorageSync(storageKey);
        invalidateCache(BENEFITS_CACHE_KEY);
        await this.loadBenefits();
      }
      wx.showToast({ title: error.message || "兑换失败", icon: "none" });
    } finally {
      this.setData({ exchangingId: "" });
    }
  },

  useCoupon(event) {
    wx.setStorageSync("v2-home-section", "coupons");
    wx.switchTab({ url: "/pages/home/home" });
  }
});

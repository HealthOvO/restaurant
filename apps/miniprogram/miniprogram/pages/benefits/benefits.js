const api = require("../../services/v2");
const { createRequestId } = require("../../utils/v2-cart");
const { cacheGeneration, invalidateCache, isCacheFresh, readCache, writeCacheIfCurrent } = require("../../utils/v2-cache");
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
    exchangeItems: [], coupons: [], pointRows: [], nextPointCursor: "", loadingMorePoints: false, exchangingId: ""
  },

  onLoad() {
    const cached = readCache(BENEFITS_CACHE_KEY);
    if (cached) this.applyBenefits(cached);
  },

  onShow() {
    if (!isCacheFresh(BENEFITS_CACHE_KEY, BENEFITS_CACHE_MS)) this.loadBenefits();
  },
  onPullDownRefresh() { this.loadBenefits().finally(() => wx.stopPullDownRefresh()); },

  loadBenefits(force = false) {
    const currentGeneration = cacheGeneration(BENEFITS_CACHE_KEY);
    const forceRefresh = force === true || Boolean(this.benefitsRequest && this.benefitsRequestGeneration !== currentGeneration);
    if (this.benefitsRequest) {
      if (!forceRefresh) return this.benefitsRequest;
      this.benefitsRevision = Number(this.benefitsRevision || 0) + 1;
      const staleRequest = this.benefitsRequest;
      return staleRequest.catch(() => undefined).then(() => this.loadBenefits(true));
    }
    const requestRevision = Number(this.benefitsRevision || 0) + 1;
    this.benefitsRevision = requestRevision;
    const requestGeneration = currentGeneration;
    this.benefitsRequestGeneration = requestGeneration;
    const hasData = this.hasBenefitsData || Boolean(readCache(BENEFITS_CACHE_KEY));
    this.setData({ loading: !hasData, error: "" });
    const request = Promise.all([api.getHome(), api.listCoupons(), api.listPoints()]).then((results) => {
      if (requestRevision !== this.benefitsRevision || cacheGeneration(BENEFITS_CACHE_KEY) !== requestGeneration) return;
      const home = results[0];
      const coupons = results[1];
      const points = results[2];
      const value = { home, coupons: coupons || [], points };
      writeCacheIfCurrent(BENEFITS_CACHE_KEY, value, requestGeneration);
      this.applyBenefits(value);
    }).catch((error) => {
      if (requestRevision !== this.benefitsRevision || cacheGeneration(BENEFITS_CACHE_KEY) !== requestGeneration) return;
      if (this.hasBenefitsData) wx.showToast({ title: "权益刷新失败", icon: "none" });
      else this.setData({ loading: false, error: error.message || "权益加载失败" });
    }).finally(() => {
      if (this.benefitsRequest === request) this.benefitsRequest = null;
    });
    this.benefitsRequest = request;
    return request;
  },

  applyBenefits({ home, coupons, points }) {
      const balance = points.balance || 0;
      this.benefitsSource = { home, coupons: coupons || [], points: points || { balance, rows: [] } };
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
        pointRows: (points.rows || []).map(preparePoint),
        nextPointCursor: points.nextCursor || ""
      });
  },

  async loadMorePoints() {
    if (!this.data.nextPointCursor || this.data.loadingMorePoints) return;
    const generation = cacheGeneration(BENEFITS_CACHE_KEY);
    const requestRevision = Number(this.benefitsRevision || 0);
    const cursor = this.data.nextPointCursor;
    this.setData({ loadingMorePoints: true });
    try {
      const next = await api.listPoints(cursor);
      if (Number(this.benefitsRevision || 0) !== requestRevision || this.data.nextPointCursor !== cursor || cacheGeneration(BENEFITS_CACHE_KEY) !== generation) return;
      const current = this.benefitsSource || { home: {}, coupons: [], points: { balance: this.data.pointsBalance, rows: [] } };
      const rows = Array.from(new Map([
        ...(current.points.rows || []),
        ...(next.rows || [])
      ].map((row) => [row._id, row])).values());
      const value = {
        home: current.home,
        coupons: current.coupons,
        points: { balance: next.balance, rows, nextCursor: next.nextCursor }
      };
      writeCacheIfCurrent(BENEFITS_CACHE_KEY, value, generation);
      this.applyBenefits(value);
    } catch (error) {
      wx.showToast({ title: error.message || "更早积分明细加载失败", icon: "none" });
    } finally {
      this.setData({ loadingMorePoints: false });
    }
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
      await this.loadBenefits(true);
    } catch (error) {
      if (error && error.code === "EXCHANGE_ITEM_CHANGED") {
        wx.removeStorageSync(storageKey);
        invalidateCache(BENEFITS_CACHE_KEY);
        await this.loadBenefits(true);
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

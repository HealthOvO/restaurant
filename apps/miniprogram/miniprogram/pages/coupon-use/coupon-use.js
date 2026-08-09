const api = require("../../services/v2");
const { createRequestId } = require("../../utils/v2-cart");

Page({
  data: { loading: true, error: "", couponId: "", coupon: null, product: null, submitting: false },

  onLoad(options) {
    this.setData({ couponId: options && options.couponId ? options.couponId : "" });
    this.loadCoupon();
  },

  loadCoupon() {
    if (!this.data.couponId) {
      this.setData({ loading: false, error: "商品券信息不完整" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "" });
    return Promise.all([api.getHome(), api.listCoupons()]).then((results) => {
      const home = results[0];
      const coupons = results[1];
      const coupon = (coupons || []).find((item) => item._id === this.data.couponId);
      const source = coupon && (coupon.productSnapshot || (home.products || []).find((item) => item._id === coupon.productId));
      if (!coupon || coupon.status !== "AVAILABLE") throw new Error("这张商品券当前不能使用");
      if (!source) throw new Error("指定商品暂时不可下单");
      const product = JSON.parse(JSON.stringify(source));
      product.specGroups = (product.specGroups || []).map((group) => {
        const choices = group.choices.map((choice) => ({
          ...choice,
          couponEnabled: choice.enabled && choice.priceDelta === 0,
          selected: Boolean(choice.enabled && choice.priceDelta === 0 && choice.isDefault)
        }));
        if (group.mode === "SINGLE" && choices.filter((choice) => choice.selected).length > 1) {
          let kept = false;
          choices.forEach((choice) => { if (choice.selected && !kept) kept = true; else choice.selected = false; });
        }
        if (group.required && !choices.some((choice) => choice.selected)) {
          const first = choices.find((choice) => choice.couponEnabled);
          if (first) first.selected = true;
        }
        return { ...group, choices };
      });
      this.setData({ loading: false, coupon, product });
    }).catch((error) => this.setData({ loading: false, error: error.message || "商品券加载失败" }));
  },

  toggleChoice(event) {
    const { groupId, choiceId } = event.currentTarget.dataset;
    const product = JSON.parse(JSON.stringify(this.data.product));
    const group = product.specGroups.find((item) => item.id === groupId);
    const choice = group && group.choices.find((item) => item.id === choiceId);
    if (!choice || !choice.couponEnabled) return;
    if (group.mode === "SINGLE") group.choices.forEach((item) => { item.selected = item.id === choiceId; });
    else {
      const count = group.choices.filter((item) => item.selected).length;
      if (!choice.selected && count >= (group.maxSelect || group.choices.length)) {
        wx.showToast({ title: `最多选择 ${group.maxSelect} 项`, icon: "none" });
        return;
      }
      choice.selected = !choice.selected;
    }
    this.setData({ product });
  },

  async submit() {
    const product = this.data.product;
    if (!product || this.data.submitting) return;
    const missing = product.specGroups.find((group) => group.required && !group.choices.some((choice) => choice.selected));
    if (missing) {
      wx.showToast({ title: `请选择${missing.name}`, icon: "none" });
      return;
    }
    const storageKey = `coupon-use-request-${this.data.couponId}`;
    const requestId = wx.getStorageSync(storageKey) || createRequestId("coupon");
    wx.setStorageSync(storageKey, requestId);
    this.setData({ submitting: true });
    try {
      const order = await api.useCoupon({
        requestId,
        couponId: this.data.couponId,
        selections: product.specGroups.map((group) => ({ groupId: group.id, choiceIds: group.choices.filter((choice) => choice.selected).map((choice) => choice.id) }))
      });
      wx.removeStorageSync(storageKey);
      wx.redirectTo({ url: `/pages/payment-result/payment-result?orderId=${order._id}` });
    } catch (error) {
      wx.showToast({ title: error.message || "下单失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

const api = require("../../services/v2");
const {
  addCartLine,
  addCouponLine,
  cartSummary,
  changeCartQuantity,
  clearCart,
  loadCart,
  reconcileCart,
  removeCartLine,
  saveCart
} = require("../../utils/v2-cart");
const { isCacheFresh, readCache, writeCache } = require("../../utils/v2-cache");

const HOME_CACHE_KEY = "home";
const HOME_CACHE_MS = 15_000;
const COUPON_CATEGORY_ID = "__coupons__";

function money(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function dateText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日到期`;
}

function prepareProducts(products) {
  return (products || []).map((product) => ({
    ...product,
    priceText: money(product.basePrice),
    pointsText: product.pointsEnabled && product.buyerPointsPerUnit > 0 ? `+${product.buyerPointsPerUnit} 积分` : ""
  }));
}

function prepareCartItems(cart) {
  return (cart || []).map((item) => ({
    ...item,
    isCoupon: item.kind === "COUPON",
    priceText: item.kind === "COUPON" ? "商品券抵扣" : money(item.unitPrice * item.quantity),
    originalPriceText: item.kind === "COUPON" ? money(item.originalUnitPrice || item.basePrice || 0) : "",
    specText: (item.selectedChoices || []).map((choice) => choice.choiceName).join(" · ") || "标准规格"
  }));
}

function activeProductFrom(source, couponMode) {
  const product = JSON.parse(JSON.stringify(source));
  product.specGroups = (product.specGroups || []).map((group) => {
    let hasSelected = false;
    const choices = group.choices.map((choice) => {
      const selectable = Boolean(choice.enabled && (!couponMode || choice.priceDelta === 0));
      const selected = Boolean(selectable && choice.isDefault);
      if (selected) hasSelected = true;
      return { ...choice, selectable, selected };
    });
    if (group.mode === "SINGLE" && choices.filter((choice) => choice.selected).length > 1) {
      let kept = false;
      choices.forEach((choice) => {
        if (choice.selected && !kept) kept = true;
        else choice.selected = false;
      });
      hasSelected = choices.some((choice) => choice.selected);
    }
    if (group.required && !hasSelected) {
      const first = choices.find((choice) => choice.selectable);
      if (first) first.selected = true;
    }
    return { ...group, choices };
  });
  return product;
}

Page({
  data: {
    loading: true,
    error: "",
    home: null,
    categories: [],
    activeCategoryId: "",
    activeCategoryName: "",
    visibleProducts: [],
    visibleCoupons: [],
    cart: [],
    cartItems: [],
    cartOpen: false,
    cartInfo: { count: 0, paidCount: 0, couponCount: 0, amount: 0, discount: 0, points: 0, amountText: "¥0.00", discountText: "¥0.00" },
    activeProduct: null,
    activeCoupon: null,
    activeMode: "PAID",
    activeUnitPrice: 0,
    activeUnitPriceText: "¥0.00",
    activeOriginalPriceText: "",
    activePoints: 0,
    quantity: 1
  },

  onLoad() {
    this.syncCart(loadCart());
    const cached = readCache(HOME_CACHE_KEY);
    if (cached) this.applyHome(cached);
  },

  onShow() {
    this.syncCart(loadCart());
    const requestedSection = wx.getStorageSync("v2-home-section");
    if (requestedSection === "coupons") {
      wx.removeStorageSync("v2-home-section");
      this.setData({ activeCategoryId: COUPON_CATEGORY_ID }, () => this.refreshCatalog());
      this.loadHome();
      return;
    }
    if (!isCacheFresh(HOME_CACHE_KEY, HOME_CACHE_MS)) this.loadHome();
  },

  onHide() {
    if (this.data.cartOpen || this.data.activeProduct) {
      this.setData({ cartOpen: false, activeProduct: null, activeCoupon: null });
    }
  },

  onPullDownRefresh() {
    this.loadHome().finally(() => wx.stopPullDownRefresh());
  },

  loadHome() {
    if (this.homeRequest) return this.homeRequest;
    const hasData = Boolean(this.data.home || readCache(HOME_CACHE_KEY));
    this.setData({ loading: !hasData, error: "" });
    this.homeRequest = api.getHome().then((home) => {
      getApp().globalData.home = home;
      writeCache(HOME_CACHE_KEY, home);
      this.applyHome(home);
    }).catch((error) => {
      if (this.data.home) wx.showToast({ title: "菜单刷新失败", icon: "none" });
      else this.setData({ loading: false, error: error.message || "点餐页加载失败" });
    }).finally(() => {
      this.homeRequest = null;
    });
    return this.homeRequest;
  },

  applyHome(home) {
    const products = prepareProducts(home.products);
    const fallbackCategories = products.length ? [{ _id: "default", name: "全部商品", enabled: true, sortOrder: 1 }] : [];
    const merchantCategories = (home.categories && home.categories.length ? home.categories : fallbackCategories).map((category) => ({
      ...category,
      count: products.filter((product) => !product.categoryId || product.categoryId === category._id).length
    }));
    const categories = [
      ...merchantCategories,
      { _id: COUPON_CATEGORY_ID, name: "商品券", isCoupon: true, count: (home.coupons || []).length }
    ];
    const reconciled = reconcileCart(loadCart(), home.products, home.coupons || []);
    if (reconciled.changed) saveCart(reconciled.cart);
    const currentExists = categories.some((category) => category._id === this.data.activeCategoryId);
    const activeCategoryId = currentExists ? this.data.activeCategoryId : ((merchantCategories[0] && merchantCategories[0]._id) || COUPON_CATEGORY_ID);
    this.setData({ home, products, categories, activeCategoryId, loading: false, error: "" }, () => {
      this.syncCart(reconciled.cart);
      this.refreshCatalog();
    });
    if (reconciled.removedCount > 0) wx.showToast({ title: "购物车已按最新菜单更新", icon: "none" });
  },

  refreshCatalog() {
    const home = this.data.home;
    if (!home) return;
    const activeCategory = this.data.categories.find((item) => item._id === this.data.activeCategoryId) || this.data.categories[0];
    if (!activeCategory) return;
    const couponIds = new Set(this.data.cart.filter((item) => item.kind === "COUPON").map((item) => item.couponId));
    const visibleProducts = activeCategory.isCoupon
      ? []
      : this.data.products.filter((product) => !product.categoryId || product.categoryId === activeCategory._id || activeCategory._id === "default");
    const visibleCoupons = activeCategory.isCoupon
      ? (home.coupons || []).map((coupon) => ({
        ...coupon,
        inCart: couponIds.has(coupon._id),
        expiresText: dateText(coupon.expiresAt),
        product: coupon.productSnapshot,
        originalPriceText: money((coupon.productSnapshot && coupon.productSnapshot.basePrice) || 0)
      }))
      : [];
    this.setData({ activeCategoryName: activeCategory.name, visibleProducts, visibleCoupons });
  },

  selectCategory(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || id === this.data.activeCategoryId) return;
    this.setData({ activeCategoryId: id }, () => this.refreshCatalog());
  },

  syncCart(cart) {
    const info = cartSummary(cart);
    getApp().globalData.cart = cart;
    this.setData({
      cart,
      cartItems: prepareCartItems(cart),
      cartInfo: { ...info, amountText: money(info.amount), discountText: money(info.discount) }
    }, () => this.refreshCatalog());
  },

  openProduct(event) {
    const productId = event.currentTarget.dataset.id;
    const source = this.data.products.find((item) => item._id === productId);
    if (!source || source.soldOut || !source.enabled) return;
    this.setData({
      activeProduct: activeProductFrom(source, false),
      activeCoupon: null,
      activeMode: "PAID",
      quantity: 1
    }, () => this.syncActiveTotals());
  },

  openCoupon(event) {
    const couponId = event.currentTarget.dataset.id;
    const coupon = ((this.data.home && this.data.home.coupons) || []).find((item) => item._id === couponId);
    if (!coupon || !coupon.productSnapshot) return;
    if (this.data.cart.some((item) => item.kind === "COUPON" && item.couponId === couponId)) {
      this.setData({ cartOpen: true });
      return;
    }
    this.setData({
      activeProduct: activeProductFrom(coupon.productSnapshot, true),
      activeCoupon: coupon,
      activeMode: "COUPON",
      quantity: 1
    }, () => this.syncActiveTotals());
  },

  closeProduct() {
    this.setData({ activeProduct: null, activeCoupon: null });
  },

  preventClose() {},

  toggleChoice(event) {
    const groupId = event.currentTarget.dataset.groupId;
    const choiceId = event.currentTarget.dataset.choiceId;
    const product = JSON.parse(JSON.stringify(this.data.activeProduct));
    const group = product && product.specGroups.find((item) => item.id === groupId);
    if (!group) return;
    const choice = group.choices.find((item) => item.id === choiceId);
    if (!choice || !choice.selectable) return;
    if (group.mode === "SINGLE") {
      group.choices.forEach((item) => { item.selected = item.id === choiceId; });
    } else {
      const selectedCount = group.choices.filter((item) => item.selected).length;
      if (!choice.selected && selectedCount >= (group.maxSelect || group.choices.length)) {
        wx.showToast({ title: `最多选择 ${group.maxSelect} 项`, icon: "none" });
        return;
      }
      choice.selected = !choice.selected;
    }
    this.setData({ activeProduct: product }, () => this.syncActiveTotals());
  },

  changeQuantity(event) {
    if (this.data.activeMode === "COUPON") return;
    const offset = Number(event.currentTarget.dataset.offset || 0);
    this.setData({ quantity: Math.min(99, Math.max(1, this.data.quantity + offset)) }, () => this.syncActiveTotals());
  },

  syncActiveTotals() {
    const product = this.data.activeProduct;
    if (!product) return;
    const optionPrice = product.specGroups.reduce((total, group) => total + group.choices.filter((choice) => choice.selected).reduce((sum, choice) => sum + choice.priceDelta, 0), 0);
    const originalUnitPrice = product.basePrice + optionPrice;
    const couponMode = this.data.activeMode === "COUPON";
    this.setData({
      activeUnitPrice: couponMode ? 0 : originalUnitPrice,
      activeUnitPriceText: couponMode ? "商品券抵扣" : money(originalUnitPrice * this.data.quantity),
      activeOriginalPriceText: couponMode ? money(originalUnitPrice) : "",
      activePoints: !couponMode && product.pointsEnabled ? product.buyerPointsPerUnit * this.data.quantity : 0
    });
  },

  addToCart() {
    const product = this.data.activeProduct;
    if (!product) return;
    const missing = product.specGroups.find((group) => group.required && !group.choices.some((choice) => choice.selected));
    if (missing) {
      wx.showToast({ title: `请选择${missing.name}`, icon: "none" });
      return;
    }
    const selections = product.specGroups.map((group) => ({ groupId: group.id, choiceIds: group.choices.filter((choice) => choice.selected).map((choice) => choice.id) }));
    const selectedChoices = product.specGroups.flatMap((group) => group.choices.filter((choice) => choice.selected).map((choice) => ({ groupName: group.name, choiceName: choice.name, priceDelta: choice.priceDelta })));
    let nextCart;
    try {
      if (this.data.activeMode === "COUPON") {
        const coupon = this.data.activeCoupon;
        nextCart = addCouponLine(this.data.cart, {
          couponId: coupon._id,
          couponName: coupon.name,
          productId: coupon.productId,
          productName: coupon.productName,
          imageUrl: product.imageUrl,
          basePrice: product.basePrice,
          originalUnitPrice: product.basePrice,
          selections,
          selectedChoices
        });
      } else {
        nextCart = addCartLine(this.data.cart, {
          productId: product._id,
          productName: product.name,
          imageUrl: product.imageUrl,
          basePrice: product.basePrice,
          unitPrice: this.data.activeUnitPrice,
          buyerPointsPerUnit: product.pointsEnabled ? product.buyerPointsPerUnit : 0,
          quantity: this.data.quantity,
          selections,
          selectedChoices
        });
      }
    } catch (error) {
      wx.showToast({ title: error.message || "暂时无法加入购物车", icon: "none" });
      return;
    }
    saveCart(nextCart);
    this.syncCart(nextCart);
    this.closeProduct();
    wx.showToast({ title: this.data.activeMode === "COUPON" ? "商品券已加入" : "已加入购物车", icon: "success" });
  },

  openCart() {
    if (this.data.cartInfo.count > 0) this.setData({ cartOpen: true });
  },

  closeCart() {
    this.setData({ cartOpen: false });
  },

  changeCartItem(event) {
    const key = event.currentTarget.dataset.key;
    const offset = Number(event.currentTarget.dataset.offset || 0);
    let next;
    try {
      next = changeCartQuantity(this.data.cart, key, offset);
    } catch (error) {
      wx.showToast({ title: error.message || "数量已达上限", icon: "none" });
      return;
    }
    saveCart(next);
    this.syncCart(next);
    if (!next.length) this.closeCart();
  },

  removeCartItem(event) {
    const next = removeCartLine(this.data.cart, event.currentTarget.dataset.key);
    saveCart(next);
    this.syncCart(next);
    if (!next.length) this.closeCart();
  },

  clearCartItems() {
    wx.showModal({
      title: "清空购物车",
      content: "已选商品和商品券都会移出购物车。",
      confirmText: "清空",
      confirmColor: "#A9402B",
      success: (result) => {
        if (!result.confirm) return;
        clearCart();
        this.syncCart([]);
        this.closeCart();
      }
    });
  },

  goCheckout() {
    if (this.data.home && !this.data.home.config.businessOpen && this.data.cartInfo.paidCount > 0) {
      wx.showToast({ title: "暂停接单期间仅可使用商品券", icon: "none" });
      return;
    }
    if (this.data.cartInfo.count > 0) wx.navigateTo({ url: "/pages/checkout/checkout" });
  },

  goBenefits() {
    wx.switchTab({ url: "/pages/benefits/benefits" });
  }
});

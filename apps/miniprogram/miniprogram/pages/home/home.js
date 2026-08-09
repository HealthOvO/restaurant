const api = require("../../services/v2");
const { addCartLine, cartSummary, loadCart, saveCart } = require("../../utils/v2-cart");

function money(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function prepareProducts(products) {
  return (products || []).map((product) => ({
    ...product,
    priceText: money(product.basePrice),
    pointsText: product.pointsEnabled && product.buyerPointsPerUnit > 0 ? `每份 +${product.buyerPointsPerUnit} 积分` : "本商品不发积分"
  }));
}

Page({
  data: {
    loading: true,
    error: "",
    home: null,
    products: [],
    cart: [],
    cartInfo: { count: 0, amount: 0, points: 0, amountText: "¥0.00" },
    activeProduct: null,
    activeUnitPrice: 0,
    activeUnitPriceText: "¥0.00",
    activePoints: 0,
    quantity: 1
  },

  onLoad() {
    this.syncCart(loadCart());
    this.loadHome();
  },

  onShow() {
    this.syncCart(loadCart());
  },

  onPullDownRefresh() {
    this.loadHome().finally(() => wx.stopPullDownRefresh());
  },

  loadHome() {
    this.setData({ loading: true, error: "" });
    return api.getHome().then((home) => {
      getApp().globalData.home = home;
      this.setData({ home, products: prepareProducts(home.products), loading: false });
    }).catch((error) => {
      this.setData({ loading: false, error: error.message || "点餐页加载失败" });
    });
  },

  syncCart(cart) {
    const info = cartSummary(cart);
    getApp().globalData.cart = cart;
    this.setData({ cart, cartInfo: { ...info, amountText: money(info.amount) } });
  },

  openProduct(event) {
    const productId = event.currentTarget.dataset.id;
    const source = this.data.products.find((item) => item._id === productId);
    if (!source || source.soldOut || !source.enabled) return;
    const product = JSON.parse(JSON.stringify(source));
    product.specGroups = (product.specGroups || []).map((group) => {
      let hasSelected = false;
      const choices = group.choices.map((choice) => {
        const selected = Boolean(choice.enabled && choice.isDefault);
        if (selected) hasSelected = true;
        return { ...choice, selected };
      });
      if (group.required && !hasSelected) {
        const first = choices.find((choice) => choice.enabled);
        if (first) first.selected = true;
      }
      return { ...group, choices };
    });
    this.setData({ activeProduct: product, quantity: 1 }, () => this.syncActiveTotals());
  },

  closeProduct() {
    this.setData({ activeProduct: null });
  },

  preventClose() {},

  toggleChoice(event) {
    const { groupId, choiceId } = event.currentTarget.dataset;
    const product = JSON.parse(JSON.stringify(this.data.activeProduct));
    const group = product.specGroups.find((item) => item.id === groupId);
    if (!group) return;
    const choice = group.choices.find((item) => item.id === choiceId);
    if (!choice || !choice.enabled) return;
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
    const offset = Number(event.currentTarget.dataset.offset || 0);
    this.setData({ quantity: Math.min(99, Math.max(1, this.data.quantity + offset)) });
  },

  syncActiveTotals() {
    const product = this.data.activeProduct;
    if (!product) return;
    const optionPrice = product.specGroups.reduce((total, group) => total + group.choices.filter((choice) => choice.selected).reduce((sum, choice) => sum + choice.priceDelta, 0), 0);
    const unitPrice = product.basePrice + optionPrice;
    this.setData({
      activeUnitPrice: unitPrice,
      activeUnitPriceText: money(unitPrice),
      activePoints: product.pointsEnabled ? product.buyerPointsPerUnit * this.data.quantity : 0
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
    const nextCart = addCartLine(this.data.cart, {
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
    saveCart(nextCart);
    this.syncCart(nextCart);
    this.closeProduct();
    wx.showToast({ title: "已加入购物车", icon: "success" });
  },

  goCheckout() {
    if (this.data.cartInfo.count > 0) wx.navigateTo({ url: "/pages/checkout/checkout" });
  },

  goBenefits() {
    wx.switchTab({ url: "/pages/benefits/benefits" });
  }
});

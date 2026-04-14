const { fetchMenuCatalog } = require("../../services/order");
const { getAppState } = require("../../utils/session");
const { applyStoreLaunchContext } = require("../../utils/store-context");
const {
  loadCart,
  summarizeCart,
  buildCartLineId,
  addCartItem,
  updateCartItemQuantity
} = require("../../utils/cart");

function formatAmount(value) {
  return Number(value || 0).toFixed(0);
}

function decorateCatalogItems(items) {
  return (items || []).map((item) => ({
    ...item,
    priceText: `¥${formatAmount(item.price || 0)}`,
    salesText: item.monthlySales ? `月售 ${item.monthlySales}` : "现点现做",
    optionHint: (item.optionGroups || [])
      .map((group) => group.name)
      .slice(0, 2)
      .join(" / ")
  }));
}

function decorateCartItems(items) {
  return (items || []).map((item) => ({
    ...item,
    lineTotalText: formatAmount(item.lineTotal),
    selectedOptionsText:
      item.selectedOptions && item.selectedOptions.length
        ? item.selectedOptions.map((option) => option.choiceName).join(" / ")
        : ""
  }));
}

function resolveActiveCategoryId(categories, currentCategoryId) {
  const availableCategories = categories || [];
  if (!availableCategories.length) {
    return "";
  }

  if (currentCategoryId && availableCategories.find((item) => item._id === currentCategoryId)) {
    return currentCategoryId;
  }

  return availableCategories[0]._id;
}

function getDefaultSelectionMap(menuItem) {
  const selectionMap = {};
  (menuItem.optionGroups || []).forEach((group) => {
    const enabledChoices = (group.choices || []).filter((choice) => choice.isEnabled);
    const defaultChoice = enabledChoices.find((choice) => choice.isDefault) || (group.required ? enabledChoices[0] : null);
    selectionMap[group._id] = defaultChoice ? [defaultChoice._id] : [];
  });
  return selectionMap;
}

function buildSelectedOptions(menuItem, selectionMap) {
  const selectedOptions = [];
  (menuItem.optionGroups || []).forEach((group) => {
    const selectedChoiceIds = selectionMap[group._id] || [];
    const enabledChoices = (group.choices || []).filter((choice) => choice.isEnabled);
    const effectiveChoiceIds =
      selectedChoiceIds.length > 0
        ? selectedChoiceIds
        : (() => {
            const defaultChoice = enabledChoices.find((choice) => choice.isDefault) || (group.required ? enabledChoices[0] : null);
            return defaultChoice ? [defaultChoice._id] : [];
          })();

    effectiveChoiceIds.forEach((choiceId) => {
      const choice = enabledChoices.find((current) => current._id === choiceId);
      if (!choice) {
        return;
      }

      selectedOptions.push({
        groupId: group._id,
        groupName: group.name,
        choiceId: choice._id,
        choiceName: choice.name,
        priceDelta: Number(choice.priceDelta) || 0
      });
    });
  });

  return selectedOptions;
}

function computeUnitPrice(menuItem, selectedOptions) {
  return Number(menuItem.price || 0) + selectedOptions.reduce((total, option) => total + Number(option.priceDelta || 0), 0);
}

function findChoiceById(group, choiceId) {
  return (group && group.choices ? group.choices : []).find((choice) => choice._id === choiceId) || null;
}

function findMissingRequiredGroup(menuItem, selectionMap) {
  return (menuItem.optionGroups || []).find((group) => {
    if (!group.required) {
      return false;
    }

    const selectedChoiceIds = selectionMap[group._id] || [];
    if (selectedChoiceIds.length > 0) {
      return false;
    }

    return !(group.choices || []).some((choice) => choice.isEnabled && choice.isDefault);
  });
}

function cacheStoreConfig(storeId, storeConfig) {
  if (!storeId || !storeConfig) {
    return;
  }

  const appState = getAppState();
  appState.storeConfigCache = {
    ...(appState.storeConfigCache || {}),
    [storeId]: storeConfig
  };
}

Page({
  data: {
    loading: true,
    errorMessage: "",
    storeConfig: null,
    categories: [],
    items: [],
    activeCategoryId: "",
    visibleItems: [],
    cartItems: [],
    cartItemCount: 0,
    cartTotalAmount: 0,
    cartTotalAmountText: "0",
    activeTableNo: "",
    optionSheetVisible: false,
    activeMenuItem: null,
    optionSelectionMap: {}
  },
  onLoad(query) {
    const context = applyStoreLaunchContext(query);
    this.setData({
      activeTableNo: context.tableNo || ""
    });
  },
  onShow() {
    this.refresh();
  },
  syncCart() {
    const storeId = getAppState().storeId;
    const cartItems = decorateCartItems(loadCart(storeId));
    const summary = summarizeCart(cartItems);
    this.setData({
      cartItems,
      cartItemCount: summary.itemCount,
      cartTotalAmount: summary.totalAmount,
      cartTotalAmountText: formatAmount(summary.totalAmount)
    });
  },
  syncVisibleItems(nextActiveCategoryId) {
    this.setData({
      visibleItems: this.data.items.filter((item) => item.categoryId === nextActiveCategoryId)
    });
  },
  async refresh() {
    this.setData({
      loading: true,
      errorMessage: ""
    });

    try {
      const catalog = await fetchMenuCatalog();
      cacheStoreConfig(getAppState().storeId, catalog.storeConfig);
      const categories = catalog.categories || [];
      const items = decorateCatalogItems(catalog.items || []);
      const activeCategoryId = resolveActiveCategoryId(categories, this.data.activeCategoryId);
      this.setData({
        storeConfig: catalog.storeConfig,
        categories,
        items,
        activeCategoryId,
        activeTableNo: getAppState().activeTableNo || this.data.activeTableNo || ""
      });
      this.syncVisibleItems(activeCategoryId);
      this.syncCart();
    } catch (error) {
      this.setData({
        errorMessage: error.message || "菜单加载失败，请稍后再试"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  selectCategory(event) {
    const categoryId = event.currentTarget.dataset.categoryId;
    this.setData({
      activeCategoryId: categoryId
    });
    this.syncVisibleItems(categoryId);
  },
  openOptionsForItem(menuItem) {
    this.setData({
      optionSheetVisible: true,
      activeMenuItem: menuItem,
      optionSelectionMap: getDefaultSelectionMap(menuItem)
    });
  },
  quickAdd(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const menuItem = this.data.items.find((item) => item._id === itemId);
    if (!menuItem) {
      return;
    }

    if (menuItem.optionGroups && menuItem.optionGroups.length > 0) {
      this.openOptionsForItem(menuItem);
      return;
    }

    this.addPreparedItem(menuItem, []);
  },
  toggleOption(event) {
    const groupId = event.currentTarget.dataset.groupId;
    const choiceId = event.currentTarget.dataset.choiceId;
    const menuItem = this.data.activeMenuItem;
    if (!menuItem) {
      return;
    }

    const group = (menuItem.optionGroups || []).find((item) => item._id === groupId);
    if (!group) {
      return;
    }

    const choice = findChoiceById(group, choiceId);
    if (!choice || !choice.isEnabled) {
      wx.showToast({
        icon: "none",
        title: "这个规格暂时不可选"
      });
      return;
    }

    const currentSelection = this.data.optionSelectionMap[groupId] || [];
    let nextSelection = [];
    if (group.multiSelect) {
      if (group.maxSelect && !currentSelection.includes(choiceId) && currentSelection.length >= group.maxSelect) {
        wx.showToast({
          icon: "none",
          title: `最多选择 ${group.maxSelect} 项`
        });
        return;
      }
      nextSelection = currentSelection.includes(choiceId)
        ? currentSelection.filter((item) => item !== choiceId)
        : currentSelection.concat(choiceId);
    } else {
      nextSelection = [choiceId];
    }

    this.setData({
      optionSelectionMap: {
        ...this.data.optionSelectionMap,
        [groupId]: nextSelection
      }
    });
  },
  closeOptionSheet() {
    this.setData({
      optionSheetVisible: false,
      activeMenuItem: null,
      optionSelectionMap: {}
    });
  },
  addPreparedItem(menuItem, selectedOptions) {
    const storeId = getAppState().storeId;
    const unitPrice = computeUnitPrice(menuItem, selectedOptions);
    const lineId = buildCartLineId(menuItem._id, selectedOptions);
    addCartItem(storeId, {
      lineId,
      menuItemId: menuItem._id,
      categoryId: menuItem.categoryId,
      name: menuItem.name,
      imageUrl: menuItem.imageUrl,
      quantity: 1,
      basePrice: Number(menuItem.price || 0),
      unitPrice,
      lineTotal: unitPrice,
      selectedOptions
    });
    this.syncCart();
    wx.showToast({
      title: "已加入购物车"
    });
  },
  confirmOptionSelection() {
    const menuItem = this.data.activeMenuItem;
    if (!menuItem) {
      return;
    }

    const missingRequiredGroup = findMissingRequiredGroup(menuItem, this.data.optionSelectionMap);
    if (missingRequiredGroup) {
      wx.showToast({
        icon: "none",
        title: `请先选择${missingRequiredGroup.name}`
      });
      return;
    }

    const selectedOptions = buildSelectedOptions(menuItem, this.data.optionSelectionMap);
    this.addPreparedItem(menuItem, selectedOptions);
    this.closeOptionSheet();
  },
  increaseCartItem(event) {
    const lineId = event.currentTarget.dataset.lineId;
    const targetItem = this.data.cartItems.find((item) => item.lineId === lineId);
    if (!targetItem) {
      return;
    }

    updateCartItemQuantity(getAppState().storeId, lineId, targetItem.quantity + 1);
    this.syncCart();
  },
  decreaseCartItem(event) {
    const lineId = event.currentTarget.dataset.lineId;
    const targetItem = this.data.cartItems.find((item) => item.lineId === lineId);
    if (!targetItem) {
      return;
    }

    updateCartItemQuantity(getAppState().storeId, lineId, targetItem.quantity - 1);
    this.syncCart();
  },
  goCheckout() {
    if (!this.data.cartItemCount) {
      wx.showToast({
        icon: "none",
        title: "先加几样菜"
      });
      return;
    }

    wx.navigateTo({ url: "/pages/checkout/checkout" });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  noop() {}
});

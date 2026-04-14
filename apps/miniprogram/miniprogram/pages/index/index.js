const { fetchMenuCatalog } = require("../../services/order");
const { refreshMemberState } = require("../../utils/member-access");
const { getAppState, resolveStaffEntryPath } = require("../../utils/session");
const { applyStoreLaunchContext } = require("../../utils/store-context");

function buildRecommendedItems(items) {
  return (items || []).map((item) => ({
    ...item,
    priceText: `¥${Number(item.price || 0).toFixed(0)}`,
    salesText: item.monthlySales ? `月售 ${item.monthlySales}` : "现点现做",
    tagsText: Array.isArray(item.tags) ? item.tags.slice(0, 2) : []
  }));
}

function resolveMemberSummary(member) {
  if (!member) {
    return {
      label: "未注册",
      actionTitle: "先注册会员",
      actionCopy: "注册后邀请、积分和菜品券才会完整记录。"
    };
  }

  if (!member.phoneVerifiedAt) {
    return {
      label: "待验证",
      actionTitle: "先补微信手机号验证",
      actionCopy: "这样后续首单、邀请积分和菜品券才能准确到账。"
    };
  }

  if (!member.hasCompletedFirstVisit) {
    return {
      label: "已开通",
      actionTitle: "首单后会自动结算",
      actionCopy: "到店消费完成后，系统会自动记录首单并更新邀请和积分。"
    };
  }

  return {
    label: "已激活",
    actionTitle: "现在可以直接点餐和看积分",
    actionCopy: "后面重点看订单状态、邀请进度和菜品券到账。"
  };
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
    recommendedItems: [],
    activeTableNo: "",
    hasMember: false,
    pointsBalance: 0,
    memberStatusText: "未注册",
    memberActionTitle: "先注册会员",
    memberActionCopy: "注册后邀请、积分和菜品券才会完整记录。"
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
  async refresh() {
    this.setData({
      loading: true,
      errorMessage: ""
    });

    try {
      const [catalog, memberState] = await Promise.all([
        fetchMenuCatalog(),
        refreshMemberState().catch(() => ({ member: null, relation: null }))
      ]);
      const member = memberState.member || null;
      const memberSummary = resolveMemberSummary(member);
      const appState = getAppState();
      cacheStoreConfig(appState.storeId, catalog.storeConfig);

      this.setData({
        storeConfig: catalog.storeConfig,
        categories: catalog.categories || [],
        recommendedItems: buildRecommendedItems(catalog.recommendedItems || catalog.items || []),
        activeTableNo: appState.activeTableNo || "",
        hasMember: !!member,
        pointsBalance: member && Number(member.pointsBalance) ? Number(member.pointsBalance) : 0,
        memberStatusText: memberSummary.label,
        memberActionTitle: memberSummary.actionTitle,
        memberActionCopy: memberSummary.actionCopy
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "首页加载失败，请稍后再试"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  goMenu() {
    wx.switchTab({ url: "/pages/menu/menu" });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  goVouchers() {
    wx.navigateTo({ url: "/pages/vouchers/vouchers" });
  },
  goMine() {
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  goRegister() {
    wx.navigateTo({ url: "/pages/register/register" });
  },
  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/feedback" });
  },
  goStaffEntry() {
    wx.navigateTo({ url: resolveStaffEntryPath() });
  }
});

const { fetchMenuCatalog } = require("../../services/order");
const { refreshMemberState } = require("../../utils/member-access");
const { getAppState, resolveStaffEntryPath } = require("../../utils/session");
const { applyStoreLaunchContext } = require("../../utils/store-context");

function buildRecommendedItems(items) {
  return (items || [])
    .slice(0, 3)
    .map((item) => ({
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
      actionTitle: "注册会员",
      actionCopy: "积分和兑换都在我的。"
    };
  }

  if (!member.phoneVerifiedAt) {
    return {
      label: "待验证",
      actionTitle: "验证手机号",
      actionCopy: "验证后开始累计积分。"
    };
  }

  if (!member.hasCompletedFirstVisit) {
    return {
      label: "待首单",
      actionTitle: "查看积分",
      actionCopy: "首单完成后自动更新。"
    };
  }

  return {
    label: "已开通",
    actionTitle: "我的积分",
    actionCopy: "邀请、积分、兑换都在我的。"
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
    memberActionTitle: "注册会员",
    memberActionCopy: "积分和兑换都在我的。"
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
        errorMessage: error.message || "首页加载失败"
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

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
      actionCopy: "注册后可看积分和券。"
    };
  }

  if (!member.phoneVerifiedAt) {
    return {
      label: "待验证",
      actionTitle: "验证手机号",
      actionCopy: "验证后才能累计积分。"
    };
  }

  if (!member.hasCompletedFirstVisit) {
    return {
      label: "待首单",
      actionTitle: "去点餐",
      actionCopy: "首单完成后会更新积分。"
    };
  }

  return {
    label: "已开通",
    actionTitle: "积分和券",
    actionCopy: "邀请、积分和券都在我的。"
  };
}

function resolveInviterLabel(inviterSummary) {
  if (!inviterSummary) {
    return "";
  }

  return inviterSummary.nickname || inviterSummary.memberCode || "邀请人";
}

function buildInviteReminder(memberState) {
  const member = memberState && memberState.member;
  const relation = memberState && memberState.relation;
  if (!member) {
    return null;
  }

  const inviterLabel = resolveInviterLabel(memberState.inviterSummary);
  if (relation) {
    return {
      statusText: relation.status === "ACTIVATED" ? "已生效" : "已绑定",
      title: relation.status === "ACTIVATED" ? "邀请关系已生效" : "已绑定邀请人",
      copy:
        relation.status === "ACTIVATED"
          ? inviterLabel
            ? `${inviterLabel} 的邀请已计入进度。`
            : "这次邀请已经计入进度。"
          : inviterLabel
            ? `当前绑定给 ${inviterLabel}，首单后生效。`
            : "当前邀请关系已记录，首单后生效。"
    };
  }

  if (memberState.canBindInvite && memberState.pendingInviteCode) {
    return {
      statusText: "待绑定",
      title: "首单前还能绑定邀请人",
      copy: inviterLabel
        ? `当前识别到 ${inviterLabel} 的邀请码，想参加活动记得先绑定。`
        : `检测到邀请码 ${memberState.pendingInviteCode}，想参加活动记得先绑定。`
    };
  }

  return null;
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
    memberActionCopy: "积分和兑换都在我的。",
    inviteReminder: null
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
        memberActionCopy: memberSummary.actionCopy,
        inviteReminder: buildInviteReminder(memberState)
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
  goInviteCenter() {
    wx.navigateTo({ url: "/pages/invite/invite" });
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

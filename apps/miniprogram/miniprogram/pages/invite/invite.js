const { bindInviteByCode, fetchInviteOverview } = require("../../services/member");
const { refreshMemberState } = require("../../utils/member-access");
const { getAppState } = require("../../utils/session");
const { formatInviteRelationStatus } = require("../../utils/format");

function resolveInviteErrorMessage(error) {
  if (error && error.code === "SELF_INVITE_FORBIDDEN") {
    return "不能填写自己的邀请码，请换一个邀请码";
  }

  return (error && error.message) || "加载邀请数据失败";
}

function resolveNextMilestoneSummary(overview) {
  const milestones = (overview && overview.milestones) || [];
  const pendingReward = milestones.find((item) => item.pendingRewardCount > 0);
  if (pendingReward) {
    return {
      title: "有积分待入账",
      copy: `${pendingReward.title} 已达标，待补发 ${pendingReward.pendingRewardCount * pendingReward.pointsReward} 积分。`
    };
  }

  const nextMilestone = milestones.find((item) => !item.isReached);
  if (nextMilestone) {
    const targetText =
      nextMilestone.rewardMode === "REPEATABLE"
        ? `每满 ${nextMilestone.threshold} 人送 ${nextMilestone.pointsReward} 积分`
        : `${nextMilestone.threshold} 人达标送 ${nextMilestone.pointsReward} 积分`;
    return {
      title: `下一档：${nextMilestone.threshold} 人`,
      copy: `再邀请几位，达标就送 ${targetText}。`
    };
  }

  const repeatableRule = milestones.find((item) => item.rewardMode === "REPEATABLE");
  if (repeatableRule) {
    return {
      title: "循环积分中",
      copy: `每满 ${repeatableRule.threshold} 人再送 ${repeatableRule.pointsReward} 积分。`
    };
  }

  return {
    title: "继续邀请好友",
    copy: "好友首单后会计入进度。"
  };
}

Page({
  data: {
    ready: false,
    hasMember: false,
    member: null,
    relation: null,
    relationStatusText: "",
    overview: null,
    nextMilestoneTitle: "继续邀请好友",
    nextMilestoneCopy: "好友首单后会计入进度。",
    pendingInviteCode: "",
    inviterSummary: null,
    inviteCodeInput: "",
    canBindInviteCode: false,
    bindingInviteCode: false,
    loadError: ""
  },
  onShow() {
    this.refresh();
  },
  async refresh() {
    this.setData({
      ready: false,
      loadError: ""
    });
    try {
      const memberState = await refreshMemberState();
      const { member, relation } = memberState;
      const response = await fetchInviteOverview();
      const milestoneSummary = resolveNextMilestoneSummary(response.overview);
      this.setData({
        ready: true,
        hasMember: true,
        member,
        relation,
        relationStatusText: formatInviteRelationStatus(relation && relation.status),
        overview: response.overview,
        nextMilestoneTitle: milestoneSummary.title,
        nextMilestoneCopy: milestoneSummary.copy,
        pendingInviteCode: memberState.pendingInviteCode || "",
        inviterSummary: memberState.inviterSummary || null,
        canBindInviteCode: !relation && !!(member && member.phoneVerifiedAt && !member.hasCompletedFirstVisit)
      });
    } catch (error) {
      const appState = getAppState();
      const member = appState.member || null;
      const relation = appState.relation || null;
      const message = resolveInviteErrorMessage(error);
      const milestoneSummary = resolveNextMilestoneSummary(null);
      this.setData({
        ready: true,
        hasMember: !!member,
        member,
        relation,
        relationStatusText: formatInviteRelationStatus(relation && relation.status),
        overview: null,
        nextMilestoneTitle: milestoneSummary.title,
        nextMilestoneCopy: milestoneSummary.copy,
        pendingInviteCode: appState.pendingInviteCode || "",
        inviterSummary: appState.inviterSummary || null,
        canBindInviteCode: !relation && !!(member && member.phoneVerifiedAt && !member.hasCompletedFirstVisit),
        loadError: message
      });
      if (member) {
        wx.showToast({
          icon: "none",
          title: message
        });
      }
    }
  },
  onShareAppMessage() {
    const member = this.data.member;
    const storeId = getAppState().storeId;
    const query = [];
    if (storeId) {
      query.push(`storeId=${encodeURIComponent(storeId)}`);
    }
    if (member && member.memberCode) {
      query.push(`inviteCode=${encodeURIComponent(member.memberCode)}`);
    }
    return {
      title: "来店里吃饭，一起攒积分换菜",
      path: query.length > 0 ? `/pages/index/index?${query.join("&")}` : "/pages/index/index"
    };
  },
  onInviteCodeInput(event) {
    this.setData({
      inviteCodeInput: (event.detail.value || "").trim().toUpperCase()
    });
  },
  copyInviteCode() {
    const member = this.data.member;
    if (!member || !member.memberCode) {
      return;
    }
    wx.setClipboardData({
      data: member.memberCode
    });
  },
  async bindInviteCode() {
    if (this.data.bindingInviteCode) {
      return;
    }

    if (!this.data.member) {
      wx.showToast({
        icon: "none",
          title: "请先回首页完成会员注册"
      });
      return;
    }

    if (!this.data.canBindInviteCode) {
      wx.showToast({
        icon: "none",
        title: this.data.relation ? "邀请关系已锁定" : "当前不可绑定邀请码"
      });
      return;
    }

    const inviteCode = this.data.inviteCodeInput;
    if (!inviteCode) {
      wx.showToast({
        icon: "none",
        title: "请输入邀请码"
      });
      return;
    }

    this.setData({ bindingInviteCode: true });
    try {
      const response = await bindInviteByCode(inviteCode);
      const appState = getAppState();
      appState.relation = response.relation;
      this.setData({
        relation: response.relation,
        relationStatusText: formatInviteRelationStatus(response.relation && response.relation.status),
        inviteCodeInput: "",
        canBindInviteCode: false
      });
      wx.showToast({ title: "绑定成功" });
      await this.refresh();
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: resolveInviteErrorMessage(error)
      });
    } finally {
      this.setData({ bindingInviteCode: false });
    }
  }
});

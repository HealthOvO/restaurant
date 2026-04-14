const { refreshMemberState } = require("../../utils/member-access");
const { getAppState } = require("../../utils/session");
const { formatDateTime } = require("../../utils/format");
const { applyStoreLaunchContext } = require("../../utils/store-context");

function maskPhone(phone) {
  if (!phone || phone.length < 7) {
    return phone || "";
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function isPhoneVerified(member) {
  return !!(member && member.phone && member.phoneVerifiedAt);
}

function resolveMemberPhoneText(member) {
  if (!member || !member.phone) {
    return "未绑定";
  }

  if (member.phoneVerifiedAt) {
    return `${maskPhone(member.phone)}（已验证）`;
  }

  return "待验证";
}

function resolveInviteStatusText(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return "待验证";
  }
  if (!relation) {
    return member && member.hasCompletedFirstVisit ? "可邀请" : "可绑定";
  }
  if (relation.status === "ACTIVATED") {
    return "已激活";
  }
  if (relation.status === "PENDING") {
    return "待首单";
  }
  if (relation.status === "ADJUSTED") {
    return "已调整";
  }
  return "已绑定";
}

function resolveInviteDetail(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return "先完成手机号验证。";
  }
  if (!relation && member && !member.hasCompletedFirstVisit) {
    return "首单前可填写邀请码。";
  }
  if (!relation) {
    return "可以直接分享自己的邀请码。";
  }
  if (relation.status === "ACTIVATED") {
    return "已计入邀请进度。";
  }
  if (relation.status === "PENDING") {
    return "首单后生效。";
  }
  if (relation.status === "ADJUSTED") {
    return "老板已调整。";
  }
  return "邀请关系已记录。";
}

function resolveFirstVisitDetail(member) {
  if (member && member.hasCompletedFirstVisit && member.firstVisitAt) {
    return `已记录 ${formatDateTime(member.firstVisitAt)}`;
  }
  if (member && member.hasCompletedFirstVisit) {
    return "已记录";
  }
  return "完成后会自动更新。";
}

function resolveStatusHeadline(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return "完成手机号验证";
  }

  if (member && !member.hasCompletedFirstVisit) {
    return relation && relation.status === "PENDING" ? "待完成首单" : "会员已开通";
  }

  if (relation && relation.status === "ACTIVATED") {
    return "会员正常";
  }

  return "查看积分和券";
}

function resolveStatusSummary(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return "验证后才能正常累计积分。";
  }

  if (member && !member.hasCompletedFirstVisit && !relation) {
    return "首单前可绑定邀请码。";
  }

  if (member && !member.hasCompletedFirstVisit && relation && relation.status === "PENDING") {
    return "首单后会更新邀请和积分。";
  }

  if (member && !member.hasCompletedFirstVisit) {
    return "完成首单后会自动更新。";
  }

  if (relation && relation.status === "ACTIVATED") {
    return "可以继续邀请好友。";
  }

  return "订单、积分和券都在这里看。";
}

function resolveNextStep(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return {
      title: "先验证手机号",
      copy: "验证后再累计积分。"
    };
  }

  if (!relation && member && !member.hasCompletedFirstVisit) {
    return {
      title: "首单前可绑定邀请码",
      copy: "也可以直接去点餐。"
    };
  }

  if (member && !member.hasCompletedFirstVisit) {
    return {
      title: "等待首单完成",
      copy: "完成后自动更新。"
    };
  }

  return {
    title: "常用入口都在下面",
    copy: "需要什么直接点。"
  };
}

function buildStatusItems(member, relation, hasBoundPhone) {
  const inviteStatusText = resolveInviteStatusText(member, relation, hasBoundPhone);
  const inviteTone =
    relation && relation.status === "ACTIVATED"
      ? "success"
      : relation && relation.status === "PENDING"
        ? "warning"
        : "neutral";

  return [
    {
      key: "phone",
      label: "手机号",
      value: hasBoundPhone ? "已验证" : "未验证",
      detail: hasBoundPhone ? `已绑定 ${maskPhone(member.phone)}` : "去注册页完成验证。",
      tone: hasBoundPhone ? "success" : "neutral"
    },
    {
      key: "invite",
      label: "邀请",
      value: inviteStatusText,
      detail: resolveInviteDetail(member, relation, hasBoundPhone),
      tone: hasBoundPhone ? inviteTone : "neutral"
    },
    {
      key: "firstVisit",
      label: "首单",
      value: member && member.hasCompletedFirstVisit ? "已完成" : "未完成",
      detail: resolveFirstVisitDetail(member),
      tone: member && member.hasCompletedFirstVisit ? "success" : "warning"
    }
  ];
}

Page({
  data: {
    loading: true,
    member: null,
    relation: null,
    errorMessage: "",
    hasBoundPhone: false,
    showInviteEntry: false,
    showRegisterButton: true,
    memberPhoneText: "未绑定",
    memberFirstVisitText: "未完成",
    memberStatusText: "待验证",
    inviteStatusText: "待验证",
    firstVisitStatusText: "未完成",
    nextStepTitle: "先验证手机号",
    nextStepCopy: "验证后再累计积分。",
    statusHeadline: "完成手机号验证",
    statusSummary: "验证后可正常累计积分。",
    statusItems: [],
    pointsBalance: 0
  },
  onLoad(query) {
    applyStoreLaunchContext(query);
  },
  onShow() {
    this.refresh();
  },
  async refresh() {
    this.setData({ loading: true, errorMessage: "" });
    try {
      const { member, relation } = await refreshMemberState();
      const hasBoundPhone = isPhoneVerified(member);
      const nextStep = resolveNextStep(member, relation, hasBoundPhone);
      const statusHeadline = resolveStatusHeadline(member, relation, hasBoundPhone);
      const statusSummary = resolveStatusSummary(member, relation, hasBoundPhone);
      this.setData({
        member,
        relation,
        hasBoundPhone,
        showInviteEntry: hasBoundPhone,
        showRegisterButton: !hasBoundPhone,
        memberPhoneText: resolveMemberPhoneText(member),
        memberFirstVisitText: member && member.firstVisitAt ? formatDateTime(member.firstVisitAt) : "未完成",
        memberStatusText: hasBoundPhone ? "已开通" : "待验证",
        inviteStatusText: resolveInviteStatusText(member, relation, hasBoundPhone),
        firstVisitStatusText: member && member.hasCompletedFirstVisit ? "已完成" : "未完成",
        nextStepTitle: nextStep.title,
        nextStepCopy: nextStep.copy,
        statusHeadline,
        statusSummary,
        statusItems: buildStatusItems(member, relation, hasBoundPhone),
        pointsBalance: member && Number(member.pointsBalance) ? Number(member.pointsBalance) : 0
      });
    } catch (error) {
      this.setData({
        member: null,
        relation: null,
        errorMessage: error.message || "加载失败，请稍后重试",
        hasBoundPhone: false,
        showInviteEntry: false,
        showRegisterButton: true,
        memberPhoneText: "未绑定",
        memberFirstVisitText: "未完成",
        memberStatusText: "待验证",
        inviteStatusText: "待验证",
        firstVisitStatusText: "未完成",
        nextStepTitle: "先验证手机号",
        nextStepCopy: "验证后再累计积分。",
        statusHeadline: "完成手机号验证",
        statusSummary: "验证后可正常累计积分。",
        statusItems: [],
        pointsBalance: 0
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  goRegister() {
    wx.navigateTo({ url: "/pages/register/register" });
  },
  goInviteCenter() {
    wx.navigateTo({ url: "/pages/invite/invite" });
  },
  goMemberCard() {
    wx.navigateTo({ url: "/pages/member-card/member-card" });
  },
  goVouchers() {
    wx.navigateTo({ url: "/pages/vouchers/vouchers" });
  },
  goRecords() {
    wx.navigateTo({ url: "/pages/records/records" });
  },
  goRules() {
    wx.navigateTo({ url: "/pages/rules/rules" });
  },
  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/feedback" });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  goStaffEntry() {
    const appState = getAppState();
    const staffTarget = appState.staffSessionToken ? "/pages/staff-home/staff-home" : "/pages/staff-login/staff-login";
    wx.navigateTo({ url: staffTarget });
  }
});

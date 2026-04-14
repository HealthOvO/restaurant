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
    return `${maskPhone(member.phone)}（微信已验证）`;
  }

  return "待微信验证";
}

function resolveInviteStatusText(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return "待验证";
  }
  if (!relation) {
    return member && member.hasCompletedFirstVisit ? "可去邀请" : "可绑定/邀请";
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
    return "先完成手机号验证，邀请关系和积分记录才会生效。";
  }
  if (!relation && member && !member.hasCompletedFirstVisit) {
    return "首单前可以填写邀请码，也可以直接开始邀请朋友。";
  }
  if (!relation) {
    return "你还没有绑定邀请人，现在可以直接分享自己的邀请码。";
  }
  if (relation.status === "ACTIVATED") {
    return "这条邀请关系已经生效，并已计入邀请进度。";
  }
  if (relation.status === "PENDING") {
    return "已经绑定，等第一次到店核销后自动生效。";
  }
  if (relation.status === "ADJUSTED") {
    return "这条邀请关系由老板后台调整过。";
  }
  return "邀请关系已经记录。";
}

function resolveFirstVisitDetail(member) {
  if (member && member.hasCompletedFirstVisit && member.firstVisitAt) {
    return `已在 ${formatDateTime(member.firstVisitAt)} 记录首次到店。`;
  }
  if (member && member.hasCompletedFirstVisit) {
    return "首次到店已经记录。";
  }
  return "完成有效消费后，系统会自动结算积分和首单记录。";
}

function resolveStatusHeadline(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return "先完成手机号验证";
  }

  if (member && !member.hasCompletedFirstVisit) {
    if (relation && relation.status === "PENDING") {
      return "邀请关系已记下，等首单生效";
    }
    return "会员已开通，首单前可先处理邀请";
  }

  if (relation && relation.status === "ACTIVATED") {
    return "已经可以继续邀请朋友了";
  }

  return "会员状态已经正常，可以直接看积分和菜品券";
}

function resolveStatusSummary(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return "验证后才能完整记录邀请关系、首单礼、积分和菜品券。";
  }

  if (member && !member.hasCompletedFirstVisit && !relation) {
    return "如果朋友给了你邀请码，首单前可以先去填写；不填也可以先邀请别人。";
  }

  if (member && !member.hasCompletedFirstVisit && relation && relation.status === "PENDING") {
    return "第一次到店完成后，系统会把首单礼和邀请进度一起结算。";
  }

  if (member && !member.hasCompletedFirstVisit) {
    return "现在只差第一次有效消费，完成后系统会自动更新状态。";
  }

  if (relation && relation.status === "ACTIVATED") {
    return "后面继续邀请新朋友到店，达标后会自动送积分，再去兑换菜品券。";
  }

  return "现在可以直接分享邀请码，后面看积分、菜品券和订单记录。";
}

function resolveNextStep(member, relation, hasBoundPhone) {
  if (!hasBoundPhone) {
    return {
      title: "先去验证手机号",
      copy: "验证后，邀请关系、首单礼、积分和菜品券记录才会完整生效。"
    };
  }

  if (!relation && member && !member.hasCompletedFirstVisit) {
    return {
      title: "首单前可先绑定邀请码，或者直接开始邀请",
      copy: "如果朋友已经把邀请码发给你，现在就能填写；如果没有，也可以先把自己的邀请码分享出去。"
    };
  }

  if (member && !member.hasCompletedFirstVisit) {
    return {
      title: "下一步是完成第一次有效消费",
      copy: "点餐并完成订单后，系统会自动结算首单礼和邀请积分。"
    };
  }

  return {
    title: "现在可以继续邀请朋友",
    copy: "后面重点看邀请人数、菜品券到账和订单记录就可以了。"
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
      detail: hasBoundPhone
        ? `已绑定 ${maskPhone(member.phone)}`
        : "先去注册页完成微信手机号验证。",
      tone: hasBoundPhone ? "success" : "neutral"
    },
    {
      key: "invite",
      label: "邀请关系",
      value: inviteStatusText,
      detail: resolveInviteDetail(member, relation, hasBoundPhone),
      tone: hasBoundPhone ? inviteTone : "neutral"
    },
    {
      key: "firstVisit",
      label: "首次有效消费",
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
    nextStepTitle: "先去验证手机号",
    nextStepCopy: "验证后，邀请关系、首单礼、积分和菜品券记录才会完整生效。",
    statusHeadline: "先完成手机号验证",
    statusSummary: "验证后才能完整记录邀请关系、首单礼、积分和菜品券。",
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
        nextStepTitle: "先去验证手机号",
        nextStepCopy: "验证后，邀请关系、首单礼、积分和菜品券记录才会完整生效。",
        statusHeadline: "先完成手机号验证",
        statusSummary: "验证后才能完整记录邀请关系、首单礼、积分和菜品券。",
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

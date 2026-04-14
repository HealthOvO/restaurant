const { bootstrapMember } = require("../../services/member");
const { getAppState } = require("../../utils/session");

function maskPhone(phone) {
  if (!phone || phone.length < 7) {
    return phone || "";
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function applyMemberResponse(appState, response) {
  appState.member = response.member;
  appState.relation = response.relation || null;
  if (
    appState.inviteCode &&
    (response.relation || (response.member && response.member.memberCode === appState.inviteCode))
  ) {
    appState.inviteCode = "";
  }
}

Page({
  data: {
    nickname: "",
    hasVerifiedPhone: false,
    phoneDisplay: "未绑定",
    hasLegacyPhone: false,
    legacyPhoneDisplay: "",
    submitting: false
  },
  onShow() {
    const appState = getAppState();
    const member = appState.member || null;
    this.setData({
      nickname: member && member.nickname ? member.nickname : "",
      hasVerifiedPhone: !!(member && member.phone && member.phoneVerifiedAt),
      phoneDisplay: member && member.phone && member.phoneVerifiedAt ? `${maskPhone(member.phone)}（微信已验证）` : "未绑定",
      hasLegacyPhone: !!(member && member.phone && !member.phoneVerifiedAt),
      legacyPhoneDisplay: member && member.phone && !member.phoneVerifiedAt ? maskPhone(member.phone) : ""
    });
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [field]: event.detail.value
    });
  },
  async submitProfile() {
    if (this.data.submitting) {
      return;
    }

    if (!this.data.hasVerifiedPhone) {
      wx.showToast({ icon: "none", title: "请先授权微信手机号" });
      return;
    }

    this.setData({ submitting: true });
    try {
      const appState = getAppState();
      const response = await bootstrapMember({
        nickname: this.data.nickname,
        inviteCode: appState.inviteCode || undefined
      });
      applyMemberResponse(appState, response);
      wx.showToast({ title: "会员资料已保存" });
      setTimeout(() => {
        wx.navigateBack();
      }, 500);
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: error.message || "保存失败"
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
  async onGetPhoneNumber(event) {
    if (this.data.submitting) {
      return;
    }

    if (event.detail.errMsg && event.detail.errMsg.indexOf(":ok") === -1) {
      wx.showToast({
        icon: "none",
        title: "你已取消手机号授权"
      });
      return;
    }

    if (!event.detail.code) {
      wx.showToast({
        icon: "none",
        title: "未获取到手机号授权码"
      });
      return;
    }

    this.setData({ submitting: true });
    try {
      const appState = getAppState();
      const response = await bootstrapMember({
        phoneCode: event.detail.code,
        nickname: this.data.nickname,
        inviteCode: appState.inviteCode || undefined
      });
      applyMemberResponse(appState, response);
      wx.showToast({ title: "手机号已验证" });
      setTimeout(() => {
        wx.navigateBack();
      }, 500);
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: error.message || "验证失败"
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

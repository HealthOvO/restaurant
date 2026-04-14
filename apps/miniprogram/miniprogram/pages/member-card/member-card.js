const { getAppState } = require("../../utils/session");
const { refreshMemberState } = require("../../utils/member-access");
const { buildMemberQrPayload, drawMemberQrCode } = require("../../utils/voucher-qrcode");

function maskPhone(phone) {
  if (!phone || phone.length < 7) {
    return phone || "";
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

Page({
  data: {
    member: null,
    maskedPhone: "",
    phoneStatusText: "",
    qrCanvasId: "memberQrCanvas",
    qrCanvasSize: 320,
    qrReady: false,
    qrError: ""
  },
  async onShow() {
    const member = await refreshMemberState()
      .then((result) => result.member)
      .catch(() => getAppState().member || null);
    this.setData({
      member,
      maskedPhone: member && member.phone ? maskPhone(member.phone) : "",
      phoneStatusText: member && member.phoneVerifiedAt ? "微信手机号已验证" : "未完成手机号验证"
    });
    await this.renderMemberQr(member);
  },
  async renderMemberQr(member) {
    if (!member || !member.memberCode) {
      this.setData({
        qrReady: false,
        qrError: ""
      });
      return;
    }

    this.setData({
      qrReady: false,
      qrError: ""
    });

    try {
      await new Promise((resolve) => wx.nextTick(resolve));
      const payload = buildMemberQrPayload(member.memberCode);
      await drawMemberQrCode(this, this.data.qrCanvasId, payload, this.data.qrCanvasSize);
      this.setData({
        qrReady: true
      });
    } catch (error) {
      this.setData({
        qrReady: false,
        qrError: "会员二维码生成失败，请直接出示会员号"
      });
    }
  },
  copyMemberCode() {
    const memberCode = this.data.member && this.data.member.memberCode;
    if (!memberCode) {
      return;
    }

    wx.setClipboardData({
      data: memberCode,
      success() {
        wx.showToast({
          icon: "success",
          title: "会员号已复制"
        });
      }
    });
  }
});

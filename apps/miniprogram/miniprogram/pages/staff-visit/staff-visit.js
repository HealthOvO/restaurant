const { searchMembers, settleFirstVisit } = require("../../services/staff");
const { requireStaffAccess } = require("../../utils/staff-access");
const { formatInviteRelationStatus } = require("../../utils/format");
const { extractMemberCodeFromQr } = require("../../utils/voucher-qrcode");

function decorateRow(row) {
  return {
    ...row,
    relationLabel: formatInviteRelationStatus(row.relationStatus),
    firstVisitLabel: row.member.hasCompletedFirstVisit ? "已完成首次有效消费" : "待首单激活",
    phoneStatusLabel: row.member.phoneVerifiedAt ? "微信手机号已验证" : "未完成手机号验证",
    readyVoucherCount: row.readyVoucherCount
  };
}

Page({
  data: {
    query: "",
    orderNo: "",
    tableNo: "",
    notes: "",
    rows: [],
    selectedMemberId: "",
    selectedMember: null,
    loading: false,
    hasSearched: false,
    scanning: false
  },
  async onShow() {
    await requireStaffAccess();
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    const nextState = {
      [field]: value
    };

    if (field === "query") {
      nextState.selectedMemberId = "";
      nextState.selectedMember = null;
      nextState.hasSearched = false;
    }

    this.setData(nextState);
  },
  async search(options) {
    const force = !!(options && options.force);
    if (this.data.loading && !force) {
      return;
    }

    const access = await requireStaffAccess();
    if (!access) {
      return;
    }
    const sessionToken = access.sessionToken;
    const query = `${(options && options.queryOverride) || this.data.query || ""}`.trim();
    if (!query) {
      wx.showToast({ icon: "none", title: "请输入手机号或会员号" });
      return;
    }
    this.setData({ loading: true });
    try {
      const response = await searchMembers(sessionToken, query);
      const rows = response.rows.map(decorateRow);
      const matchedByCode =
        rows.find((item) => `${item.member.memberCode || ""}`.trim().toUpperCase() === query.toUpperCase()) || null;
      const matchedByPhone = rows.find((item) => `${item.member.phone || ""}`.trim() === query) || null;
      const selectedMember =
        (options && options.autoSelectExact && (matchedByCode || matchedByPhone || (rows.length === 1 ? rows[0] : null))) ||
        rows.find((item) => item.member._id === this.data.selectedMemberId) ||
        null;
      this.setData({
        query,
        rows,
        hasSearched: true,
        selectedMemberId: selectedMember ? selectedMember.member._id : "",
        selectedMember
      });
    } catch (error) {
      wx.showToast({ icon: "none", title: error.message || "查询失败" });
    } finally {
      this.setData({ loading: false });
    }
  },
  scanMember() {
    if (this.data.loading || this.data.scanning) {
      return;
    }

    this.setData({ scanning: true });
    wx.scanCode({
      onlyFromCamera: false,
      success: async (result) => {
        const memberCode = extractMemberCodeFromQr(result.result);
        if (!memberCode) {
          wx.showToast({ icon: "none", title: "未识别到有效会员码" });
          return;
        }

        this.setData({
          query: memberCode,
          selectedMemberId: "",
          selectedMember: null
        });

        await this.search({
          queryOverride: memberCode,
          autoSelectExact: true
        });
      },
      fail: (error) => {
        if (error && error.errMsg && error.errMsg.indexOf("cancel") !== -1) {
          return;
        }

        wx.showToast({
          icon: "none",
          title: "扫码失败，请重试"
        });
      },
      complete: () => {
        this.setData({ scanning: false });
      }
    });
  },
  selectMember(event) {
    const selectedMemberId = event.currentTarget.dataset.memberId;
    this.setData({
      selectedMemberId,
      selectedMember: this.data.rows.find((item) => item.member._id === selectedMemberId) || null
    });
  },
  async settle() {
    if (this.data.loading) {
      return;
    }

    const access = await requireStaffAccess();
    if (!access) {
      return;
    }
    const orderNo = (this.data.orderNo || "").trim();
    const tableNo = (this.data.tableNo || "").trim();
    const notes = (this.data.notes || "").trim();
    if (!this.data.selectedMemberId || !orderNo) {
      wx.showToast({ icon: "none", title: "请选择会员并填写订单号" });
      return;
    }
    if (!this.data.selectedMember || !this.data.selectedMember.member.phoneVerifiedAt) {
      wx.showToast({ icon: "none", title: "该会员需先完成微信手机号验证" });
      return;
    }

    this.setData({ loading: true });
    try {
      const response = await settleFirstVisit({
        sessionToken: access.sessionToken,
        memberId: this.data.selectedMemberId,
        externalOrderNo: orderNo,
        tableNo,
        notes,
        operatorChannel: "MINIPROGRAM"
      });
      const rewardSummary = [];
      if (response.settlement.welcomeVoucher) {
        rewardSummary.push(`新客礼：${response.settlement.welcomeVoucher.dishName}`);
      }
      if (response.settlement.milestonePointAwards && response.settlement.milestonePointAwards.length) {
        rewardSummary.push(
          `邀请积分：${response.settlement.milestonePointAwards
            .map((item) => `${item.pointsReward} 积分`)
            .join("、")}`
        );
      }
      wx.showModal({
        title: "核销成功",
        content: response.settlement.isIdempotent
          ? "该订单已核销过，本次按幂等返回。"
          : rewardSummary.length
            ? `消费已核销，${rewardSummary.join("；")} 已自动到账。`
            : "消费已核销，本次没有新增奖励。"
      });
      this.setData({
        orderNo: "",
        tableNo: "",
        notes: ""
      });
      await this.search({ force: true });
    } catch (error) {
      wx.showToast({ icon: "none", title: error.message || "核销失败" });
    } finally {
      this.setData({ loading: false });
    }
  }
});

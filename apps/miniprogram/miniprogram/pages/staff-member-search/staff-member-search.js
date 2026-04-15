const { searchMembers } = require("../../services/staff");
const { requireStaffAccess } = require("../../utils/staff-access");
const { formatDateTime, formatInviteRelationStatus } = require("../../utils/format");
const { extractMemberCodeFromQr } = require("../../utils/voucher-qrcode");

Page({
  data: {
    query: "",
    rows: [],
    loading: false,
    hasSearched: false,
    scanning: false
  },
  async onShow() {
    await requireStaffAccess();
  },
  onInput(event) {
    this.setData({
      query: event.detail.value
    });
  },
  async search(options) {
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
      this.setData({
        query,
        rows: response.rows.map((row) => {
          return {
            ...row,
            latestVisitLabel: row.latestVisitAt ? formatDateTime(row.latestVisitAt) : "暂无记录",
            firstVisitLabel: row.member.firstVisitAt ? formatDateTime(row.member.firstVisitAt) : "未完成",
            readyVoucherCount: row.readyVoucherCount,
            relationLabel: formatInviteRelationStatus(row.relationStatus),
            phoneStatusLabel: row.member.phoneVerifiedAt ? "微信已验证" : "未验证手机号"
          };
        }),
        hasSearched: true
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

        this.setData({ query: memberCode });
        await this.search({
          queryOverride: memberCode
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
  openVisit(event) {
    const query = `${event.currentTarget.dataset.query || ""}`.trim();
    if (!query) {
      wx.showToast({ icon: "none", title: "这位会员缺少可查询编号" });
      return;
    }

    wx.navigateTo({
      url: `/pages/staff-visit/staff-visit?query=${encodeURIComponent(query)}`
    });
  },
  openVoucher() {
    wx.navigateTo({
      url: "/pages/staff-voucher/staff-voucher"
    });
  },
  openOrders() {
    wx.navigateTo({
      url: "/pages/staff-orders/staff-orders"
    });
  }
});

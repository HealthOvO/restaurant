const { fetchMyVouchers, redeemPoints } = require("../../services/member");
const { getAppState } = require("../../utils/session");
const { refreshMemberState } = require("../../utils/member-access");
const { formatDateTime } = require("../../utils/format");
const { buildVoucherQrPayload, drawVoucherQrCode } = require("../../utils/voucher-qrcode");

function createRedeemRequestId(exchangeItemId) {
  return `exchange_${exchangeItemId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const STATUS_MAP = {
  READY: { text: "待使用", className: "status-ready" },
  USED: { text: "已核销", className: "status-used" },
  EXPIRED: { text: "已过期", className: "status-expired" },
  VOID: { text: "已作废", className: "status-void" }
};

const SOURCE_MAP = {
  WELCOME: "新客首单礼",
  INVITE_MILESTONE: "历史邀请奖励",
  POINT_EXCHANGE: "积分兑换",
  MANUAL_COMPENSATION: "人工补发"
};

const POINT_TRANSACTION_TYPE_MAP = {
  INVITE_REWARD: "邀请奖励",
  MANUAL_ADJUST: "老板调整",
  POINT_EXCHANGE: "积分兑换"
};

Page({
  data: {
    ready: false,
    hasMember: false,
    loadError: "",
    vouchers: [],
    exchangeItems: [],
    pointTransactions: [],
    loading: false,
    pointsBalance: 0,
    readyCount: 0,
    usedCount: 0,
    expiredCount: 0,
    redeemingItemId: "",
    qrPreviewVisible: false,
    qrPreviewVoucher: null,
    qrCanvasId: "voucherQrCanvas",
    qrCanvasSize: 320
  },
  onShow() {
    this.refresh();
  },
  async refresh() {
    this.setData({
      loading: true,
      ready: false,
      loadError: ""
    });

    try {
      await refreshMemberState();
      const response = await fetchMyVouchers();
      const vouchers = response.vouchers.map((item) => ({
        ...item,
        expiresAtLabel: formatDateTime(item.expiresAt),
        usedAtLabel: item.usedAt ? formatDateTime(item.usedAt) : "",
        statusText: (STATUS_MAP[item.status] || STATUS_MAP.VOID).text,
        statusClass: (STATUS_MAP[item.status] || STATUS_MAP.VOID).className,
        sourceText: SOURCE_MAP[item.source] || item.source
      }));
      const exchangeItems = (response.exchangeItems || []).map((item) => ({
        ...item,
        pointsCostText: `${item.pointsCost} 积分`,
        validDaysText: `${item.voucherTemplate.validDays} 天有效`
      }));
      const pointTransactions = (response.pointTransactions || []).map((item) => ({
        ...item,
        createdAtLabel: formatDateTime(item.createdAt),
        changeText: `${item.changeAmount > 0 ? "+" : ""}${item.changeAmount}`,
        typeText: POINT_TRANSACTION_TYPE_MAP[item.type] || item.type
      }));
      const readyCount = vouchers.filter((item) => item.status === "READY").length;
      const usedCount = vouchers.filter((item) => item.status === "USED").length;
      const expiredCount = vouchers.filter((item) => item.status === "EXPIRED" || item.status === "VOID").length;
      const qrPreviewVoucher =
        this.data.qrPreviewVoucher && this.data.qrPreviewVoucher._id
          ? vouchers.find((item) => item._id === this.data.qrPreviewVoucher._id && item.status === "READY") || null
          : null;
      this.setData({
        ready: true,
        hasMember: true,
        pointsBalance: response.pointsBalance || 0,
        vouchers,
        exchangeItems,
        pointTransactions,
        readyCount,
        usedCount,
        expiredCount,
        qrPreviewVoucher,
        qrPreviewVisible: !!qrPreviewVoucher && this.data.qrPreviewVisible
      });
    } catch (error) {
      const member = getAppState().member || null;
      const message = error.message || "加载菜品券失败";
      this.setData({
        ready: true,
        hasMember: !!member,
        loadError: message,
        pointsBalance: member && Number(member.pointsBalance) ? Number(member.pointsBalance) : 0,
        vouchers: member ? this.data.vouchers : [],
        exchangeItems: member ? this.data.exchangeItems : [],
        pointTransactions: member ? this.data.pointTransactions : [],
        readyCount: member ? this.data.readyCount : 0,
        usedCount: member ? this.data.usedCount : 0,
        expiredCount: member ? this.data.expiredCount : 0,
        qrPreviewVisible: member ? this.data.qrPreviewVisible : false,
        qrPreviewVoucher: member ? this.data.qrPreviewVoucher : null
      });
      if (member) {
        wx.showToast({
          icon: "none",
          title: message
        });
      }
    } finally {
      this.setData({ loading: false });
    }
  },
  noop() {},
  async showVoucherQr(event) {
    const voucherId = event.currentTarget.dataset.voucherId;
    const voucher = this.data.vouchers.find((item) => item._id === voucherId);
    if (!voucher || voucher.status !== "READY") {
      return;
    }

    this.setData(
      {
        qrPreviewVisible: true,
        qrPreviewVoucher: voucher
      },
      () => {
        wx.nextTick(async () => {
          try {
            const payload = buildVoucherQrPayload(voucher._id);
            await drawVoucherQrCode(this, this.data.qrCanvasId, payload, this.data.qrCanvasSize);
          } catch (error) {
            this.hideVoucherQr();
            wx.showToast({
              icon: "none",
              title: "二维码生成失败，请复制券号核销"
            });
          }
        });
      }
    );
  },
  hideVoucherQr() {
    this.setData({
      qrPreviewVisible: false,
      qrPreviewVoucher: null
    });
  },
  async redeemExchangeItem(event) {
    this.pendingRedeemRequestIds = this.pendingRedeemRequestIds || {};
    const exchangeItemId = event.currentTarget.dataset.exchangeItemId;
    const item = this.data.exchangeItems.find((current) => current._id === exchangeItemId);
    if (!item || this.data.redeemingItemId) {
      return;
    }

    if ((this.data.pointsBalance || 0) < item.pointsCost) {
      wx.showToast({
        icon: "none",
        title: "积分不足"
      });
      return;
    }

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: "确认兑换",
        content: `将使用 ${item.pointsCost} 积分兑换 ${item.voucherTemplate.dishName}，确定继续吗？`,
        success(result) {
          resolve(!!result.confirm);
        },
        fail() {
          resolve(false);
        }
      });
    });

    if (!confirm) {
      return;
    }

    this.setData({ redeemingItemId: item._id });
    const requestId = this.pendingRedeemRequestIds[item._id] || createRedeemRequestId(item._id);
    this.pendingRedeemRequestIds[item._id] = requestId;
    try {
      await redeemPoints(item._id, requestId);
      delete this.pendingRedeemRequestIds[item._id];
      wx.showToast({
        icon: "success",
        title: "兑换成功"
      });
      await this.refresh();
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: error.message || "兑换失败"
      });
    } finally {
      this.setData({ redeemingItemId: "" });
    }
  },
  copyVoucherId(event) {
    const voucherId = event.currentTarget.dataset.voucherId;
    if (!voucherId) {
      return;
    }
    wx.setClipboardData({
      data: voucherId,
      success() {
        wx.showToast({
          icon: "success",
          title: "券号已复制"
        });
      }
    });
  }
});

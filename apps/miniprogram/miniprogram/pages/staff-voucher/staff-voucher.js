const { previewVoucher, redeemVoucher } = require("../../services/staff");
const { requireStaffAccess } = require("../../utils/staff-access");
const { formatDateTime } = require("../../utils/format");
const { extractVoucherIdFromQr } = require("../../utils/voucher-qrcode");

function resolveVoucherStatusMeta(status) {
  if (status === "USED") {
    return {
      statusText: "已核销",
      hint: "这张券已经用过了。"
    };
  }
  if (status === "EXPIRED") {
    return {
      statusText: "已过期",
      hint: "这张券已经过期，不能再核销。"
    };
  }
  if (status === "VOID") {
    return {
      statusText: "已失效",
      hint: "这张券当前不可使用。"
    };
  }
  return {
    statusText: "可核销",
    hint: "确认会员出示无误后再核销。"
  };
}

function resolveVoucherSourceText(source) {
  if (source === "WELCOME") {
    return "首单礼";
  }
  if (source === "INVITE_MILESTONE") {
    return "邀请奖励";
  }
  if (source === "POINT_EXCHANGE") {
    return "积分兑换";
  }
  if (source === "MANUAL_COMPENSATION") {
    return "人工补发";
  }

  return "菜品券";
}

function decoratePreview(response) {
  const meta = resolveVoucherStatusMeta(response.voucher.status);
  const member = response.member || null;
  return {
    ...response.voucher,
    memberLabel: member ? member.nickname || member.memberCode || member.phone || "会员" : "未识别会员",
    memberCode: member ? member.memberCode : "",
    memberPhone: member ? member.phone || "" : "",
    statusText: meta.statusText,
    hint: meta.hint,
    sourceText: resolveVoucherSourceText(response.voucher.source),
    expiresAtText: response.voucher.expiresAt ? formatDateTime(response.voucher.expiresAt) : "",
    usedAtText: response.voucher.usedAt ? formatDateTime(response.voucher.usedAt) : ""
  };
}

Page({
  data: {
    voucherId: "",
    loading: false,
    previewLoading: false,
    scanning: false,
    preview: null,
    lastRedeemed: null
  },
  async onShow() {
    await requireStaffAccess();
  },
  onInput(event) {
    this.setData({
      voucherId: event.detail.value,
      preview: null,
      lastRedeemed: null
    });
  },
  noop() {},
  scanVoucher() {
    if (this.data.loading || this.data.scanning) {
      return;
    }

    this.setData({ scanning: true });
    wx.scanCode({
      onlyFromCamera: false,
      success: async (result) => {
        const voucherId = extractVoucherIdFromQr(result.result);
        if (!voucherId) {
          wx.showToast({ icon: "none", title: "未识别到有效券号" });
          return;
        }

        this.setData({
          voucherId,
          preview: null,
          lastRedeemed: null
        });

        await this.loadPreview({ voucherId, fromScan: true });
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
  async loadPreview(options) {
    if (this.data.loading || this.data.previewLoading) {
      return;
    }

    const normalizedVoucherId = extractVoucherIdFromQr(
      options && options.voucherId ? options.voucherId : this.data.voucherId
    );
    const access = await requireStaffAccess();
    if (!access) {
      return;
    }
    const sessionToken = access.sessionToken;
    if (!normalizedVoucherId) {
      wx.showToast({ icon: "none", title: "请先输入或扫码券号" });
      return;
    }

    this.setData({
      previewLoading: true,
      voucherId: normalizedVoucherId
    });
    try {
      const response = await previewVoucher({
        sessionToken,
        voucherId: normalizedVoucherId
      });
      this.setData({
        preview: decoratePreview(response)
      });
    } catch (error) {
      wx.showToast({ icon: "none", title: error.message || "核销失败" });
    } finally {
      this.setData({ previewLoading: false });
    }
  },
  async submit() {
    if (this.data.loading) {
      return;
    }

    const preview = this.data.preview;
    const normalizedVoucherId = extractVoucherIdFromQr(this.data.voucherId);
    if (!preview || preview._id !== normalizedVoucherId) {
      await this.loadPreview({
        voucherId: normalizedVoucherId
      });
      return;
    }

    if (preview.status !== "READY") {
      wx.showToast({ icon: "none", title: preview.hint || "这张券当前不能核销" });
      return;
    }

    const access = await requireStaffAccess();
    if (!access) {
      return;
    }

    this.setData({
      loading: true
    });
    try {
      const response = await redeemVoucher({
        sessionToken: access.sessionToken,
        voucherId: preview._id
      });
      this.setData({
        lastRedeemed: response.voucher,
        voucherId: "",
        preview: null
      });
      wx.showModal({
        title: "核销完成",
        content: response.isIdempotent
          ? `${response.voucher.dishName} 已经核销过，本次按重复请求安全返回。`
          : `${response.voucher.dishName} 已核销成功`
      });
    } catch (error) {
      wx.showToast({ icon: "none", title: error.message || "核销失败" });
    } finally {
      this.setData({ loading: false });
    }
  }
});

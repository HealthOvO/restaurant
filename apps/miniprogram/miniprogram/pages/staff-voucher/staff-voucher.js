const { redeemVoucher } = require("../../services/staff");
const { requireStaffAccess } = require("../../utils/staff-access");
const { extractVoucherIdFromQr } = require("../../utils/voucher-qrcode");

Page({
  data: {
    voucherId: "",
    loading: false,
    scanning: false,
    lastRedeemed: null
  },
  async onShow() {
    await requireStaffAccess();
  },
  onInput(event) {
    this.setData({
      voucherId: event.detail.value,
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
          lastRedeemed: null
        });

        await this.submit({ voucherId, fromScan: true });
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
  async submit(options) {
    if (this.data.loading) {
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
      loading: true,
      voucherId: normalizedVoucherId
    });
    try {
      const response = await redeemVoucher({
        sessionToken,
        voucherId: normalizedVoucherId
      });
      this.setData({
        lastRedeemed: response.voucher,
        voucherId: ""
      });
      wx.showModal({
        title: options && options.fromScan ? "扫码核销完成" : "核销完成",
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

const { fetchStaffOrderDetail, updateStaffOrderStatus } = require("../../services/order");
const { requireStaffAccess } = require("../../utils/staff-access");
const { formatDateTime } = require("../../utils/format");

const STATUS_META = {
  PENDING_CONFIRM: { text: "待确认", nextActions: ["CONFIRMED", "CANCELLED"] },
  CONFIRMED: { text: "已确认", nextActions: ["PREPARING", "CANCELLED"] },
  PREPARING: { text: "制作中", nextActions: ["READY", "CANCELLED"] },
  READY: { text: "待取餐", nextActions: ["COMPLETED"] },
  COMPLETED: { text: "已完成", nextActions: [] },
  CANCELLED: { text: "已取消", nextActions: [] }
};

const ACTION_LABELS = {
  CONFIRMED: "确认接单",
  PREPARING: "开始制作",
  READY: "标记待取",
  COMPLETED: "完成订单",
  CANCELLED: "取消订单"
};

function formatAmount(value) {
  return Number(value || 0).toFixed(0);
}

function decorateLineItems(lineItems) {
  return (lineItems || []).map((lineItem) => ({
    ...lineItem,
    lineTotalText: formatAmount(lineItem.lineTotal),
    selectedOptionsText:
      lineItem.selectedOptions && lineItem.selectedOptions.length
        ? lineItem.selectedOptions.map((option) => option.choiceName).join(" / ")
        : ""
  }));
}

function decorateOrder(order) {
  const meta = STATUS_META[order.status] || STATUS_META.CANCELLED;
  return {
    ...order,
    statusText: meta.text,
    payableAmountText: formatAmount(order.payableAmount),
    submittedAtLabel: formatDateTime(order.submittedAt),
    locationLabel:
      order.fulfillmentMode === "DINE_IN"
        ? order.tableNo
          ? `堂食 · ${order.tableNo}`
          : "堂食"
        : order.contactName
          ? `自提 · ${order.contactName}`
          : "自提",
    memberLabel: order.nickname || order.memberCode || "散客下单",
    lineItems: decorateLineItems(order.lineItems),
    availableActions: (meta.nextActions || []).map((status) => ({
      status,
      label: ACTION_LABELS[status]
    }))
  };
}

function decorateLogs(logs) {
  return (logs || []).map((log) => ({
    ...log,
    statusText: (STATUS_META[log.status] || STATUS_META.CANCELLED).text,
    createdAtLabel: formatDateTime(log.createdAt)
  }));
}

function buildResultMessage(response, nextStatus) {
  if (response.isIdempotent) {
    return "这笔订单已经是当前状态，本次没有重复处理。";
  }

  if (nextStatus === "COMPLETED" && response.visitSettlement) {
    if (response.visitSettlement.state === "SETTLED") {
      return "订单已完成，会员首单结算也已同步完成。";
    }

    if (response.visitSettlement.state === "MANUAL_REVIEW") {
      return `订单已完成，但会员奖励需要人工处理：${response.visitSettlement.reason || "请联系老板检查会员资料或订单号"}`;
    }

    return `订单已完成，但会员奖励暂未结算，可稍后重试：${response.visitSettlement.reason || "请稍后再试或由老板复核"}`;
  }

  if (nextStatus === "CANCELLED") {
    return "订单已取消，顾客端会同步看到最新状态。";
  }

  return "订单状态已更新。";
}

Page({
  data: {
    loading: true,
    errorMessage: "",
    orderId: "",
    order: null,
    logs: [],
    note: "",
    updatingStatus: ""
  },
  onLoad(query) {
    this.setData({
      orderId: query.orderId || ""
    });
  },
  onShow() {
    this.refresh();
  },
  updateNote(event) {
    this.setData({
      note: event.detail.value
    });
  },
  async refresh() {
    if (!this.data.orderId) {
      this.setData({
        loading: false,
        errorMessage: "订单参数缺失"
      });
      return;
    }

    const access = await requireStaffAccess();
    if (!access) {
      this.setData({ loading: false });
      return;
    }

    this.setData({
      loading: true,
      errorMessage: ""
    });

    try {
      const response = await fetchStaffOrderDetail({
        sessionToken: access.sessionToken,
        orderId: this.data.orderId
      });
      this.setData({
        order: decorateOrder(response.order),
        logs: decorateLogs(response.logs)
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "订单详情读取失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  async submitAction(event) {
    const nextStatus = event.currentTarget.dataset.status;
    if (!nextStatus || this.data.updatingStatus) {
      return;
    }

    const access = await requireStaffAccess();
    if (!access) {
      return;
    }

    this.setData({
      updatingStatus: nextStatus
    });

    try {
      const response = await updateStaffOrderStatus({
        sessionToken: access.sessionToken,
        orderId: this.data.orderId,
        nextStatus,
        note: this.data.note.trim()
      });
      this.setData({
        note: ""
      });
      wx.showModal({
        title: ACTION_LABELS[nextStatus] || "处理完成",
        content: buildResultMessage(response, nextStatus)
      });
      await this.refresh();
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: error.message || "处理失败"
      });
    } finally {
      this.setData({
        updatingStatus: ""
      });
    }
  }
});

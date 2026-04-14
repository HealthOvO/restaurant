const { fetchStaffOrders } = require("../../services/order");
const { requireStaffAccess } = require("../../utils/staff-access");
const { formatDateTime } = require("../../utils/format");

const STATUS_META = {
  PENDING_CONFIRM: { text: "待确认", badgeClass: "tag" },
  CONFIRMED: { text: "已确认", badgeClass: "tag tag-success" },
  PREPARING: { text: "制作中", badgeClass: "tag" },
  READY: { text: "待取餐", badgeClass: "tag tag-success" },
  COMPLETED: { text: "已完成", badgeClass: "tag tag-navy" },
  CANCELLED: { text: "已取消", badgeClass: "tag tag-navy" }
};

const STATUS_FILTERS = [
  { value: "ALL", label: "全部订单" },
  { value: "PENDING_CONFIRM", label: "待确认" },
  { value: "CONFIRMED", label: "已确认" },
  { value: "PREPARING", label: "制作中" },
  { value: "READY", label: "待取餐" },
  { value: "COMPLETED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" }
];

function formatAmount(value) {
  return Number(value || 0).toFixed(0);
}

function decorateOrders(orders) {
  return (orders || []).map((order) => {
    const meta = STATUS_META[order.status] || STATUS_META.CANCELLED;
    return {
      ...order,
      statusText: meta.text,
      statusBadgeClass: meta.badgeClass,
      submittedAtLabel: formatDateTime(order.submittedAt),
      payableAmountText: formatAmount(order.payableAmount),
      memberLabel: order.nickname || order.memberCode || "散客下单",
      locationLabel:
        order.fulfillmentMode === "DINE_IN"
          ? order.tableNo
            ? `堂食 · ${order.tableNo}`
            : "堂食"
          : order.contactName
            ? `自提 · ${order.contactName}`
            : "自提",
      itemSummary: (order.lineItems || [])
        .slice(0, 3)
        .map((item) => item.name)
        .join(" / ")
    };
  });
}

function buildSummary(orders) {
  return {
    pendingCount: orders.filter((order) => order.status === "PENDING_CONFIRM").length,
    confirmedCount: orders.filter((order) => order.status === "CONFIRMED").length,
    preparingCount: orders.filter((order) => order.status === "PREPARING").length,
    readyCount: orders.filter((order) => order.status === "READY").length
  };
}

Page({
  data: {
    loading: true,
    errorMessage: "",
    keyword: "",
    activeStatus: "ALL",
    statusFilters: STATUS_FILTERS,
    orders: [],
    pendingCount: 0,
    confirmedCount: 0,
    preparingCount: 0,
    readyCount: 0
  },
  onShow() {
    this.refresh();
  },
  onInput(event) {
    this.setData({
      keyword: event.detail.value
    });
  },
  async refresh(options) {
    const access = await requireStaffAccess();
    if (!access) {
      this.setData({ loading: false });
      return;
    }

    const keyword =
      options && Object.prototype.hasOwnProperty.call(options, "keyword")
        ? `${options.keyword || ""}`.trim()
        : `${this.data.keyword || ""}`.trim();
    const activeStatus =
      options && Object.prototype.hasOwnProperty.call(options, "status")
        ? options.status || "ALL"
        : this.data.activeStatus;

    this.setData({
      loading: true,
      errorMessage: "",
      keyword,
      activeStatus
    });

    try {
      const response = await fetchStaffOrders({
        sessionToken: access.sessionToken,
        keyword,
        status: activeStatus === "ALL" ? undefined : activeStatus,
        limit: 40
      });
      const orders = decorateOrders(response.orders || []);
      this.setData({
        orders,
        ...buildSummary(orders)
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "订单读取失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  search() {
    void this.refresh({
      keyword: this.data.keyword
    });
  },
  clearSearch() {
    void this.refresh({
      keyword: ""
    });
  },
  setStatus(event) {
    const status = event.currentTarget.dataset.status;
    if (!status || status === this.data.activeStatus) {
      return;
    }

    void this.refresh({
      status
    });
  },
  goDetail(event) {
    const orderId = event.currentTarget.dataset.orderId;
    if (!orderId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/staff-order-detail/staff-order-detail?orderId=${orderId}`
    });
  }
});

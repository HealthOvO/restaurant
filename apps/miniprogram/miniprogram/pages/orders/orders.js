const { fetchMyOrders } = require("../../services/order");
const { formatDateTime } = require("../../utils/format");

const STATUS_META = {
  PENDING_CONFIRM: { text: "待确认", className: "status-pill-warning" },
  CONFIRMED: { text: "已确认", className: "status-pill-success" },
  PREPARING: { text: "制作中", className: "status-pill-warning" },
  READY: { text: "待取餐", className: "status-pill-success" },
  COMPLETED: { text: "已完成", className: "status-pill-neutral" },
  CANCELLED: { text: "已取消", className: "status-pill-neutral" }
};

function decorateOrders(orders) {
  return (orders || []).map((order) => ({
    ...order,
    statusText: (STATUS_META[order.status] || STATUS_META.CANCELLED).text,
    statusClass: (STATUS_META[order.status] || STATUS_META.CANCELLED).className,
    submittedAtLabel: formatDateTime(order.submittedAt),
    payableAmountText: Number(order.payableAmount || 0).toFixed(0),
    itemSummary: (() => {
      const lineItems = order.lineItems || [];
      const summary = lineItems
        .slice(0, 2)
        .map((item) => item.name)
        .join(" / ");
      if (!summary) {
        return "";
      }
      return lineItems.length > 2 ? `${summary} 等${lineItems.length}样` : summary;
    })()
  }));
}

Page({
  data: {
    loading: true,
    errorMessage: "",
    orders: [],
    visibleOrders: [],
    activeFilter: "ALL"
  },
  onShow() {
    this.refresh();
  },
  applyFilter() {
    const filter = this.data.activeFilter;
    const visibleOrders = this.data.orders.filter((order) => {
      if (filter === "ACTIVE") {
        return !["COMPLETED", "CANCELLED"].includes(order.status);
      }
      if (filter === "DONE") {
        return ["COMPLETED", "CANCELLED"].includes(order.status);
      }
      return true;
    });

    this.setData({
      visibleOrders
    });
  },
  async refresh() {
    this.setData({
      loading: true,
      errorMessage: ""
    });

    try {
      const response = await fetchMyOrders();
      this.setData({
        orders: decorateOrders(response.orders || [])
      });
      this.applyFilter();
    } catch (error) {
      this.setData({
        errorMessage: error.message || "订单加载失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  setFilter(event) {
    this.setData({
      activeFilter: event.currentTarget.dataset.filter
    });
    this.applyFilter();
  },
  goDetail(event) {
    const orderId = event.currentTarget.dataset.orderId;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?orderId=${orderId}`
    });
  },
  goMenu() {
    wx.switchTab({ url: "/pages/menu/menu" });
  }
});

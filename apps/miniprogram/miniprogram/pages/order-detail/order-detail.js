const { fetchOrderDetail } = require("../../services/order");
const { formatDateTime } = require("../../utils/format");

const STATUS_META = {
  PENDING_CONFIRM: "待确认",
  CONFIRMED: "已确认",
  PREPARING: "制作中",
  READY: "待取餐",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
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

Page({
  data: {
    loading: true,
    errorMessage: "",
    orderId: "",
    order: null,
    logs: []
  },
  onLoad(query) {
    this.setData({
      orderId: query.orderId || ""
    });
  },
  onShow() {
    this.refresh();
  },
  async refresh() {
    if (!this.data.orderId) {
      this.setData({
        loading: false,
        errorMessage: "订单参数缺失"
      });
      return;
    }

    this.setData({
      loading: true,
      errorMessage: ""
    });

    try {
      const response = await fetchOrderDetail(this.data.orderId);
      this.setData({
        order: {
          ...response.order,
          statusText: STATUS_META[response.order.status] || response.order.status,
          submittedAtLabel: formatDateTime(response.order.submittedAt),
          payableAmountText: formatAmount(response.order.payableAmount),
          lineItems: decorateLineItems(response.order.lineItems)
        },
        logs: (response.logs || []).map((item) => ({
          ...item,
          statusText: STATUS_META[item.status] || item.status,
          createdAtLabel: formatDateTime(item.createdAt)
        }))
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "订单详情加载失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});

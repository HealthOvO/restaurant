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

function resolveOrderHint(order) {
  if (order.status === "PENDING_CONFIRM") {
    return "等店员确认。";
  }
  if (order.status === "CONFIRMED" || order.status === "PREPARING") {
    return "正在准备，稍等一下。";
  }
  if (order.status === "READY") {
    return order.fulfillmentMode === "DINE_IN" ? "可以叫店员上菜了。" : "可以去前台取餐了。";
  }
  if (order.status === "COMPLETED") {
    return "这单已经完成。";
  }
  return "这单已经取消。";
}

function resolveMemberBenefitsMeta(order) {
  if (order.memberBenefitsStatus === "SKIPPED_UNVERIFIED") {
    return {
      title: "本单未参与会员活动",
      copy: order.memberBenefitsReason || "未验证手机号，本单不计邀请和积分，后续不补记。"
    };
  }

  return {
    title: "本单参与会员活动",
    copy: "订单完成后会正常更新邀请、积分和券。"
  };
}

function resolvePrimaryAction(order) {
  if (order.memberBenefitsStatus === "SKIPPED_UNVERIFIED") {
    return {
      label: "去验证手机号",
      helper: "验证后，后续订单会正常累计。",
      type: "REGISTER"
    };
  }

  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    return {
      label: "再来一单",
      helper: "需要时再点。",
      type: "MENU"
    };
  }

  return null;
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
      const primaryAction = resolvePrimaryAction(response.order);
      this.setData({
        order: {
          ...response.order,
          statusText: STATUS_META[response.order.status] || response.order.status,
          submittedAtLabel: formatDateTime(response.order.submittedAt),
          payableAmountText: formatAmount(response.order.payableAmount),
          lineItems: decorateLineItems(response.order.lineItems),
          statusHint: resolveOrderHint(response.order),
          memberBenefitsTitle: resolveMemberBenefitsMeta(response.order).title,
          memberBenefitsCopy: resolveMemberBenefitsMeta(response.order).copy,
          primaryActionLabel: primaryAction ? primaryAction.label : "",
          primaryActionHelper: primaryAction ? primaryAction.helper : "",
          primaryActionType: primaryAction ? primaryAction.type : ""
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
  },
  handlePrimaryAction() {
    const actionType = this.data.order && this.data.order.primaryActionType;
    if (actionType === "REGISTER") {
      wx.navigateTo({ url: "/pages/register/register" });
      return;
    }

    if (actionType === "MENU") {
      wx.switchTab({ url: "/pages/menu/menu" });
    }
  }
});

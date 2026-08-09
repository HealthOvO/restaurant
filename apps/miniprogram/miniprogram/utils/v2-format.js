function money(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function dateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const ORDER_STATUS = {
  PENDING_PAYMENT: { text: "待支付", className: "status-muted" },
  WAITING_FULFILLMENT: { text: "制作中", className: "status-waiting" },
  COMPLETED: { text: "已完成", className: "status-done" },
  CANCELLED: { text: "已取消", className: "status-muted" },
  REFUNDING: { text: "退款中", className: "status-waiting" },
  REFUNDED: { text: "已退款", className: "status-muted" }
};

const POINT_TYPE = {
  PURCHASE: "消费获得积分",
  INVITE_REWARD: "邀请奖励积分",
  COUPON_EXCHANGE: "兑换商品券",
  COUPON_VOID_REFUND: "商品券退回积分",
  PURCHASE_REFUND: "退款回收积分",
  INVITE_REWARD_REFUND: "退款回收邀请奖励"
};

function prepareOrder(order) {
  const status = ORDER_STATUS[order.status] || { text: order.status, className: "status-muted" };
  const sourceText = order.source === "COUPON" ? "商品券" : order.source === "MIXED" ? "支付 + 商品券" : "微信支付";
  const sourceClass = order.source === "COUPON" ? "source-coupon" : order.source === "MIXED" ? "source-mixed" : "source-pay";
  return {
    ...order,
    statusText: status.text,
    statusClass: status.className,
    sourceText,
    sourceClass,
    amountText: order.source === "COUPON" ? "商品券抵扣" : money(order.paidAmount || order.payableAmount),
    couponCount: (order.couponApplications || []).length || (order.couponId ? 1 : 0),
    timeText: dateTime(order.createdAt),
    itemText: (order.lineItems || []).map((line) => `${line.productName} ×${line.quantity}`).join("，")
  };
}

function preparePoint(row) {
  return {
    ...row,
    titleText: POINT_TYPE[row.type] || row.note || "积分变动",
    amountText: `${row.amount > 0 ? "+" : ""}${row.amount}`,
    amountClass: row.amount > 0 ? "is-positive" : "is-negative",
    timeText: dateTime(row.createdAt)
  };
}

module.exports = { money, dateTime, prepareOrder, preparePoint };

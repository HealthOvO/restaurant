import type { V2OrderStatus, V2PointLedgerType } from "@restaurant/shared";

export function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function formatDateTime(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export const orderStatusLabel: Record<V2OrderStatus, string> = {
  PENDING_PAYMENT: "待支付",
  WAITING_FULFILLMENT: "待出餐",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDING: "退款中",
  REFUNDED: "已退款"
};

export const pointTypeLabel: Record<V2PointLedgerType, string> = {
  PURCHASE: "消费获得",
  INVITE_REWARD: "邀请奖励",
  COUPON_EXCHANGE: "兑换商品券",
  COUPON_VOID_REFUND: "商品券作废退回",
  PURCHASE_REFUND: "退款回收",
  INVITE_REWARD_REFUND: "退款回收邀请奖励"
};

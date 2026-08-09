import { DomainError } from "../errors";
import type { V2CouponStatus, V2OrderStatus, V2PaymentStatus, V2RefundStatus } from "./types";

const ORDER_TRANSITIONS: Record<V2OrderStatus, V2OrderStatus[]> = {
  PENDING_PAYMENT: ["WAITING_FULFILLMENT", "CANCELLED"],
  WAITING_FULFILLMENT: ["COMPLETED", "CANCELLED", "REFUNDING"],
  COMPLETED: ["REFUNDING"],
  CANCELLED: [],
  REFUNDING: ["REFUNDED"],
  REFUNDED: []
};

const PAYMENT_TRANSITIONS: Record<V2PaymentStatus, V2PaymentStatus[]> = {
  INIT: ["NOTPAY", "SUCCESS", "CLOSED"],
  NOTPAY: ["SUCCESS", "CLOSED"],
  SUCCESS: ["REFUND"],
  CLOSED: [],
  REFUND: []
};

const REFUND_TRANSITIONS: Record<V2RefundStatus, V2RefundStatus[]> = {
  PROCESSING: ["SUCCESS", "CLOSED", "ABNORMAL"],
  SUCCESS: [],
  CLOSED: [],
  ABNORMAL: ["PROCESSING", "SUCCESS", "CLOSED"]
};

const COUPON_TRANSITIONS: Record<V2CouponStatus, V2CouponStatus[]> = {
  AVAILABLE: ["USED", "EXPIRED", "VOID"],
  USED: ["AVAILABLE", "EXPIRED"],
  EXPIRED: [],
  VOID: []
};

function assertTransition<T extends string>(name: string, map: Record<T, T[]>, from: T, to: T): T {
  if (from === to) {
    return to;
  }
  if (!map[from]?.includes(to)) {
    throw new DomainError("INVALID_STATE_TRANSITION", `${name}不能从 ${from} 变为 ${to}`);
  }
  return to;
}

export const transitionV2Order = (from: V2OrderStatus, to: V2OrderStatus) =>
  assertTransition("订单", ORDER_TRANSITIONS, from, to);
export const transitionV2Payment = (from: V2PaymentStatus, to: V2PaymentStatus) =>
  assertTransition("支付", PAYMENT_TRANSITIONS, from, to);
export const transitionV2Refund = (from: V2RefundStatus, to: V2RefundStatus) =>
  assertTransition("退款", REFUND_TRANSITIONS, from, to);
export const transitionV2Coupon = (from: V2CouponStatus, to: V2CouponStatus) =>
  assertTransition("商品券", COUPON_TRANSITIONS, from, to);

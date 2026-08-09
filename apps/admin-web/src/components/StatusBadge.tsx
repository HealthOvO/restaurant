import type { V2Order, V2OrderStatus } from "@restaurant/shared";
import { orderStatusLabel } from "../lib/format";

export function OrderStatusBadge({ status }: { status: V2OrderStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{orderStatusLabel[status]}</span>;
}

export function OrderSourceBadge({ source }: { source: V2Order["source"] }) {
  const label = source === "WECHAT_PAY" ? "微信支付" : source === "MIXED" ? "支付 + 商品券" : "商品券";
  return <span className={`source-badge source-${source.toLowerCase()}`}>{label}</span>;
}

import { z } from "zod";
import { DomainError, v2SessionSchema, type V2OrderStatus } from "@restaurant/shared";
import { createV2Runtime, v2Response } from "../v2/handler";
import { loginV2Owner, requireV2Owner } from "../v2/owner-auth";

const eventSchema = z.object({
  action: z.enum([
    "auth.login",
    "auth.profile",
    "dashboard.get",
    "orders.list",
    "orders.complete",
    "orders.cancelCoupon",
    "orders.refund",
    "products.list",
    "products.save",
    "exchange.list",
    "exchange.save",
    "members.search",
    "members.detail",
    "config.get",
    "config.save"
  ]),
  payload: z.record(z.unknown()).default({})
});

const allowedOrderStatuses = new Set<V2OrderStatus>([
  "WAITING_FULFILLMENT", "COMPLETED", "CANCELLED", "REFUNDING", "REFUNDED"
]);

export async function main(event: unknown) {
  return v2Response(async () => {
    const { action, payload } = eventSchema.parse(event);
    const { repository, application } = createV2Runtime();
    if (action === "auth.login") return loginV2Owner(repository, payload);

    const { sessionToken } = v2SessionSchema.parse(payload);
    const owner = await requireV2Owner(repository, sessionToken);
    const body = { ...payload };
    delete body.sessionToken;

    switch (action) {
      case "auth.profile": return { _id: owner._id, username: owner.username, displayName: owner.displayName };
      case "dashboard.get": return application.ownerDashboard();
      case "orders.list": {
        const status = typeof body.status === "string" && allowedOrderStatuses.has(body.status as V2OrderStatus)
          ? body.status as V2OrderStatus
          : undefined;
        return application.ownerOrders(status);
      }
      case "orders.complete": return application.completeOrder(String(body.orderId ?? ""));
      case "orders.cancelCoupon": return application.cancelCouponOrder(String(body.orderId ?? ""));
      case "orders.refund": return application.refundOrder(String(body.orderId ?? ""));
      case "products.list": return application.ownerProducts();
      case "products.save": return application.saveProduct(body);
      case "exchange.list": return application.ownerExchangeItems();
      case "exchange.save": return application.saveExchangeItem(body);
      case "members.search": return application.searchMembers(String(body.query ?? ""));
      case "members.detail": return application.ownerMemberDetail(String(body.memberId ?? ""));
      case "config.get": return application.ownerStoreConfig();
      case "config.save": return application.saveStoreConfig(body);
      default: throw new DomainError("UNKNOWN_ACTION", "不支持的操作");
    }
  });
}

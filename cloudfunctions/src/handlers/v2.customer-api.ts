import { z } from "zod";
import { createV2Runtime, customerOpenId, v2Response } from "../v2/handler";

const eventSchema = z.object({
  action: z.enum([
    "member.bootstrap",
    "home.get",
    "order.create",
    "order.mockPay",
    "order.queryPayment",
    "order.cancelPayment",
    "order.listMine",
    "order.listMinePage",
    "points.list",
    "coupon.exchange",
    "coupon.listMine",
    "coupon.use",
    "invite.resolve",
    "invite.bind",
    "invite.overview"
  ]),
  payload: z.record(z.unknown()).default({})
});

const pageSchema = z.object({
  cursor: z.string().trim().max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.number().int().min(1).max(100).default(20)
});

export function customerMemberPageQuery(payload: Record<string, unknown>, legacyLimit: number) {
  if (payload.cursor === undefined && payload.limit === undefined) return { limit: legacyLimit };
  return pageSchema.parse(payload);
}

export async function main(event: unknown) {
  return v2Response(async () => {
    const { action, payload } = eventSchema.parse(event);
    const openId = customerOpenId();
    const { application } = createV2Runtime();
    switch (action) {
      case "member.bootstrap": return application.bootstrapMember(openId);
      case "home.get": return application.home(openId);
      case "order.create": return application.createPaymentOrder(openId, payload);
      case "order.mockPay": return application.mockPay(openId, String(payload.orderId ?? ""));
      case "order.queryPayment": return application.queryPayment(openId, String(payload.orderId ?? ""));
      case "order.cancelPayment": return application.cancelPendingPayment(openId, String(payload.orderId ?? ""));
      case "order.listMine": return (await application.memberOrders(openId, { limit: 50 })).rows;
      case "order.listMinePage": return application.memberOrders(openId, pageSchema.parse(payload));
      case "points.list": return application.memberPoints(openId, customerMemberPageQuery(payload, 100));
      case "coupon.exchange": return application.exchangeCoupon(openId, payload);
      case "coupon.listMine": return application.memberCoupons(openId);
      case "coupon.use": return application.useCoupon(openId, payload);
      case "invite.resolve": return application.resolveInvite(openId, payload);
      case "invite.bind": return application.bindInvite(openId, payload);
      case "invite.overview": return application.inviteOverview(openId);
    }
  });
}

import { z } from "zod";
import { createV2Runtime, customerOpenId, v2Response } from "../v2/handler";

const eventSchema = z.object({
  action: z.enum([
    "member.bootstrap",
    "home.get",
    "order.create",
    "order.mockPay",
    "order.queryPayment",
    "order.listMine",
    "points.list",
    "coupon.exchange",
    "coupon.listMine",
    "coupon.use",
    "invite.bind",
    "invite.overview"
  ]),
  payload: z.record(z.unknown()).default({})
});

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
      case "order.listMine": return application.memberOrders(openId);
      case "points.list": return application.memberPoints(openId);
      case "coupon.exchange": return application.exchangeCoupon(openId, payload);
      case "coupon.listMine": return application.memberCoupons(openId);
      case "coupon.use": return application.useCoupon(openId, payload);
      case "invite.bind": return application.bindInvite(openId, payload);
      case "invite.overview": return application.inviteOverview(openId);
    }
  });
}

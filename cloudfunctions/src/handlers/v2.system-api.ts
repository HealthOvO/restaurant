import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { DomainError } from "@restaurant/shared";
import { createV2Runtime, v2Response } from "../v2/handler";
import { initializeV2Store, resetV2Owner } from "../v2/setup";

const eventSchema = z.object({
  action: z.enum(["setup.initialize", "setup.resetOwner", "payments.reconcile", "refunds.reconcile", "mock.confirmPayment"]),
  secret: z.string().min(1),
  payload: z.record(z.unknown()).default({})
});

function secretMatches(actual: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function main(event: unknown) {
  return v2Response(async () => {
    const input = eventSchema.parse(event);
    const setupAction = input.action.startsWith("setup.");
    const expected = setupAction ? process.env.BOOTSTRAP_SECRET?.trim() : process.env.SYSTEM_JOB_SECRET?.trim();
    if (!secretMatches(input.secret, expected)) throw new DomainError("UNAUTHORIZED", setupAction ? "初始化鉴权失败" : "系统任务鉴权失败");
    const { repository, application } = createV2Runtime();
    switch (input.action) {
      case "setup.initialize": return initializeV2Store(repository, input.payload);
      case "setup.resetOwner": return resetV2Owner(repository, input.payload);
      case "payments.reconcile": return application.reconcilePayments();
      case "refunds.reconcile": return application.reconcileRefunds();
      case "mock.confirmPayment": {
        if (process.env.NODE_ENV === "production" || process.env.PAYMENT_PROVIDER !== "mock") {
          throw new DomainError("MOCK_PAYMENT_DISABLED", "模拟支付不可用");
        }
        return application.confirmPaidOrder(String(input.payload.orderId ?? ""), "MOCK");
      }
    }
  });
}

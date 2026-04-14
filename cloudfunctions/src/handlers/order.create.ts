import { defineHandler } from "../runtime/handler";
import { requireMiniProgramOpenId } from "../runtime/request";
import { createMemberOrder } from "../runtime/service.order";

export const main = defineHandler(async ({ context, event, repository }) => {
  return createMemberOrder(repository, requireMiniProgramOpenId(context.OPENID), event);
});

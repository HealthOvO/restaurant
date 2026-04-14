import { defineHandler } from "../runtime/handler";
import { requireMiniProgramOpenId } from "../runtime/request";
import { listMemberOrders } from "../runtime/service.order";

export const main = defineHandler(async ({ context, repository }) => {
  return listMemberOrders(repository, requireMiniProgramOpenId(context.OPENID));
});

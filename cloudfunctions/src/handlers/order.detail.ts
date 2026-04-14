import { defineHandler } from "../runtime/handler";
import { requireMiniProgramOpenId } from "../runtime/request";
import { getMemberOrderDetail } from "../runtime/service.order";

export const main = defineHandler(async ({ context, event, repository }) => {
  return getMemberOrderDetail(repository, requireMiniProgramOpenId(context.OPENID), event);
});

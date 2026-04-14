import { defineHandler } from "../runtime/handler";
import { requireMiniProgramOpenId } from "../runtime/request";
import { bootstrapMember } from "../runtime/service.member";

export const main = defineHandler(async ({ event, context, repository }) => {
  return bootstrapMember(repository, requireMiniProgramOpenId(context.OPENID), event);
});

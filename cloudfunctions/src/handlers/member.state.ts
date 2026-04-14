import { defineHandler } from "../runtime/handler";
import { requireMiniProgramOpenId } from "../runtime/request";
import { getMemberState } from "../runtime/service.member";

export const main = defineHandler(async ({ context, repository }) => {
  return getMemberState(repository, requireMiniProgramOpenId(context.OPENID));
});

import { defineHandler } from "../runtime/handler";
import { requireMemberByOpenId, requireMiniProgramOpenId } from "../runtime/request";
import { redeemPoints } from "../runtime/service.member";

export const main = defineHandler(async ({ context, event, repository }) => {
  const member = await requireMemberByOpenId(repository, requireMiniProgramOpenId(context.OPENID));
  return redeemPoints(repository, member._id, event);
});

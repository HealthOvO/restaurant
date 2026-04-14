import { defineHandler } from "../runtime/handler";
import { requireMemberByOpenId, requireMiniProgramOpenId } from "../runtime/request";
import { inviteOverview } from "../runtime/service.member";

export const main = defineHandler(async ({ context, repository }) => {
  const member = await requireMemberByOpenId(repository, requireMiniProgramOpenId(context.OPENID));
  return inviteOverview(repository, member._id);
});

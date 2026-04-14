import { defineHandler } from "../runtime/handler";
import { requireMemberByOpenId, requireMiniProgramOpenId } from "../runtime/request";
import { bindInvite } from "../runtime/service.member";

export const main = defineHandler(async ({ event, context, repository }) => {
  const member = await requireMemberByOpenId(repository, requireMiniProgramOpenId(context.OPENID));

  return bindInvite(repository, {
    ...((event as Record<string, unknown>) ?? {}),
    inviteeMemberId: member._id
  });
});

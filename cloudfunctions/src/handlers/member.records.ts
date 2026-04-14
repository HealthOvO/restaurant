import { defineHandler } from "../runtime/handler";
import { requireMemberByOpenId, requireMiniProgramOpenId } from "../runtime/request";
import { listMemberRecords } from "../runtime/service.member";

export const main = defineHandler(async ({ context, repository }) => {
  const member = await requireMemberByOpenId(repository, requireMiniProgramOpenId(context.OPENID));
  return listMemberRecords(repository, member._id);
});

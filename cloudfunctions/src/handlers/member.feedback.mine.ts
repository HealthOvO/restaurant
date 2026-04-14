import { defineHandler } from "../runtime/handler";
import { listMyMemberFeedback } from "../runtime/service.feedback";

export const main = defineHandler(async ({ context, repository }) =>
  listMyMemberFeedback(repository, context.OPENID || "")
);

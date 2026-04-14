import { defineHandler } from "../runtime/handler";
import { submitMemberFeedback } from "../runtime/service.feedback";

export const main = defineHandler(async ({ event, context, repository }) =>
  submitMemberFeedback(repository, context.OPENID || "", event)
);

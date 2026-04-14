import { defineHandler } from "../runtime/handler";
import { updateAdminFeedback } from "../runtime/service.feedback";

export const main = defineHandler(async ({ event, repository }) => updateAdminFeedback(repository, event));

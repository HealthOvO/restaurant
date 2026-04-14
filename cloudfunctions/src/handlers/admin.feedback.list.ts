import { defineHandler } from "../runtime/handler";
import { listAdminFeedback } from "../runtime/service.feedback";

export const main = defineHandler(async ({ event, repository }) => listAdminFeedback(repository, event));

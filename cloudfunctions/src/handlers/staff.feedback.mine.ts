import { defineHandler } from "../runtime/handler";
import { listMyStaffFeedback } from "../runtime/service.feedback";

export const main = defineHandler(async ({ event, repository }) => listMyStaffFeedback(repository, event));

import { defineHandler } from "../runtime/handler";
import { submitStaffFeedback } from "../runtime/service.feedback";

export const main = defineHandler(async ({ event, repository }) => submitStaffFeedback(repository, event));

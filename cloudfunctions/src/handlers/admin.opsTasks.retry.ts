import { defineHandler } from "../runtime/handler";
import { retryOpsTask } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => retryOpsTask(repository, event));


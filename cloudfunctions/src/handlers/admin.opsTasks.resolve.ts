import { defineHandler } from "../runtime/handler";
import { resolveOpsTask } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => resolveOpsTask(repository, event));


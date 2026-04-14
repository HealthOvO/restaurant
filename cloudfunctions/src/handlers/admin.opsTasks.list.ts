import { defineHandler } from "../runtime/handler";
import { listOpsTasks } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => listOpsTasks(repository, event));


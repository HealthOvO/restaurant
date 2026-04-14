import { defineHandler } from "../runtime/handler";
import { saveRules } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => saveRules(repository, event));

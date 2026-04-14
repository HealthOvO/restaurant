import { defineHandler } from "../runtime/handler";
import { listRules } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) =>
  listRules(repository, (event as { sessionToken: string }).sessionToken)
);

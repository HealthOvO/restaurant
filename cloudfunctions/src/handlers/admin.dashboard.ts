import { defineHandler } from "../runtime/handler";
import { dashboard } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) =>
  dashboard(repository, (event as { sessionToken: string }).sessionToken)
);

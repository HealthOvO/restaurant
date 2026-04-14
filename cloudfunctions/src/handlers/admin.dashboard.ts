import { defineHandler } from "../runtime/handler";
import { dashboard } from "../runtime/service.admin";
import { sessionTokenInputSchema } from "@restaurant/shared";

export const main = defineHandler(async ({ event, repository }) => {
  const parsed = sessionTokenInputSchema.parse(event);
  return dashboard(repository, parsed.sessionToken);
});

import { defineHandler } from "../runtime/handler";
import { adminMenuListInputSchema } from "@restaurant/shared";
import { listAdminMenu } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => {
  const parsed = adminMenuListInputSchema.parse(event);
  return listAdminMenu(repository, parsed.sessionToken);
});

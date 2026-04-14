import { defineHandler } from "../runtime/handler";
import { listAuditLogs } from "../runtime/service.admin";
import { sessionTokenInputSchema } from "@restaurant/shared";

export const main = defineHandler(async ({ event, repository }) => {
  const parsed = sessionTokenInputSchema.parse(event);
  return listAuditLogs(repository, parsed.sessionToken);
});

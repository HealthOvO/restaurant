import { defineHandler } from "../runtime/handler";
import { listAuditLogs } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) =>
  listAuditLogs(repository, (event as { sessionToken: string }).sessionToken)
);

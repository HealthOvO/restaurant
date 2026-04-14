import { defineHandler } from "../runtime/handler";
import { settleFirstVisit } from "../runtime/service.member";

export const main = defineHandler(async ({ event, repository }) => settleFirstVisit(repository, event));

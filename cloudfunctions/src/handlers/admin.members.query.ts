import { defineHandler } from "../runtime/handler";
import { queryMembers } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => queryMembers(repository, event));

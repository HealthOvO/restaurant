import { defineHandler } from "../runtime/handler";
import { saveAdminMenu } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => saveAdminMenu(repository, event));

import { defineHandler } from "../runtime/handler";
import { getMenuCatalog } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => getMenuCatalog(repository, event));

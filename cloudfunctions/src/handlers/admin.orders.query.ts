import { defineHandler } from "../runtime/handler";
import { queryAdminOrders } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => queryAdminOrders(repository, event));

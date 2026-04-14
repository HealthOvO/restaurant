import { defineHandler } from "../runtime/handler";
import { listStaffOrders } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => listStaffOrders(repository, event));

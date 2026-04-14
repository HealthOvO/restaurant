import { defineHandler } from "../runtime/handler";
import { updateStaffOrderStatus } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => updateStaffOrderStatus(repository, event));

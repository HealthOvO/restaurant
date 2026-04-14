import { defineHandler } from "../runtime/handler";
import { getStaffOrderDetail } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => getStaffOrderDetail(repository, event));

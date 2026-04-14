import { defineHandler } from "../runtime/handler";
import { previewMemberOrder } from "../runtime/service.order";

export const main = defineHandler(async ({ event, repository }) => previewMemberOrder(repository, event));

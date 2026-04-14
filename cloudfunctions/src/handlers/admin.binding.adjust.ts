import { defineHandler } from "../runtime/handler";
import { adjustBinding } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => adjustBinding(repository, event));

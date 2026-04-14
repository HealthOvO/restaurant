import { defineHandler } from "../runtime/handler";
import { bootstrapStoreOwner } from "../runtime/service.bootstrap";

export const main = defineHandler(async ({ event, repository }) => bootstrapStoreOwner(repository, event));

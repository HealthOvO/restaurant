import { defineHandler } from "../runtime/handler";
import { initDatabaseCollections } from "../runtime/service.setup";

export const main = defineHandler(async () => initDatabaseCollections());

import { defineHandler } from "../runtime/handler";
import { manageStaff } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => manageStaff(repository, event));

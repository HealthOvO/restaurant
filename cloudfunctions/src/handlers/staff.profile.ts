import { defineHandler } from "../runtime/handler";
import { getStaffProfile } from "../runtime/service.staff";

export const main = defineHandler(async ({ event, repository }) => getStaffProfile(repository, event));

import { defineHandler } from "../runtime/handler";
import { searchMembersForStaff } from "../runtime/service.staff";

export const main = defineHandler(async ({ event, repository }) => {
  return searchMembersForStaff(repository, event);
});

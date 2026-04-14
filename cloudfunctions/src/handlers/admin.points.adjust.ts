import { defineHandler } from "../runtime/handler";
import { adjustMemberPoints } from "../runtime/service.admin";

export const main = defineHandler(async ({ event, repository }) => adjustMemberPoints(repository, event));

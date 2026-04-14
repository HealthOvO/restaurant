import { defineHandler } from "../runtime/handler";
import { login } from "../runtime/service.staff";

export const main = defineHandler(async ({ event, context, repository }) =>
  login(repository, {
    ...((event as Record<string, unknown>) ?? {}),
    miniOpenId: context.OPENID
  })
);

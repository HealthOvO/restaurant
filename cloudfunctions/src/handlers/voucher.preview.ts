import { defineHandler } from "../runtime/handler";
import { previewVoucherRedemption } from "../runtime/service.member";

export const main = defineHandler(async ({ event, repository }) => previewVoucherRedemption(repository, event));

import { defineHandler } from "../runtime/handler";
import { redeemVoucher } from "../runtime/service.member";

export const main = defineHandler(async ({ event, repository }) => redeemVoucher(repository, event));

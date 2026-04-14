import type { DishVoucher } from "@restaurant/shared";
import { RestaurantRepository } from "./repository";

export function isVoucherExpired(voucher: DishVoucher, now: string): boolean {
  return voucher.status === "READY" && voucher.expiresAt <= now;
}

export async function syncExpiredVoucherStatuses(
  repository: RestaurantRepository,
  vouchers: DishVoucher[],
  now: string
): Promise<DishVoucher[]> {
  const expiredVouchers = vouchers
    .filter((voucher) => isVoucherExpired(voucher, now))
    .map((voucher) => ({
      ...voucher,
      status: "EXPIRED" as const,
      updatedAt: now
    }));

  if (expiredVouchers.length > 0) {
    await repository.saveVouchers(expiredVouchers);
  }

  const overrides = new Map(expiredVouchers.map((voucher) => [voucher._id, voucher]));
  return vouchers.map((voucher) => overrides.get(voucher._id) ?? voucher);
}

import type { V2Order } from "@restaurant/shared";
import { readResourceCache, writeResourceCache } from "./resource-cache";

export interface CachedOrderPage {
  rows: V2Order[];
  nextCursor?: string;
}

export function orderPageCacheKey(status: string): string {
  return `orders:${status}`;
}

export function readOrderPageCache(status: string): CachedOrderPage | undefined {
  const cached = readResourceCache<CachedOrderPage | V2Order[]>(orderPageCacheKey(status));
  if (!cached) return undefined;
  return Array.isArray(cached) ? { rows: cached } : cached;
}

export function writeOrderPageCache(status: string, page: CachedOrderPage): void {
  writeResourceCache(orderPageCacheKey(status), page);
}

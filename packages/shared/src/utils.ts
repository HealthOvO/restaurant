import { DEFAULT_VOUCHER_VALID_DAYS } from "./constants";

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function addDays(isoDate: string, days = DEFAULT_VOUCHER_VALID_DAYS): string {
  const base = new Date(isoDate);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

export function createMemberCode(memberId: string): string {
  const compact = memberId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `M${compact.slice(-8).padStart(8, "0")}`;
}

export function createFeedbackCode(feedbackId: string): string {
  const compact = feedbackId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `F${compact.slice(-8).padStart(8, "0")}`;
}

export function safeIncludes(haystack: string | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

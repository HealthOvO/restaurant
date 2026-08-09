import { DomainError } from "../errors";

const BUSINESS_TIME_ZONE = "Asia/Shanghai";

export function parseDayBoundary(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new DomainError("INVALID_DAY_BOUNDARY", "营业日切换时间格式不正确");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function businessDateAt(now: Date, dayBoundaryTime = "04:00"): string {
  const boundaryMinutes = parseDayBoundary(dayBoundaryTime);
  const shifted = new Date(now.getTime() - boundaryMinutes * 60_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(shifted);
}

export function formatPickupNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new DomainError("INVALID_PICKUP_SEQUENCE", "取餐序号必须是正整数");
  }
  return String(sequence).padStart(3, "0");
}

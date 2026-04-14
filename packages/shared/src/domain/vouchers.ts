import { DomainError } from "../errors";
import type { DishVoucher, InviteRewardMode, RewardRule } from "../types";
import { addDays } from "../utils";

export function resolveInviteRewardMode(rule: Pick<RewardRule, "rewardMode">): InviteRewardMode {
  return rule.rewardMode ?? "ONCE";
}

export function resolveInvitePointsReward(rule: Pick<RewardRule, "pointsReward">): number {
  return Math.max(1, Number(rule.pointsReward) || 1);
}

export function calculateMilestoneRewardTargetCount(rule: RewardRule, activatedCount: number): number {
  if (rule.type !== "INVITE_MILESTONE" || !rule.isEnabled) {
    return 0;
  }

  const threshold = rule.threshold ?? Number.MAX_SAFE_INTEGER;
  if (activatedCount < threshold) {
    return 0;
  }

  return resolveInviteRewardMode(rule) === "REPEATABLE" ? Math.floor(activatedCount / threshold) : 1;
}

export function deriveMilestoneRulesToReward(
  rewardRules: RewardRule[],
  activatedCount: number,
  existingRewardCountsByRuleId: Record<string, number>
): RewardRule[] {
  return rewardRules
    .filter((rule) => rule.type === "INVITE_MILESTONE" && rule.isEnabled)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((rule) => {
      const alreadyRewardedCount = existingRewardCountsByRuleId[rule._id] ?? 0;
      const targetRewardCount = calculateMilestoneRewardTargetCount(rule, activatedCount);
      const pendingRewardCount = Math.max(0, targetRewardCount - alreadyRewardedCount);
      return Array.from({ length: pendingRewardCount }, () => rule);
    });
}

export function deriveWelcomeRule(rewardRules: RewardRule[]): RewardRule | undefined {
  return rewardRules.find(
    (rule) =>
      rule.type === "WELCOME" &&
      rule.isEnabled &&
      Boolean(rule.voucherTemplate?.dishId?.trim()) &&
      Boolean(rule.voucherTemplate?.dishName?.trim())
  );
}

export function assertVoucherRedeemable(voucher: DishVoucher, now: string): void {
  if (voucher.status !== "READY") {
    throw new DomainError("VOUCHER_UNAVAILABLE", "该菜品券当前不可核销");
  }

  if (voucher.expiresAt <= now) {
    throw new DomainError("VOUCHER_EXPIRED", "该菜品券已过期");
  }
}

export function calculateVoucherExpiry(now: string, validDays: number): string {
  return addDays(now, validDays);
}

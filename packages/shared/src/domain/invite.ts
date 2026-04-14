import { DomainError } from "../errors";
import type { InviteOverview, InviteRelation, Member, MemberPointTransaction, RewardRule } from "../types";
import { calculateMilestoneRewardTargetCount, resolveInvitePointsReward, resolveInviteRewardMode } from "./vouchers";

interface BindInviteParams {
  inviterMemberId: string;
  inviteeMemberId: string;
  inviteeHasCompletedFirstVisit: boolean;
  existingRelation?: InviteRelation | null;
}

export function assertInviteBindingAllowed(params: BindInviteParams): void {
  const { existingRelation, inviteeHasCompletedFirstVisit, inviteeMemberId, inviterMemberId } = params;

  if (inviterMemberId === inviteeMemberId) {
    throw new DomainError("SELF_INVITE_FORBIDDEN", "会员不能邀请自己");
  }

  if (inviteeHasCompletedFirstVisit) {
    throw new DomainError("INVITEE_ALREADY_ACTIVATED", "首次到店后的会员不能再绑定邀请人");
  }

  if (existingRelation) {
    throw new DomainError("INVITEE_ALREADY_BOUND", "该会员已绑定邀请人");
  }
}

interface AdjustInviteBindingParams {
  inviterMemberId: string;
  inviteeMemberId: string;
  existingRelation?: InviteRelation | null;
}

export function assertInviteAdjustmentAllowed(params: AdjustInviteBindingParams): void {
  const { existingRelation, inviteeMemberId, inviterMemberId } = params;

  if (inviterMemberId === inviteeMemberId) {
    throw new DomainError("SELF_INVITE_FORBIDDEN", "邀请人和被邀请人不能是同一会员");
  }

  if (
    existingRelation &&
    existingRelation.inviterMemberId === inviterMemberId &&
    existingRelation.inviteeMemberId === inviteeMemberId
  ) {
    throw new DomainError("INVITE_RELATION_UNCHANGED", "邀请关系未发生变化");
  }
}

export function isInviteRelationActivated(relation: Pick<InviteRelation, "status" | "activatedAt">): boolean {
  return relation.status === "ACTIVATED" || (relation.status === "ADJUSTED" && Boolean(relation.activatedAt));
}

export function isInviteRelationPending(relation: Pick<InviteRelation, "status" | "activatedAt">): boolean {
  return relation.status === "PENDING" || (relation.status === "ADJUSTED" && !relation.activatedAt);
}

export function buildInviteRewardCountMap(
  pointTransactions: MemberPointTransaction[],
  inviterMemberId?: string
): Record<string, number> {
  return pointTransactions.reduce<Record<string, number>>((counts, transaction) => {
    if (
      transaction.type !== "INVITE_REWARD" ||
      !transaction.sourceRuleId ||
      (inviterMemberId && transaction.memberId !== inviterMemberId)
    ) {
      return counts;
    }

    const delta = transaction.changeAmount >= 0 ? 1 : -1;
    counts[transaction.sourceRuleId] = (counts[transaction.sourceRuleId] ?? 0) + delta;
    return counts;
  }, {});
}

interface InviteOverviewParams {
  inviterMemberId: string;
  relations: InviteRelation[];
  rules: RewardRule[];
  pointTransactions: MemberPointTransaction[];
}

export function buildInviteOverview(params: InviteOverviewParams): InviteOverview {
  const { inviterMemberId, pointTransactions, relations, rules } = params;
  const mine = relations.filter((item) => item.inviterMemberId === inviterMemberId);
  const activatedCount = mine.filter((item) => isInviteRelationActivated(item)).length;
  const pendingCount = mine.filter((item) => isInviteRelationPending(item)).length;
  const milestoneRules = rules
    .filter((item) => item.type === "INVITE_MILESTONE" && item.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rewardCountsByRuleId = buildInviteRewardCountMap(pointTransactions, inviterMemberId);

  return {
    inviterMemberId,
    activatedCount,
    pendingCount,
    milestones: milestoneRules.map((rule) => {
      const threshold = rule.threshold ?? 0;
      const rewardMode = resolveInviteRewardMode(rule);
      const rewardedCount = Math.max(0, rewardCountsByRuleId[rule._id] ?? 0);
      const targetRewardCount = calculateMilestoneRewardTargetCount(rule, activatedCount);
      const nextRewardThreshold =
        rewardMode === "REPEATABLE" && threshold > 0 ? (Math.floor(activatedCount / threshold) + 1) * threshold : threshold;

      return {
        ruleId: rule._id,
        title: rule.name,
        threshold,
        pointsReward: resolveInvitePointsReward(rule),
        rewardMode,
        rewardedCount,
        pendingRewardCount: Math.max(0, targetRewardCount - rewardedCount),
        nextRewardThreshold,
        isReached: targetRewardCount > 0,
        isRewarded: rewardedCount > 0
      };
    })
  };
}

export function resolveInviterByCode(members: Member[], inviteCode?: string): Member | undefined {
  if (!inviteCode) {
    return undefined;
  }

  return members.find((member) => member.memberCode === inviteCode);
}

import { DomainError } from "../errors";
import type { DishVoucher, InviteRelation, Member, RewardRule, VisitRecord } from "../types";
import { isInviteRelationPending } from "./invite";
import {
  calculateVoucherExpiry,
  deriveMilestoneRulesToReward,
  deriveWelcomeRule,
  resolveInvitePointsReward,
  resolveInviteRewardMode
} from "./vouchers";

interface SettleVisitParams {
  member: Member;
  existingVisit?: VisitRecord | null;
  inviteRelation?: InviteRelation | null;
  inviterActivatedCountBeforeVisit: number;
  inviterRewardCountsByRuleId: Record<string, number>;
  rewardRules: RewardRule[];
  externalOrderNo: string;
  verifiedByStaffId: string;
  operatorChannel: "MINIPROGRAM" | "WEB";
  tableNo?: string;
  notes?: string;
  now: string;
  createId: () => string;
  storeId: string;
}

export interface VisitSettlementResult {
  isIdempotent: boolean;
  visitRecord: VisitRecord;
  markMemberFirstVisit: boolean;
  activateInviteRelation: boolean;
  welcomeVoucher?: DishVoucher;
  milestonePointAwards: MilestonePointAward[];
  activatedInviteCountAfterVisit: number;
}

export interface MilestonePointAward {
  ruleId: string;
  ruleName: string;
  threshold: number;
  rewardMode: "ONCE" | "REPEATABLE";
  pointsReward: number;
}

export function settleVisitRewards(params: SettleVisitParams): VisitSettlementResult {
  const {
    member,
    existingVisit,
    inviteRelation,
    inviterActivatedCountBeforeVisit,
    inviterRewardCountsByRuleId,
    rewardRules,
    externalOrderNo,
    verifiedByStaffId,
    operatorChannel,
    tableNo,
    notes,
    now,
    createId,
    storeId
  } = params;

  if (!member.phone || !member.phoneVerifiedAt) {
    throw new DomainError("MEMBER_PHONE_REQUIRED", "会员尚未完成微信手机号验证");
  }

  if (existingVisit) {
    return {
      isIdempotent: true,
      visitRecord: existingVisit,
      markMemberFirstVisit: false,
      activateInviteRelation: false,
      milestonePointAwards: [],
      activatedInviteCountAfterVisit: inviterActivatedCountBeforeVisit
    };
  }

  const isFirstValidVisit = !member.hasCompletedFirstVisit;

  const visitRecord: VisitRecord = {
    _id: createId(),
    storeId,
    memberId: member._id,
    externalOrderNo,
    verifiedByStaffId,
    operatorChannel,
    tableNo,
    notes,
    isFirstValidVisit,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now
  };

  if (!isFirstValidVisit) {
    return {
      isIdempotent: false,
      visitRecord,
      markMemberFirstVisit: false,
      activateInviteRelation: false,
      milestonePointAwards: [],
      activatedInviteCountAfterVisit: inviterActivatedCountBeforeVisit
    };
  }

  const welcomeRule = deriveWelcomeRule(rewardRules);
  const welcomeVoucher = welcomeRule
    ? buildVoucher({
        createId,
        storeId,
        memberId: member._id,
        now,
        source: "WELCOME",
        rule: welcomeRule,
        visitRecordId: visitRecord._id
      })
    : undefined;

  const shouldActivateInviteRelation = inviteRelation ? isInviteRelationPending(inviteRelation) : false;
  const activatedInviteCountAfterVisit = shouldActivateInviteRelation
    ? inviterActivatedCountBeforeVisit + 1
    : inviterActivatedCountBeforeVisit;

  const milestonePointAwards = shouldActivateInviteRelation
    ? deriveMilestoneRulesToReward(rewardRules, activatedInviteCountAfterVisit, inviterRewardCountsByRuleId).map((rule) => ({
        ruleId: rule._id,
        ruleName: rule.name,
        threshold: rule.threshold ?? 0,
        rewardMode: resolveInviteRewardMode(rule),
        pointsReward: resolveInvitePointsReward(rule)
      }))
    : [];

  return {
    isIdempotent: false,
    visitRecord,
    markMemberFirstVisit: true,
    activateInviteRelation: shouldActivateInviteRelation,
    welcomeVoucher,
    milestonePointAwards,
    activatedInviteCountAfterVisit
  };
}

function buildVoucher(params: {
  createId: () => string;
  storeId: string;
  memberId: string;
  now: string;
  source: "WELCOME" | "INVITE_MILESTONE";
  rule: RewardRule;
  visitRecordId: string;
}): DishVoucher {
  const { createId, memberId, now, rule, source, storeId, visitRecordId } = params;
  const voucherTemplate = rule.voucherTemplate;
  if (!voucherTemplate) {
    throw new DomainError("INVALID_RULE_CONFIG", "首单礼规则缺少菜品配置");
  }

  return {
    _id: createId(),
    storeId,
    memberId,
    source,
    sourceRuleId: rule._id,
    sourceVisitRecordId: visitRecordId,
    dishId: voucherTemplate.dishId,
    dishName: voucherTemplate.dishName,
    status: "READY",
    expiresAt: calculateVoucherExpiry(now, voucherTemplate.validDays),
    createdAt: now,
    updatedAt: now
  };
}

import type { DishVoucher, InviteRelation, Member, RewardRule, StaffUser, VisitRecord } from "../types";

export interface VisitSettlementSnapshot {
  member: Member;
  existingVisit?: VisitRecord | null;
  inviteRelation?: InviteRelation | null;
  inviterActivatedCountBeforeVisit: number;
  inviterRewardCountsByRuleId: Record<string, number>;
  rewardRules: RewardRule[];
}

export interface MemberSearchResult {
  member: Member;
  relation?: InviteRelation | null;
  latestVisit?: VisitRecord | null;
  vouchers: DishVoucher[];
}

export interface StaffAuthContext {
  staff: StaffUser;
}

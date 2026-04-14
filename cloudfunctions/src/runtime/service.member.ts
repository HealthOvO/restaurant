import {
  buildInviteRewardCountMap,
  DomainError,
  assertInviteBindingAllowed,
  assertVoucherRedeemable,
  bindInviteInputSchema,
  bootstrapInputSchema,
  buildInviteOverview,
  calculateVoucherExpiry,
  createMemberCode,
  deriveMilestoneRulesToReward,
  deriveWelcomeRule,
  isInviteRelationActivated,
  isInviteRelationPending,
  normalizePhone,
  pointRedeemInputSchema,
  redeemVoucherInputSchema,
  resolveInvitePointsReward,
  resolveInviteRewardMode,
  settleVisitInputSchema,
  type AuditLog,
  type DishVoucher,
  type InviteRelation,
  type Member,
  type MemberPointTransaction,
  type PointExchangeItem,
  type RewardRule,
  type VisitRecord
} from "@restaurant/shared";
import { requireActiveStaffSession } from "./service.staff";
import { syncExpiredVoucherStatuses } from "./voucher-status";
import { cloud } from "./cloud";
import { createId } from "./ids";
import { RestaurantRepository } from "./repository";

function nowIso(): string {
  return new Date().toISOString();
}

function readVerifiedPhoneFromOpenApiResult(result: unknown): string {
  const payload = result as
    | {
        phone_info?: {
          purePhoneNumber?: string;
          phoneNumber?: string;
        };
        phoneInfo?: {
          purePhoneNumber?: string;
          phoneNumber?: string;
        };
      }
    | undefined;

  const phoneInfo = payload?.phone_info ?? payload?.phoneInfo;
  const rawPhone = phoneInfo?.purePhoneNumber ?? phoneInfo?.phoneNumber;
  if (!rawPhone) {
    throw new DomainError("PHONE_VERIFY_FAILED", "未能获取到微信手机号，请重新授权");
  }

  return normalizePhone(rawPhone);
}

async function resolveVerifiedPhoneNumber(phoneCode: string): Promise<string> {
  try {
    const result = await cloud.openapi.phonenumber.getPhoneNumber({
      code: phoneCode
    });
    return readVerifiedPhoneFromOpenApiResult(result);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    throw new DomainError("PHONE_VERIFY_FAILED", "微信手机号验证失败，请重新授权");
  }
}

async function writeAudit(
  repository: RestaurantRepository,
  payload: Omit<AuditLog, "_id" | "createdAt" | "updatedAt" | "storeId">
): Promise<void> {
  const now = nowIso();
  await repository.addAuditLog({
    _id: createId("audit"),
    storeId: repository.storeId,
    createdAt: now,
    updatedAt: now,
    ...payload
  });
}

async function writeAuditSafely(
  repository: RestaurantRepository,
  payload: Omit<AuditLog, "_id" | "createdAt" | "updatedAt" | "storeId">
): Promise<void> {
  try {
    await writeAudit(repository, payload);
  } catch (error) {
    console.error("[audit] failed to persist log", payload.action, error);
  }
}

function buildPointTransaction(params: {
  transactionId?: string;
  repository: RestaurantRepository;
  memberId: string;
  type: MemberPointTransaction["type"];
  changeAmount: number;
  balanceAfter: number;
  now: string;
  sourceRuleId?: string;
  sourceVisitRecordId?: string;
  sourceExchangeItemId?: string;
  sourceVoucherId?: string;
  note?: string;
}): MemberPointTransaction {
  const {
    transactionId,
    repository,
    memberId,
    type,
    changeAmount,
    balanceAfter,
    now,
    sourceRuleId,
    sourceVisitRecordId,
    sourceExchangeItemId,
    sourceVoucherId,
    note
  } = params;

  return {
    _id: transactionId ?? createId("points"),
    storeId: repository.storeId,
    memberId,
    type,
    changeAmount,
    balanceAfter,
    sourceRuleId,
    sourceVisitRecordId,
    sourceExchangeItemId,
    sourceVoucherId,
    note,
    createdAt: now,
    updatedAt: now
  };
}

function buildWelcomeVoucher(params: {
  repository: RestaurantRepository;
  memberId: string;
  now: string;
  visitRecordId: string;
  voucherId?: string;
  rewardRule: RewardRule;
}): DishVoucher {
  const { memberId, now, repository, rewardRule, visitRecordId, voucherId } = params;
  const voucherTemplate = rewardRule.voucherTemplate;
  if (!voucherTemplate) {
    throw new DomainError("INVALID_RULE_CONFIG", "新客礼规则缺少菜品配置");
  }

  return {
    _id: voucherId ?? createId("voucher"),
    storeId: repository.storeId,
    memberId,
    source: "WELCOME",
    sourceRuleId: rewardRule._id,
    sourceVisitRecordId: visitRecordId,
    dishId: voucherTemplate.dishId,
    dishName: voucherTemplate.dishName,
    status: "READY",
    expiresAt: calculateVoucherExpiry(now, voucherTemplate.validDays),
    createdAt: now,
    updatedAt: now
  };
}

function buildExchangeVoucher(params: {
  voucherId?: string;
  repository: RestaurantRepository;
  memberId: string;
  exchangeItem: PointExchangeItem;
  now: string;
}): DishVoucher {
  const { exchangeItem, memberId, now, repository } = params;

  return {
    _id: params.voucherId ?? createId("voucher"),
    storeId: repository.storeId,
    memberId,
    source: "POINT_EXCHANGE",
    sourceRuleId: exchangeItem._id,
    dishId: exchangeItem.voucherTemplate.dishId,
    dishName: exchangeItem.voucherTemplate.dishName,
    status: "READY",
    expiresAt: calculateVoucherExpiry(now, exchangeItem.voucherTemplate.validDays),
    createdAt: now,
    updatedAt: now
  };
}

function normalizeInviteRewardCounts(
  currentCounts?: Record<string, number>,
  fallbackCounts?: Record<string, number>
): Record<string, number> {
  const nextCounts: Record<string, number> = {};

  for (const [ruleId, count] of Object.entries({
    ...(fallbackCounts ?? {}),
    ...(currentCounts ?? {})
  })) {
    nextCounts[ruleId] = Math.max(0, Number(count) || 0);
  }

  return nextCounts;
}

function buildVoucherRedemptionId(voucherId: string): string {
  return `redeem_${voucherId}`;
}

function normalizeNumber(value: unknown): number {
  return Number(value) || 0;
}

function buildRequestScopedId(prefix: string, requestId?: string): string {
  const normalized = `${requestId || ""}`.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!normalized) {
    return createId(prefix);
  }

  return `${prefix}_${normalized}`;
}

function isLikelyDuplicateError(error: unknown): boolean {
  const message = `${(error as { message?: string } | undefined)?.message ?? ""}`.toLowerCase();
  const code = `${(error as { code?: string | number } | undefined)?.code ?? ""}`.toLowerCase();

  return (
    message.includes("duplicate") ||
    message.includes("already exists") ||
    message.includes("e11000") ||
    code.includes("duplicate")
  );
}

async function findMemberByInviteCode(
  repository: RestaurantRepository,
  inviteCode?: string
): Promise<Member | undefined> {
  const normalizedCode = inviteCode?.trim();
  if (!normalizedCode) {
    return undefined;
  }

  return (await repository.listMembers()).find((member) => member.memberCode === normalizedCode);
}

function assertMemberPhoneVerified(member: Pick<Member, "phone" | "phoneVerifiedAt">, message: string): void {
  if (!member.phone || !member.phoneVerifiedAt) {
    throw new DomainError("MEMBER_PHONE_REQUIRED", message);
  }
}

function buildIdempotentVisitSettlement(params: {
  visitRecord: VisitRecord;
  activatedInviteCountAfterVisit?: number;
  inviterPointsBalanceAfter?: number;
}) {
  return {
    isIdempotent: true,
    visitRecord: params.visitRecord,
    markMemberFirstVisit: false,
    activateInviteRelation: false,
    welcomeVoucher: undefined,
    milestonePointAwards: [],
    milestonePointTransactions: [],
    activatedInviteCountAfterVisit: params.activatedInviteCountAfterVisit ?? 0,
    inviterPointsBalanceAfter: params.inviterPointsBalanceAfter ?? 0
  };
}

async function buildInviteSettlementSnapshot(
  repository: RestaurantRepository,
  inviteeMemberId: string,
  fallbackRelation?: InviteRelation | null,
  fallbackInviter?: Member | null
): Promise<{
  activatedInviteCountAfterVisit: number;
  inviterPointsBalanceAfter: number;
}> {
  const relation = fallbackRelation ?? (await repository.getInviteRelationByInviteeId(inviteeMemberId));
  if (!relation?.inviterMemberId) {
    return {
      activatedInviteCountAfterVisit: 0,
      inviterPointsBalanceAfter: 0
    };
  }

  const [relations, inviter] = await Promise.all([
    repository.listInviteRelations(),
    repository.getMemberById(relation.inviterMemberId)
  ]);
  const effectiveInviter = inviter ?? fallbackInviter ?? null;

  return {
    activatedInviteCountAfterVisit: relations.filter(
      (item) => item.inviterMemberId === relation.inviterMemberId && isInviteRelationActivated(item)
    ).length,
    inviterPointsBalanceAfter: normalizeNumber(effectiveInviter?.pointsBalance)
  };
}

function buildVoucherRedemptionRecord(params: {
  repository: RestaurantRepository;
  voucher: DishVoucher;
  redeemedAt: string;
  redeemedByStaffId: string;
}) {
  const { redeemedAt, redeemedByStaffId, repository, voucher } = params;

  return {
    _id: buildVoucherRedemptionId(voucher._id),
    storeId: repository.storeId,
    voucherId: voucher._id,
    memberId: voucher.memberId,
    redeemedByStaffId,
    redeemedAt,
    createdAt: redeemedAt,
    updatedAt: redeemedAt
  };
}

export async function bootstrapMember(
  repository: RestaurantRepository,
  callerOpenId: string,
  input: unknown
): Promise<{
  ok: true;
  member: Member;
  relation?: InviteRelation | null;
}> {
  const parsed = bootstrapInputSchema.parse(input);
  const now = nowIso();
  const requestedInviteCode = parsed.inviteCode ? parsed.inviteCode.trim() : undefined;
  const verifiedPhone = parsed.phoneCode ? await resolveVerifiedPhoneNumber(parsed.phoneCode) : undefined;
  let member = await repository.getMemberByOpenId(callerOpenId);

  if (!member) {
    const memberId = createId("member");
    member = {
      _id: memberId,
      storeId: repository.storeId,
      memberCode: createMemberCode(memberId),
      openId: callerOpenId,
      phone: verifiedPhone,
      phoneVerifiedAt: verifiedPhone ? now : undefined,
      nickname: parsed.nickname,
      avatarUrl: parsed.avatarUrl,
      pendingInviteCode: requestedInviteCode,
      pointsBalance: 0,
      hasCompletedFirstVisit: false,
      createdAt: now,
      updatedAt: now
    };
  } else {
    if (verifiedPhone) {
      if (member.phoneVerifiedAt && member.phone && member.phone !== verifiedPhone) {
        throw new DomainError("MEMBER_PHONE_LOCKED", "手机号已完成微信验证，如需更换请联系老板处理");
      }
      member.phone = verifiedPhone;
      member.phoneVerifiedAt = member.phoneVerifiedAt ?? now;
    }
    member.nickname = parsed.nickname ?? member.nickname;
    member.avatarUrl = parsed.avatarUrl ?? member.avatarUrl;
    member.pendingInviteCode = requestedInviteCode ?? member.pendingInviteCode;
    member.pointsBalance = Number(member.pointsBalance) || 0;
    member.updatedAt = now;
  }

  if (verifiedPhone) {
    const existingPhoneMember = await repository.getMemberByPhone(verifiedPhone);
    if (existingPhoneMember && existingPhoneMember._id !== member._id) {
      throw new DomainError("PHONE_ALREADY_USED", "该手机号已注册会员");
    }
  }

  await repository.saveMember(member);

  let relation = await repository.getInviteRelationByInviteeId(member._id);
  const effectiveInviteCode = (requestedInviteCode ?? member.pendingInviteCode ?? "").trim();
  let nextPendingInviteCode = member.pendingInviteCode ?? undefined;

  if (relation && nextPendingInviteCode) {
    nextPendingInviteCode = undefined;
  } else if (!relation && effectiveInviteCode) {
    if (!member.phoneVerifiedAt) {
      nextPendingInviteCode = effectiveInviteCode;
    } else {
      const inviter = await findMemberByInviteCode(repository, effectiveInviteCode);
      nextPendingInviteCode = undefined;

      if (inviter && inviter._id !== member._id) {
        assertInviteBindingAllowed({
          inviterMemberId: inviter._id,
          inviteeMemberId: member._id,
          inviteeHasCompletedFirstVisit: member.hasCompletedFirstVisit
        });
        relation = {
          _id: createId("invite"),
          storeId: repository.storeId,
          inviterMemberId: inviter._id,
          inviteeMemberId: member._id,
          status: "PENDING",
          createdAt: now,
          updatedAt: now
        };
        await repository.saveInviteRelation(relation);
      }
    }
  }

  if ((member.pendingInviteCode ?? undefined) !== nextPendingInviteCode) {
    member.pendingInviteCode = nextPendingInviteCode;
    member.updatedAt = now;
    await repository.saveMember(member);
  }

  return {
    ok: true,
    member,
    relation
  };
}

export async function getMemberState(repository: RestaurantRepository, callerOpenId: string) {
  const member = await repository.getMemberByOpenId(callerOpenId);
  if (!member) {
    return {
      ok: true,
      member: null,
      relation: null
    };
  }

  const relation = await repository.getInviteRelationByInviteeId(member._id);
  return {
    ok: true,
    member,
    relation: relation ?? null
  };
}

export async function bindInvite(
  repository: RestaurantRepository,
  input: unknown
): Promise<{
  ok: true;
  relation: InviteRelation;
}> {
  const parsed = bindInviteInputSchema.parse(input);
  const invitee = await repository.getMemberById(parsed.inviteeMemberId);
  const inviter = parsed.inviterMemberId
    ? await repository.getMemberById(parsed.inviterMemberId)
    : await findMemberByInviteCode(repository, parsed.inviteCode);

  if (!invitee || !inviter) {
    throw new DomainError("MEMBER_NOT_FOUND", parsed.inviteCode ? "邀请码不存在或对应会员无效" : "邀请双方会员不存在");
  }
  assertMemberPhoneVerified(invitee, "完成微信手机号验证后才能绑定邀请码");

  const existingRelation = await repository.getInviteRelationByInviteeId(invitee._id);
  assertInviteBindingAllowed({
    inviterMemberId: inviter._id,
    inviteeMemberId: invitee._id,
    inviteeHasCompletedFirstVisit: invitee.hasCompletedFirstVisit,
    existingRelation
  });

  const now = nowIso();
  const relation: InviteRelation = {
    _id: createId("invite"),
    storeId: repository.storeId,
    inviterMemberId: inviter._id,
    inviteeMemberId: invitee._id,
    status: "PENDING",
    createdAt: now,
    updatedAt: now
  };
  await repository.saveInviteRelation(relation);
  if (invitee.pendingInviteCode) {
    invitee.pendingInviteCode = undefined;
    invitee.updatedAt = now;
    await repository.saveMember(invitee);
  }
  return { ok: true, relation };
}

export async function inviteOverview(repository: RestaurantRepository, memberId: string) {
  const [relations, rules, pointTransactions] = await Promise.all([
    repository.listInviteRelations(),
    repository.listRewardRules(),
    repository.listMemberPointTransactions(memberId)
  ]);

  return {
    ok: true,
    overview: buildInviteOverview({
      inviterMemberId: memberId,
      relations,
      rules,
      pointTransactions
    })
  };
}

export async function settleFirstVisit(repository: RestaurantRepository, input: unknown) {
  const parsed = settleVisitInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER" && staff.role !== "STAFF") {
    throw new DomainError("FORBIDDEN", "当前账号没有核销权限");
  }

  const member = await repository.getMemberById(parsed.memberId);
  if (!member) {
    throw new DomainError("MEMBER_NOT_FOUND", "会员不存在");
  }

  const [existingVisit, relation, rules, relations] = await Promise.all([
    repository.getVisitByExternalOrderNo(parsed.externalOrderNo),
    repository.getInviteRelationByInviteeId(parsed.memberId),
    repository.listRewardRules(),
    repository.listInviteRelations()
  ]);

  if (existingVisit && existingVisit.memberId !== parsed.memberId) {
    throw new DomainError("ORDER_ALREADY_USED", "该订单号已用于其他会员核销，不能重复作为首单激活");
  }

  const inviter = relation?.inviterMemberId ? await repository.getMemberById(relation.inviterMemberId) : null;
  if (relation?.inviterMemberId && !inviter) {
    throw new DomainError("MEMBER_NOT_FOUND", "邀请人会员不存在");
  }

  const inviterPointTransactions = inviter ? await repository.listMemberPointTransactions(inviter._id) : [];
  const inviterRewardCountsByRuleId = buildInviteRewardCountMap(inviterPointTransactions, inviter?._id);

  const inviterActivatedCountBeforeVisit =
    relation?.inviterMemberId
      ? relations.filter(
          (item) => item.inviterMemberId === relation.inviterMemberId && isInviteRelationActivated(item)
        ).length
      : 0;
  if (existingVisit) {
    const snapshot = await buildInviteSettlementSnapshot(repository, parsed.memberId, relation, inviter);
    return {
      ok: true,
      settlement: buildIdempotentVisitSettlement({
        visitRecord: existingVisit,
        activatedInviteCountAfterVisit: snapshot.activatedInviteCountAfterVisit,
        inviterPointsBalanceAfter: snapshot.inviterPointsBalanceAfter
      })
    };
  }

  const now = nowIso();
  const visitRecordId = createId("entity");

  try {
    const settlement = await repository.runTransaction(async (transaction) => {
      const currentMember = await transaction.getMemberById(parsed.memberId);
      if (!currentMember) {
        throw new DomainError("MEMBER_NOT_FOUND", "会员不存在");
      }
      assertMemberPhoneVerified(currentMember, "会员尚未完成微信手机号验证");

      const isFirstValidVisit = !currentMember.hasCompletedFirstVisit;
      const visitRecord = {
        _id: visitRecordId,
        storeId: repository.storeId,
        memberId: currentMember._id,
        externalOrderNo: parsed.externalOrderNo,
        verifiedByStaffId: staff._id,
        operatorChannel: parsed.operatorChannel,
        tableNo: parsed.tableNo,
        notes: parsed.notes,
        isFirstValidVisit,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now
      };

      let welcomeVoucher: DishVoucher | undefined;
      let activateInviteRelation = false;
      let milestonePointAwards: Array<{
        ruleId: string;
        ruleName: string;
        threshold: number;
        rewardMode: "ONCE" | "REPEATABLE";
        pointsReward: number;
      }> = [];
      let milestonePointTransactions: MemberPointTransaction[] = [];
      let inviterPointsBalanceAfter = inviter?.pointsBalance ?? 0;
      let activatedInviteCountAfterVisit = inviterActivatedCountBeforeVisit;

      if (isFirstValidVisit) {
        currentMember.hasCompletedFirstVisit = true;
        currentMember.firstVisitAt = now;
        currentMember.updatedAt = now;
        await transaction.saveMember(currentMember);

        const welcomeRule = deriveWelcomeRule(rules);
        if (welcomeRule) {
          welcomeVoucher = buildWelcomeVoucher({
            repository,
            memberId: currentMember._id,
            now,
            visitRecordId: visitRecord._id,
            rewardRule: welcomeRule
          });
          await transaction.saveVoucher(welcomeVoucher);
        }
      }

      const currentRelation = relation ? await transaction.getInviteRelationById(relation._id) : null;
      if (isFirstValidVisit && currentRelation && inviter) {
        const currentInviter = await transaction.getMemberById(inviter._id);
        if (!currentInviter) {
          throw new DomainError("MEMBER_NOT_FOUND", "邀请人会员不存在");
        }

        if (isInviteRelationPending(currentRelation)) {
          activateInviteRelation = true;
          currentRelation.status = "ACTIVATED";
          currentRelation.activatedAt = now;
          currentRelation.updatedAt = now;
          await transaction.saveInviteRelation(currentRelation);

          activatedInviteCountAfterVisit = Math.max(
            0,
            normalizeNumber(currentInviter.activatedInviteCount ?? inviterActivatedCountBeforeVisit)
          ) + 1;

          const currentRewardCounts = normalizeInviteRewardCounts(
            currentInviter.inviteRewardIssuedCounts,
            inviterRewardCountsByRuleId
          );
          const rulesToReward = deriveMilestoneRulesToReward(rules, activatedInviteCountAfterVisit, currentRewardCounts);
          let runningBalance = normalizeNumber(currentInviter.pointsBalance);
          const nextRewardCounts = { ...currentRewardCounts };

          milestonePointAwards = rulesToReward.map((rule) => {
            const ruleId = rule._id;
            nextRewardCounts[ruleId] = (nextRewardCounts[ruleId] ?? 0) + 1;
            return {
              ruleId,
              ruleName: rule.name,
              threshold: rule.threshold ?? 0,
              rewardMode: resolveInviteRewardMode(rule),
              pointsReward: resolveInvitePointsReward(rule)
            };
          });

          milestonePointTransactions = milestonePointAwards.map((award) => {
            runningBalance += award.pointsReward;
            return buildPointTransaction({
              repository,
              memberId: currentInviter._id,
              type: "INVITE_REWARD",
              changeAmount: award.pointsReward,
              balanceAfter: runningBalance,
              now,
              sourceRuleId: award.ruleId,
              sourceVisitRecordId: visitRecord._id,
              note: `邀请达标赠送积分：${award.ruleName}`
            });
          });

          currentInviter.pointsBalance = runningBalance;
          currentInviter.activatedInviteCount = activatedInviteCountAfterVisit;
          currentInviter.inviteRewardIssuedCounts = nextRewardCounts;
          currentInviter.updatedAt = now;
          await transaction.saveMember(currentInviter);
          if (milestonePointTransactions.length > 0) {
            await transaction.savePointTransactions(milestonePointTransactions);
          }
          inviterPointsBalanceAfter = currentInviter.pointsBalance;
        }
      }

      await transaction.createVisitRecord(visitRecord);

      return {
        isIdempotent: false,
        visitRecord,
        markMemberFirstVisit: isFirstValidVisit,
        activateInviteRelation,
        welcomeVoucher,
        milestonePointAwards,
        milestonePointTransactions,
        activatedInviteCountAfterVisit,
        inviterPointsBalanceAfter
      };
    });

    await writeAuditSafely(repository, {
      actorId: staff._id,
      actorType: staff.role === "OWNER" ? "OWNER" : "STAFF",
      action: "SETTLE_FIRST_VISIT",
      targetCollection: "visit_records",
      targetId: settlement.visitRecord._id,
      summary: `核销会员 ${member.memberCode} 的消费记录 ${parsed.externalOrderNo}`,
      payload: {
        welcomeVoucherId: settlement.welcomeVoucher?._id,
        milestonePointTransactionIds: settlement.milestonePointTransactions.map((item) => item._id),
        milestonePointsAwarded: settlement.milestonePointTransactions.reduce((total, item) => total + item.changeAmount, 0)
      }
    });

    return {
      ok: true,
      settlement
    };
  } catch (error) {
    if (isLikelyDuplicateError(error)) {
      const duplicatedVisit = await repository.getVisitByExternalOrderNo(parsed.externalOrderNo);
      if (duplicatedVisit) {
        if (duplicatedVisit.memberId !== parsed.memberId) {
          throw new DomainError("ORDER_ALREADY_USED", "该订单号已用于其他会员核销，不能重复作为首单激活");
        }

        const snapshot = await buildInviteSettlementSnapshot(repository, parsed.memberId, relation, inviter);
        return {
          ok: true,
          settlement: buildIdempotentVisitSettlement({
            visitRecord: duplicatedVisit,
            activatedInviteCountAfterVisit: snapshot.activatedInviteCountAfterVisit,
            inviterPointsBalanceAfter: snapshot.inviterPointsBalanceAfter
          })
        };
      }
    }

    throw error;
  }
}

export async function listMyVouchers(repository: RestaurantRepository, memberId: string) {
  const member = await repository.getMemberById(memberId);
  if (!member) {
    throw new DomainError("MEMBER_NOT_FOUND", "会员不存在");
  }

  const [rawVouchers, exchangeItems, pointTransactions] = await Promise.all([
    repository.listMemberVouchers(memberId),
    repository.listPointExchangeItems(),
    repository.listMemberPointTransactions(memberId)
  ]);
  const vouchers = await syncExpiredVoucherStatuses(repository, rawVouchers, nowIso());

  return {
    ok: true,
    pointsBalance: normalizeNumber(member.pointsBalance),
    exchangeItems: exchangeItems.filter((item) => item.isEnabled),
    pointTransactions: pointTransactions.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 20),
    vouchers: vouchers.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  };
}

export async function listMemberRecords(repository: RestaurantRepository, memberId: string) {
  const visits = await repository.listVisitsByMember(memberId);
  return {
    ok: true,
    visits: visits.sort((left, right) => right.verifiedAt.localeCompare(left.verifiedAt))
  };
}

export async function redeemPoints(repository: RestaurantRepository, memberId: string, input: unknown) {
  const parsed = pointRedeemInputSchema.parse(input);
  const requestId = buildRequestScopedId("redeem", parsed.requestId);
  const voucherId = buildRequestScopedId("voucher", requestId);
  const pointTransactionId = buildRequestScopedId("points", requestId);

  const result = await repository.runTransaction(async (transaction) => {
    const member = await transaction.getMemberById(memberId);
    if (!member) {
      throw new DomainError("MEMBER_NOT_FOUND", "会员不存在");
    }

    const exchangeItem = await transaction.getPointExchangeItemById(parsed.exchangeItemId);
    if (!exchangeItem || !exchangeItem.isEnabled) {
      throw new DomainError("EXCHANGE_ITEM_NOT_FOUND", "兑换菜品不存在或已下架");
    }

    const [existingVoucher, existingPointTransaction] = await Promise.all([
      transaction.getVoucherById(voucherId),
      transaction.getPointTransactionById(pointTransactionId)
    ]);

    if (existingVoucher || existingPointTransaction) {
      if (existingVoucher && existingPointTransaction) {
        return {
          isIdempotent: true,
          member,
          exchangeItem,
          pointsBalance: Number(member.pointsBalance) || 0,
          pointTransaction: existingPointTransaction,
          voucher: existingVoucher
        };
      }

      throw new DomainError("POINT_EXCHANGE_INCONSISTENT", "检测到兑换记录异常，请联系老板处理");
    }

    if ((Number(member.pointsBalance) || 0) < exchangeItem.pointsCost) {
      throw new DomainError("POINTS_INSUFFICIENT", "当前积分不足，暂时无法兑换");
    }

    const now = nowIso();
    const voucher = buildExchangeVoucher({
      repository,
      voucherId,
      memberId: member._id,
      exchangeItem,
      now
    });

    member.pointsBalance = (Number(member.pointsBalance) || 0) - exchangeItem.pointsCost;
    member.updatedAt = now;

    const pointTransaction = buildPointTransaction({
      transactionId: pointTransactionId,
      repository,
      memberId: member._id,
      type: "POINT_EXCHANGE",
      changeAmount: -exchangeItem.pointsCost,
      balanceAfter: member.pointsBalance,
      now,
      sourceExchangeItemId: exchangeItem._id,
      sourceVoucherId: voucher._id,
      note: `积分兑换菜品：${exchangeItem.name}`
    });

    await transaction.saveMember(member);
    await transaction.saveVoucher(voucher);
    await transaction.savePointTransaction(pointTransaction);

    return {
      isIdempotent: false,
      member,
      exchangeItem,
      pointsBalance: member.pointsBalance,
      pointTransaction,
      voucher
    };
  });

  if (!result.isIdempotent) {
    await writeAuditSafely(repository, {
      actorId: result.member._id,
      actorType: "MEMBER",
      action: "POINT_EXCHANGE",
      targetCollection: "dish_vouchers",
      targetId: result.voucher._id,
      summary: `会员兑换菜品 ${result.exchangeItem.name}`,
      payload: {
        exchangeItemId: result.exchangeItem._id,
        pointsCost: result.exchangeItem.pointsCost,
        voucherId: result.voucher._id
      }
    });
  }

  return {
    ok: true,
    isIdempotent: result.isIdempotent,
    pointsBalance: result.pointsBalance,
    pointTransaction: result.pointTransaction,
    voucher: result.voucher
  };
}

export async function redeemVoucher(repository: RestaurantRepository, input: unknown) {
  const parsed = redeemVoucherInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER" && staff.role !== "STAFF") {
    throw new DomainError("FORBIDDEN", "当前账号没有核销权限");
  }

  const voucher = await repository.getVoucherById(parsed.voucherId);
  if (!voucher) {
    throw new DomainError("VOUCHER_NOT_FOUND", "菜品券不存在");
  }

  const now = nowIso();
  const [normalizedVoucher] = await syncExpiredVoucherStatuses(repository, [voucher], now);
  const redemptionId = buildVoucherRedemptionId(normalizedVoucher._id);
  const redemptionResult = await repository.runTransaction(async (transaction) => {
    const currentVoucher = await transaction.getVoucherById(parsed.voucherId);
    if (!currentVoucher) {
      throw new DomainError("VOUCHER_NOT_FOUND", "菜品券不存在");
    }

    const existingRedemption = await transaction.getVoucherRedemptionById(redemptionId);
    if (existingRedemption) {
      if (
        currentVoucher.status !== "USED" ||
        currentVoucher.usedAt !== existingRedemption.redeemedAt ||
        currentVoucher.usedByStaffId !== existingRedemption.redeemedByStaffId
      ) {
        currentVoucher.status = "USED";
        currentVoucher.usedAt = existingRedemption.redeemedAt;
        currentVoucher.usedByStaffId = existingRedemption.redeemedByStaffId;
        currentVoucher.updatedAt = now;
        await transaction.saveVoucher(currentVoucher);
      }

      return {
        voucher: currentVoucher,
        isIdempotent: true
      };
    }

    if (currentVoucher.status === "USED" && currentVoucher.usedAt && currentVoucher.usedByStaffId) {
      await transaction.saveVoucherRedemption(
        buildVoucherRedemptionRecord({
          repository,
          voucher: currentVoucher,
          redeemedByStaffId: currentVoucher.usedByStaffId,
          redeemedAt: currentVoucher.usedAt
        })
      );
      return {
        voucher: currentVoucher,
        isIdempotent: true
      };
    }

    assertVoucherRedeemable(currentVoucher, now);
    currentVoucher.status = "USED";
    currentVoucher.usedAt = now;
    currentVoucher.usedByStaffId = staff._id;
    currentVoucher.updatedAt = now;
    await transaction.saveVoucher(currentVoucher);
    await transaction.saveVoucherRedemption(
      buildVoucherRedemptionRecord({
        repository,
        voucher: currentVoucher,
        redeemedByStaffId: staff._id,
        redeemedAt: now
      })
    );

    return {
      voucher: currentVoucher,
      isIdempotent: false
    };
  });

  if (!redemptionResult.isIdempotent) {
    await writeAuditSafely(repository, {
      actorId: staff._id,
      actorType: staff.role === "OWNER" ? "OWNER" : "STAFF",
      action: "REDEEM_VOUCHER",
      targetCollection: "dish_vouchers",
      targetId: redemptionResult.voucher._id,
      summary: `核销菜品券 ${redemptionResult.voucher.dishName}`
    });
  }

  return {
    ok: true,
    voucher: redemptionResult.voucher,
    isIdempotent: redemptionResult.isIdempotent
  };
}

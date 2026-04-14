import {
  assertInviteAdjustmentAllowed,
  assertPointExchangeItemsValid,
  assertRewardRulesConfigValid,
  buildInviteRewardCountMap,
  buildRewardRuleSaveSummary,
  calculateMilestoneRewardTargetCount,
  DomainError,
  adminOpsTaskListInputSchema,
  adminOpsTaskResolveInputSchema,
  adminOpsTaskRetryInputSchema,
  adjustBindingInputSchema,
  adjustMemberPointsInputSchema,
  isInviteRelationActivated,
  memberQueryInputSchema,
  ruleSaveInputSchema,
  resolveInvitePointsReward,
  staffManageInputSchema,
  type AuditLog,
  type MemberPointTransaction,
  type OpsTask,
  type PaginationMeta,
  type PointExchangeItem,
  type RewardRule,
  type StaffManageInput,
  type StaffUser
} from "@restaurant/shared";
import { hashPassword } from "./auth";
import { createId } from "./ids";
import { RestaurantRepository } from "./repository";
import { settleFirstVisit } from "./service.member";
import { classifyVisitSettlementFailure, upsertOrderVisitSettlementTask } from "./service.ops";
import { requireActiveStaffSession } from "./service.staff";
import { syncExpiredVoucherStatuses } from "./voucher-status";

function nowIso(): string {
  return new Date().toISOString();
}

function buildPaginationMeta(total: number, requestedPage: number, pageSize: number): PaginationMeta {
  if (total === 0) {
    return {
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
      pageItemCount: 0,
      rangeStart: 0,
      rangeEnd: 0,
      hasPrevPage: false,
      hasNextPage: false
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    pageItemCount: rangeEnd - rangeStart + 1,
    rangeStart,
    rangeEnd,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages
  };
}

function compareMembers(
  left: {
    updatedAt: string;
    createdAt: string;
    firstVisitAt?: string;
    memberCode: string;
  },
  right: {
    updatedAt: string;
    createdAt: string;
    firstVisitAt?: string;
    memberCode: string;
  }
) {
  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  if ((right.firstVisitAt ?? "") !== (left.firstVisitAt ?? "")) {
    return (right.firstVisitAt ?? "").localeCompare(left.firstVisitAt ?? "");
  }
  if (right.createdAt !== left.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  return right.memberCode.localeCompare(left.memberCode);
}

function compareOpsTasks(left: OpsTask, right: OpsTask) {
  const priorityWeight = {
    URGENT: 3,
    HIGH: 2,
    NORMAL: 1
  } as const;

  return (
    priorityWeight[right.priority] - priorityWeight[left.priority] ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.createdAt.localeCompare(left.createdAt)
  );
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

function normalizeVoucherTemplate(
  voucherTemplate: RewardRule["voucherTemplate"] | PointExchangeItem["voucherTemplate"] | undefined
) {
  if (!voucherTemplate) {
    return undefined;
  }

  return {
    ...voucherTemplate,
    dishId: voucherTemplate.dishId.trim(),
    dishName: voucherTemplate.dishName.trim()
  };
}

function resolveInviteRewardUnitPoints(rule: RewardRule, pointTransactions: MemberPointTransaction[]): number {
  const historicalTransaction = pointTransactions.find(
    (transaction) =>
      transaction.type === "INVITE_REWARD" &&
      transaction.sourceRuleId === rule._id &&
      transaction.changeAmount !== 0
  );

  return historicalTransaction ? Math.abs(historicalTransaction.changeAmount) : resolveInvitePointsReward(rule);
}

async function reconcileInviteRewardsForInviter(
  repository: RestaurantRepository,
  inviterMemberId: string,
  rewardRules: RewardRule[],
  relations: Array<{ inviterMemberId: string; status: "PENDING" | "ACTIVATED" | "ADJUSTED"; activatedAt?: string }>,
  reason: string,
  actorId: string,
  now: string
) {
  const inviter = await repository.getMemberById(inviterMemberId);
  if (!inviter) {
    return null;
  }

  const pointTransactions = await repository.listMemberPointTransactions(inviterMemberId);
  const currentRewardCounts = buildInviteRewardCountMap(pointTransactions, inviterMemberId);
  const nextRewardCounts = {
    ...(inviter.inviteRewardIssuedCounts ?? currentRewardCounts)
  };
  const activatedCount = relations.filter(
    (relation) => relation.inviterMemberId === inviterMemberId && isInviteRelationActivated(relation)
  ).length;
  let balanceAfter = Number(inviter.pointsBalance) || 0;
  const compensationTransactions: MemberPointTransaction[] = [];

  for (const rule of rewardRules
    .filter((item) => item.type === "INVITE_MILESTONE")
    .sort((left, right) => left.sortOrder - right.sortOrder)) {
    const targetRewardCount = calculateMilestoneRewardTargetCount(rule, activatedCount);
    const currentRewardCount = Math.max(0, currentRewardCounts[rule._id] ?? 0);
    const adjustmentCount = targetRewardCount - currentRewardCount;
    nextRewardCounts[rule._id] = targetRewardCount;

    if (adjustmentCount === 0) {
      continue;
    }

    const rewardUnitPoints = resolveInviteRewardUnitPoints(rule, pointTransactions);
    const deltaSign = adjustmentCount > 0 ? 1 : -1;
    const notePrefix = deltaSign > 0 ? "后台补发邀请积分" : "后台回收邀请积分";

    for (let index = 0; index < Math.abs(adjustmentCount); index += 1) {
      const changeAmount = rewardUnitPoints * deltaSign;
      balanceAfter += changeAmount;
      compensationTransactions.push({
        _id: createId("points"),
        storeId: repository.storeId,
        memberId: inviterMemberId,
        type: "INVITE_REWARD",
        changeAmount,
        balanceAfter,
        sourceRuleId: rule._id,
        note: `${notePrefix}：${rule.name}（${reason}）`,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  inviter.pointsBalance = balanceAfter;
  inviter.activatedInviteCount = activatedCount;
  inviter.inviteRewardIssuedCounts = nextRewardCounts;
  inviter.updatedAt = now;

  await repository.saveMember(inviter);
  if (compensationTransactions.length > 0) {
    await repository.savePointTransactions(compensationTransactions);
  }

  if (compensationTransactions.length > 0) {
    await writeAuditSafely(repository, {
      actorId,
      actorType: "OWNER",
      action: "RECALCULATE_INVITE_POINTS",
      targetCollection: "member_point_transactions",
      targetId: inviterMemberId,
      summary: `重算会员 ${inviter.memberCode} 的邀请积分`,
      payload: {
        inviterMemberId,
        activatedCount,
        adjustmentCount: compensationTransactions.length,
        reason
      }
    });
  }

  return {
    inviter,
    compensationTransactions,
    activatedCount
  };
}

export async function dashboard(repository: RestaurantRepository, token: string) {
  const { staff } = await requireActiveStaffSession(repository, token);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以查看概览");
  }

  return {
    ok: true,
    stats: await repository.getDashboardStats()
  };
}

export async function queryMembers(repository: RestaurantRepository, input: unknown) {
  const parsed = memberQueryInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以查看完整会员数据");
  }
  const now = nowIso();
  const shouldUseRepositoryPaging = !parsed.query.trim() && typeof repository.listMembersPage === "function";
  const pagedMembers = shouldUseRepositoryPaging ? await repository.listMembersPage(parsed.page, parsed.pageSize) : null;
  const members = pagedMembers ? pagedMembers.rows : (await repository.searchMembers(parsed.query)).sort(compareMembers);
  const pagination = buildPaginationMeta(pagedMembers ? pagedMembers.total : members.length, parsed.page, parsed.pageSize);
  const pageMembers = pagedMembers
    ? members
    : pagination.total === 0
      ? []
      : members.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);
  const memberIds = pageMembers.map((member) => member._id);
  const [relations, visits, rawVouchers] = await Promise.all([
    repository.listInviteRelationsByInviteeIds(memberIds),
    repository.listVisitsByMemberIds(memberIds),
    repository.listVouchersByMemberIds(memberIds)
  ]);
  const vouchers = await syncExpiredVoucherStatuses(repository, rawVouchers, now);

  const relationByInviteeId = new Map(relations.map((relation) => [relation.inviteeMemberId, relation]));
  const visitsByMemberId = visits.reduce<Record<string, typeof visits>>((groups, visit) => {
    (groups[visit.memberId] ??= []).push(visit);
    return groups;
  }, {});
  const vouchersByMemberId = vouchers.reduce<Record<string, typeof vouchers>>((groups, voucher) => {
    (groups[voucher.memberId] ??= []).push(voucher);
    return groups;
  }, {});
  const rows = pageMembers.map((member) => ({
    member,
    relation: relationByInviteeId.get(member._id) ?? null,
    visits: (visitsByMemberId[member._id] ?? []).sort((left, right) => right.verifiedAt.localeCompare(left.verifiedAt)),
    vouchers: (vouchersByMemberId[member._id] ?? []).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }));

  return {
    ok: true,
    rows,
    pagination
  };
}

export async function listRules(repository: RestaurantRepository, token: string) {
  const { staff } = await requireActiveStaffSession(repository, token);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以查看奖励规则");
  }
  return {
    ok: true,
    rules: (await repository.listRewardRules()).sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "WELCOME" ? -1 : 1;
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.createdAt.localeCompare(right.createdAt);
    }),
    exchangeItems: await repository.listPointExchangeItems()
  };
}

export async function saveRules(repository: RestaurantRepository, input: unknown) {
  const parsed = ruleSaveInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以修改规则");
  }

  const now = nowIso();
  const [existingRules, existingExchangeItems] = await Promise.all([
    repository.listRewardRules(),
    repository.listPointExchangeItems()
  ]);
  const existingRulesById = new Map(existingRules.map((rule) => [rule._id, rule]));
  const existingExchangeItemsById = new Map(existingExchangeItems.map((item) => [item._id, item]));
  const normalizedInputRules = parsed.rules
    .slice()
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "WELCOME" ? -1 : 1;
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return (left._id ?? "").localeCompare(right._id ?? "");
    });

  const rules: RewardRule[] = normalizedInputRules.map((rule, index) => ({
    _id: rule._id ?? createId("rule"),
    storeId: repository.storeId,
    name: rule.name.trim(),
    type: rule.type,
    threshold: rule.type === "INVITE_MILESTONE" ? rule.threshold : undefined,
    rewardMode: rule.type === "INVITE_MILESTONE" ? rule.rewardMode ?? "ONCE" : undefined,
    isEnabled: rule.isEnabled,
    sortOrder: rule.sortOrder ?? index,
    voucherTemplate: normalizeVoucherTemplate(rule.voucherTemplate),
    pointsReward: rule.type === "INVITE_MILESTONE" ? Number(rule.pointsReward) || 1 : undefined,
    createdAt: (rule._id && existingRulesById.get(rule._id)?.createdAt) ?? now,
    updatedAt: now
  }));

  const normalizedExchangeItems = parsed.exchangeItems
    .slice()
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return (left._id ?? "").localeCompare(right._id ?? "");
    });

  const exchangeItems: PointExchangeItem[] = normalizedExchangeItems.map((item, index) => ({
    _id: item._id ?? createId("exchange"),
    storeId: repository.storeId,
    name: item.name.trim(),
    pointsCost: Number(item.pointsCost) || 0,
    isEnabled: item.isEnabled,
    sortOrder: item.sortOrder ?? index,
    voucherTemplate: normalizeVoucherTemplate(item.voucherTemplate) as PointExchangeItem["voucherTemplate"],
    createdAt: (item._id && existingExchangeItemsById.get(item._id)?.createdAt) ?? now,
    updatedAt: now
  }));

  assertRewardRulesConfigValid(rules);
  assertPointExchangeItemsValid(exchangeItems);

  const saveSummary = buildRewardRuleSaveSummary(rules, exchangeItems);
  const nextRuleIds = new Set(rules.map((rule) => rule._id));
  const nextExchangeItemIds = new Set(exchangeItems.map((item) => item._id));
  const createdCount = rules.filter((rule) => !existingRulesById.has(rule._id)).length;
  const deletedCount = existingRules.filter((rule) => !nextRuleIds.has(rule._id)).length;
  const updatedCount = rules.length - createdCount;
  const exchangeCreatedCount = exchangeItems.filter((item) => !existingExchangeItemsById.has(item._id)).length;
  const exchangeDeletedCount = existingExchangeItems.filter((item) => !nextExchangeItemIds.has(item._id)).length;
  const exchangeUpdatedCount = exchangeItems.length - exchangeCreatedCount;

  await Promise.all([repository.replaceRewardRules(rules), repository.replacePointExchangeItems(exchangeItems)]);
  await writeAudit(repository, {
    actorId: staff._id,
    actorType: "OWNER",
    action: "SAVE_RULES",
    targetCollection: "reward_rules",
    targetId: "bulk",
    summary: `更新 ${rules.length} 条奖励规则，${exchangeItems.length} 条积分兑换菜品`,
    payload: {
      ...saveSummary,
      createdCount,
      updatedCount,
      deletedCount,
      exchangeCreatedCount,
      exchangeUpdatedCount,
      exchangeDeletedCount
    }
  });

  return {
    ok: true,
    rules,
    exchangeItems,
    summary: {
      ...saveSummary,
      createdCount,
      updatedCount,
      deletedCount,
      exchangeCreatedCount,
      exchangeUpdatedCount,
      exchangeDeletedCount
    }
  };
}

export async function adjustBinding(repository: RestaurantRepository, input: unknown) {
  const parsed = adjustBindingInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以调整邀请关系");
  }

  const invitee = await repository.getMemberById(parsed.inviteeMemberId);
  const inviter = await repository.getMemberById(parsed.inviterMemberId);
  if (!invitee || !inviter) {
    throw new DomainError("MEMBER_NOT_FOUND", "邀请双方会员不存在");
  }

  const now = nowIso();
  let relation = await repository.getInviteRelationByInviteeId(invitee._id);
  const previousInviterMemberId = relation?.inviterMemberId ?? null;
  assertInviteAdjustmentAllowed({
    inviterMemberId: inviter._id,
    inviteeMemberId: invitee._id,
    existingRelation: relation
  });

  const nextStatus = invitee.hasCompletedFirstVisit ? "ACTIVATED" : "PENDING";
  const nextActivatedAt = nextStatus === "ACTIVATED" ? relation?.activatedAt ?? invitee.firstVisitAt ?? now : undefined;

  if (!relation) {
    relation = {
      _id: createId("invite"),
      storeId: repository.storeId,
      inviterMemberId: inviter._id,
      inviteeMemberId: invitee._id,
      status: nextStatus,
      activatedAt: nextActivatedAt,
      adjustedReason: parsed.reason,
      createdAt: now,
      updatedAt: now
    };
  } else {
    relation.inviterMemberId = inviter._id;
    relation.status = nextStatus;
    relation.activatedAt = nextActivatedAt;
    relation.adjustedReason = parsed.reason;
    relation.updatedAt = now;
  }

  const memberNeedsCleanup = Boolean(invitee.pendingInviteCode);
  if (memberNeedsCleanup) {
    invitee.pendingInviteCode = undefined;
    invitee.updatedAt = now;
  }

  await repository.saveInviteRelation(relation);
  if (memberNeedsCleanup) {
    await repository.saveMember(invitee);
  }

  const rewardRules = await repository.listRewardRules();
  const relations = await repository.listInviteRelations();
  const affectedInviterIds = Array.from(
    new Set([previousInviterMemberId, inviter._id].filter((memberId): memberId is string => Boolean(memberId)))
  );

  await Promise.all(
    affectedInviterIds.map((memberId) =>
      reconcileInviteRewardsForInviter(
        repository,
        memberId,
        rewardRules,
        relations,
        `人工调整 ${invitee.memberCode} 的邀请关系`,
        staff._id,
        now
      )
    )
  );

  await writeAudit(repository, {
    actorId: staff._id,
    actorType: "OWNER",
    action: "ADJUST_BINDING",
    targetCollection: "invite_relations",
    targetId: relation._id,
    summary: `人工调整 ${invitee.memberCode} 的邀请关系`,
    payload: {
      inviterMemberId: inviter._id,
      inviteeMemberId: invitee._id,
      reason: parsed.reason
    }
  });

  return {
    ok: true,
    relation
  };
}

export async function adjustMemberPoints(repository: RestaurantRepository, input: unknown) {
  const parsed = adjustMemberPointsInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以调整会员积分");
  }

  const member = await repository.getMemberById(parsed.memberId);
  if (!member) {
    throw new DomainError("MEMBER_NOT_FOUND", "会员不存在");
  }

  const nextBalance = member.pointsBalance + parsed.delta;
  if (nextBalance < 0) {
    throw new DomainError("POINTS_INSUFFICIENT", "扣减后积分不能小于 0");
  }

  const now = nowIso();
  member.pointsBalance = nextBalance;
  member.updatedAt = now;

  const pointTransaction: MemberPointTransaction = {
    _id: createId("points"),
    storeId: repository.storeId,
    memberId: member._id,
    type: "MANUAL_ADJUST",
    changeAmount: parsed.delta,
    balanceAfter: nextBalance,
    note: parsed.reason,
    createdAt: now,
    updatedAt: now
  };

  await Promise.all([repository.saveMember(member), repository.savePointTransaction(pointTransaction)]);

  await writeAudit(repository, {
    actorId: staff._id,
    actorType: "OWNER",
    action: "ADJUST_MEMBER_POINTS",
    targetCollection: "members",
    targetId: member._id,
    summary: `人工调整会员 ${member.memberCode} 的积分`,
    payload: {
      delta: parsed.delta,
      balanceAfter: nextBalance,
      reason: parsed.reason
    }
  });

  return {
    ok: true,
    member,
    pointTransaction
  };
}

export async function manageStaff(repository: RestaurantRepository, input: unknown) {
  const parsed = staffManageInputSchema.parse(input) as StaffManageInput;
  if (!parsed.sessionToken) {
    throw new DomainError("UNAUTHORIZED", "后台操作需要登录");
  }

  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  const isPasswordUpdateAction = parsed.action === "UPDATE_PASSWORD";

  if (isPasswordUpdateAction) {
    if (!parsed.user?._id || !parsed.user.password) {
      throw new DomainError("INVALID_INPUT", "缺少目标账号或新密码");
    }

    const existing = await repository.getStaffById(parsed.user._id);
    if (!existing) {
      throw new DomainError("STAFF_NOT_FOUND", "员工不存在");
    }

    if (staff.role !== "OWNER" && staff._id !== existing._id) {
      throw new DomainError("FORBIDDEN", "不能修改其他账号的密码");
    }

    existing.passwordHash = await hashPassword(parsed.user.password);
    existing.updatedAt = nowIso();
    await repository.saveStaffUser(existing);
    await writeAudit(repository, {
      actorId: staff._id,
      actorType: staff.role === "OWNER" ? "OWNER" : "STAFF",
      action: "UPDATE_PASSWORD",
      targetCollection: "staff_users",
      targetId: existing._id,
      summary:
        staff._id === existing._id
          ? `修改账号 ${existing.username} 的登录密码`
          : `重置员工账号 ${existing.username} 的登录密码`
    });
    return {
      ok: true,
      staff: {
        ...existing,
        passwordHash: undefined
      }
    };
  }

  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以管理员工");
  }

  if (parsed.action === "LIST") {
    return {
      ok: true,
      staffUsers: (await repository.listStaffUsers()).map((staffUser) => ({
        ...staffUser,
        passwordHash: undefined
      }))
    };
  }

  if (!parsed.user) {
    throw new DomainError("INVALID_INPUT", "缺少员工资料");
  }

  if (parsed.action === "CREATE") {
    if (parsed.user.role !== "STAFF") {
      throw new DomainError("FORBIDDEN", "老板账号不支持在后台新增，请保留初始化老板主账号");
    }
    const existing = await repository.getStaffByUsername(parsed.user.username);
    if (existing) {
      throw new DomainError("STAFF_USERNAME_EXISTS", "该用户名已存在");
    }

    const now = nowIso();
    const user: StaffUser = {
      _id: createId("staff"),
      storeId: repository.storeId,
      username: parsed.user.username,
      passwordHash: await hashPassword(parsed.user.password ?? "123456"),
      displayName: parsed.user.displayName,
      role: parsed.user.role,
      isEnabled: parsed.user.isEnabled ?? true,
      miniOpenId: parsed.user.miniOpenId,
      createdAt: now,
      updatedAt: now
    };
    await repository.saveStaffUser(user);
    await writeAudit(repository, {
      actorId: staff._id,
      actorType: "OWNER",
      action: "CREATE_STAFF",
      targetCollection: "staff_users",
      targetId: user._id,
      summary: `创建员工账号 ${user.username}`
    });
    return {
      ok: true,
      staff: {
        ...user,
        passwordHash: undefined
      }
    };
  }

  if (parsed.action === "UPDATE_STATUS") {
    if (!parsed.user._id) {
      throw new DomainError("INVALID_INPUT", "缺少员工 ID");
    }
    const existing = await repository.getStaffById(parsed.user._id);
    if (!existing) {
      throw new DomainError("STAFF_NOT_FOUND", "员工不存在");
    }
    if (existing.role === "OWNER") {
      throw new DomainError("FORBIDDEN", "老板主账号不支持在后台停用或改角色");
    }
    if (parsed.user.role !== "STAFF") {
      throw new DomainError("FORBIDDEN", "店员账号不能在后台提升为老板角色");
    }
    existing.isEnabled = parsed.user.isEnabled ?? existing.isEnabled;
    existing.displayName = parsed.user.displayName;
    existing.role = parsed.user.role;
    existing.updatedAt = nowIso();
    await repository.saveStaffUser(existing);
    await writeAudit(repository, {
      actorId: staff._id,
      actorType: "OWNER",
      action: "UPDATE_STAFF",
      targetCollection: "staff_users",
      targetId: existing._id,
      summary: `更新员工账号 ${existing.username}`
    });
    return {
      ok: true,
      staff: {
        ...existing,
        passwordHash: undefined
      }
    };
  }

  throw new DomainError("UNSUPPORTED_ACTION", "当前员工操作不支持");
}

export async function listAuditLogs(repository: RestaurantRepository, token: string) {
  const { staff } = await requireActiveStaffSession(repository, token);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以查看审计日志");
  }

  const logs = await repository.listAuditLogs();
  return {
    ok: true,
    logs: logs.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 100)
  };
}

export async function listOpsTasks(repository: RestaurantRepository, input: unknown) {
  const parsed = adminOpsTaskListInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以查看待处理事项");
  }

  const tasks = await repository.listOpsTasks(parsed.status, parsed.limit);
  return {
    ok: true,
    tasks: tasks.sort(compareOpsTasks)
  };
}

export async function retryOpsTask(repository: RestaurantRepository, input: unknown) {
  const parsed = adminOpsTaskRetryInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以重试待处理事项");
  }

  const task = await repository.getOpsTaskById(parsed.taskId);
  if (!task) {
    throw new DomainError("OPS_TASK_NOT_FOUND", "待处理事项不存在");
  }
  if (task.status !== "OPEN") {
    throw new DomainError("OPS_TASK_CLOSED", "这条待处理事项已经关闭");
  }
  if (task.taskType !== "ORDER_VISIT_SETTLEMENT") {
    throw new DomainError("UNSUPPORTED_ACTION", "当前待处理事项暂不支持重试");
  }
  if (!task.orderId) {
    throw new DomainError("ORDER_NOT_FOUND", "待处理事项缺少关联订单");
  }

  const order = await repository.getOrderById(task.orderId);
  if (!order) {
    throw new DomainError("ORDER_NOT_FOUND", "关联订单不存在");
  }
  if (!order.memberId) {
    throw new DomainError("ORDER_MEMBER_REQUIRED", "订单缺少会员信息，需人工处理");
  }

  const now = nowIso();

  if (order.visitRecordId) {
    task.status = "RESOLVED";
    task.priority = "NORMAL";
    task.description = "检测到这笔订单已经完成会员结算";
    task.lastRetriedAt = now;
    task.retryCount = Math.max(0, Number(task.retryCount || 0) + 1);
    task.resolvedAt = now;
    task.resolvedByStaffId = staff._id;
    task.resolution = "RETRY_SUCCESS";
    task.resolutionNote = "检测到订单已完成会员结算";
    task.updatedAt = now;
    task.lastErrorCode = undefined;
    await repository.saveOpsTask(task);

    await writeAudit(repository, {
      actorId: staff._id,
      actorType: "OWNER",
      action: "RETRY_OPS_TASK",
      targetCollection: "ops_tasks",
      targetId: task._id,
      summary: `重试待处理事项 ${task.title}`,
      payload: {
        taskId: task._id,
        orderId: order._id,
        orderNo: order.orderNo,
        result: "ALREADY_SETTLED"
      }
    });

    return {
      ok: true,
      task,
      settlement: {
        state: "SETTLED" as const,
        visitRecordId: order.visitRecordId,
        reason: "检测到订单已完成会员结算"
      }
    };
  }

  try {
    const settlement = await settleFirstVisit(repository, {
      sessionToken: parsed.sessionToken,
      memberId: order.memberId,
      externalOrderNo: order.orderNo,
      tableNo: order.tableNo,
      notes: order.remark,
      operatorChannel: "WEB"
    });

    order.visitRecordId = settlement.settlement.visitRecord._id;
    order.updatedAt = now;

    task.status = "RESOLVED";
    task.priority = "NORMAL";
    task.description = "后台重试后已完成会员结算";
    task.lastRetriedAt = now;
    task.retryCount = Math.max(0, Number(task.retryCount || 0) + 1);
    task.resolvedAt = now;
    task.resolvedByStaffId = staff._id;
    task.resolution = "RETRY_SUCCESS";
    task.resolutionNote = "后台重试后已完成会员结算";
    task.updatedAt = now;
    task.lastErrorCode = undefined;

    await Promise.all([repository.saveOrder(order), repository.saveOpsTask(task)]);

    await writeAudit(repository, {
      actorId: staff._id,
      actorType: "OWNER",
      action: "RETRY_OPS_TASK",
      targetCollection: "ops_tasks",
      targetId: task._id,
      summary: `重试待处理事项 ${task.title}`,
      payload: {
        taskId: task._id,
        orderId: order._id,
        orderNo: order.orderNo,
        visitRecordId: settlement.settlement.visitRecord._id,
        result: "SETTLED"
      }
    });

    return {
      ok: true,
      task,
      settlement: {
        state: "SETTLED" as const,
        visitRecordId: settlement.settlement.visitRecord._id
      }
    };
  } catch (error) {
    const failure = classifyVisitSettlementFailure(error);
    const nextTask = await upsertOrderVisitSettlementTask(repository, {
      orderId: order._id,
      orderNo: order.orderNo,
      memberId: order.memberId,
      memberCode: order.memberCode,
      sourceFunction: "admin.opsTasks.retry",
      failure,
      retryCountDelta: 1,
      triggeredAt: now,
      lastRetriedAt: now
    });

    await writeAudit(repository, {
      actorId: staff._id,
      actorType: "OWNER",
      action: "RETRY_OPS_TASK",
      targetCollection: "ops_tasks",
      targetId: nextTask._id,
      summary: `重试待处理事项 ${nextTask.title}`,
      payload: {
        taskId: nextTask._id,
        orderId: order._id,
        orderNo: order.orderNo,
        result: failure.state,
        errorCode: failure.code,
        reason: failure.reason
      }
    });

    return {
      ok: true,
      task: nextTask,
      settlement: {
        state: failure.state,
        code: failure.code,
        reason: failure.reason
      }
    };
  }
}

export async function resolveOpsTask(repository: RestaurantRepository, input: unknown) {
  const parsed = adminOpsTaskResolveInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以关闭待处理事项");
  }

  const task = await repository.getOpsTaskById(parsed.taskId);
  if (!task) {
    throw new DomainError("OPS_TASK_NOT_FOUND", "待处理事项不存在");
  }

  const now = nowIso();
  const resolutionNote = parsed.note.trim() || (parsed.action === "IGNORE" ? "老板已忽略处理" : "老板已人工确认处理");
  task.status = parsed.action === "IGNORE" ? "IGNORED" : "RESOLVED";
  task.priority = "NORMAL";
  task.resolvedAt = now;
  task.resolvedByStaffId = staff._id;
  task.resolution = parsed.action === "IGNORE" ? "IGNORED" : "MANUAL_RESOLVED";
  task.resolutionNote = resolutionNote;
  task.updatedAt = now;

  await repository.saveOpsTask(task);
  await writeAudit(repository, {
    actorId: staff._id,
    actorType: "OWNER",
    action: "RESOLVE_OPS_TASK",
    targetCollection: "ops_tasks",
    targetId: task._id,
    summary: `${parsed.action === "IGNORE" ? "忽略" : "关闭"}待处理事项 ${task.title}`,
    payload: {
      taskId: task._id,
      action: parsed.action,
      note: resolutionNote
    }
  });

  return {
    ok: true,
    task
  };
}

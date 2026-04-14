import {
  DEFAULT_STORE_ID,
  DomainError,
  loginInputSchema,
  staffMemberLookupInputSchema,
  sessionTokenInputSchema,
  type StaffMemberLookupRow,
  type StaffUser
} from "@restaurant/shared";
import { hashPassword, issueSessionToken, requireSessionToken, verifyPassword } from "./auth";
import { createId } from "./ids";
import { RestaurantRepository } from "./repository";
import { syncExpiredVoucherStatuses } from "./voucher-status";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeManagedStoreIds(storeId: string, managedStoreIds?: string[]): string[] {
  return Array.from(new Set([storeId, ...(managedStoreIds ?? [])].map((item) => item.trim()).filter(Boolean)));
}

function resolveStaffAccess(staff: Pick<StaffUser, "role" | "storeId" | "accessScope" | "managedStoreIds">) {
  const accessScope: "STORE_ONLY" | "ALL_STORES" =
    staff.role === "OWNER" && staff.accessScope === "ALL_STORES" ? "ALL_STORES" : "STORE_ONLY";
  return {
    accessScope,
    managedStoreIds: normalizeManagedStoreIds(staff.storeId, staff.managedStoreIds)
  };
}

export async function ensureStaffMiniOpenIdCanBind(
  repository: RestaurantRepository,
  staff: StaffUser,
  miniOpenId: string
): Promise<void> {
  if (staff.miniOpenId && staff.miniOpenId !== miniOpenId) {
    throw new DomainError("FORBIDDEN", "当前账号已绑定其他微信，请联系老板处理");
  }

  const existing = await repository.getStaffByMiniOpenId(miniOpenId);
  if (existing && existing._id !== staff._id) {
    throw new DomainError("FORBIDDEN", "当前微信已绑定其他员工账号，请使用原账号登录");
  }
}

export async function seedOwnerIfEmpty(repository: RestaurantRepository): Promise<void> {
  if (repository.storeId !== DEFAULT_STORE_ID) {
    return;
  }

  const staffUsers = await repository.listStaffUsers();
  if (staffUsers.length > 0) {
    return;
  }

  const now = nowIso();
  await repository.saveStaffUser({
    _id: createId("staff"),
    storeId: repository.storeId,
    username: "owner",
    passwordHash: await hashPassword("owner123456"),
    displayName: "老板账号",
    role: "OWNER",
    isEnabled: true,
    accessScope: "STORE_ONLY",
    managedStoreIds: [repository.storeId],
    createdAt: now,
    updatedAt: now
  });
}

export async function requireActiveStaffSession(repository: RestaurantRepository, token: string) {
  const session = requireSessionToken(token);
  const staff =
    session.storeId === repository.storeId
      ? await repository.getStaffById(session.staffUserId)
      : await repository.getStaffByIdFromStore(session.storeId, session.staffUserId);
  if (!staff || !staff.isEnabled) {
    throw new DomainError("UNAUTHORIZED", "登录已失效，请重新登录");
  }

  if (staff.storeId !== session.storeId) {
    throw new DomainError("INVALID_SESSION_SCOPE", "当前登录环境无效，请重新登录");
  }

  const { accessScope, managedStoreIds } = resolveStaffAccess(staff);
  const canAccessTargetStore =
    repository.storeId === staff.storeId ||
    (staff.role === "OWNER" && accessScope === "ALL_STORES" && managedStoreIds.includes(repository.storeId));
  if (!canAccessTargetStore) {
    throw new DomainError("INVALID_SESSION_SCOPE", "当前登录环境无效，请重新登录");
  }

  return {
    session,
    staff,
    accessScope,
    accessibleStoreIds: managedStoreIds
  };
}

export async function login(repository: RestaurantRepository, input: unknown): Promise<{
  ok: true;
  sessionToken: string;
  staff: Pick<StaffUser, "_id" | "displayName" | "role" | "username" | "miniOpenId" | "storeId"> & {
    accessScope: "STORE_ONLY" | "ALL_STORES";
    managedStoreIds: string[];
  };
}> {
  await seedOwnerIfEmpty(repository);
  const parsed = loginInputSchema.parse(input);
  const staff = await repository.getStaffByUsername(parsed.username);

  if (!staff || !(await verifyPassword(parsed.password, staff.passwordHash)) || !staff.isEnabled) {
    throw new DomainError("INVALID_CREDENTIALS", "账号或密码错误");
  }

  if (parsed.miniOpenId && !staff.miniOpenId) {
    await ensureStaffMiniOpenIdCanBind(repository, staff, parsed.miniOpenId);
    staff.miniOpenId = parsed.miniOpenId;
    staff.updatedAt = nowIso();
    await repository.saveStaffUser(staff);
  } else if (parsed.miniOpenId) {
    await ensureStaffMiniOpenIdCanBind(repository, staff, parsed.miniOpenId);
  }

  const { accessScope, managedStoreIds } = resolveStaffAccess(staff);
  const sessionToken = issueSessionToken({
    staffUserId: staff._id,
    username: staff.username,
    role: staff.role,
    storeId: staff.storeId,
    accessScope,
    managedStoreIds
  });

  return {
    ok: true,
    sessionToken,
    staff: {
      _id: staff._id,
      displayName: staff.displayName,
      role: staff.role,
      username: staff.username,
      miniOpenId: staff.miniOpenId,
      storeId: staff.storeId,
      accessScope,
      managedStoreIds
    }
  };
}

export async function getStaffProfile(repository: RestaurantRepository, input: unknown) {
  const parsed = sessionTokenInputSchema.parse(input);
  const { staff, accessScope, accessibleStoreIds } = await requireActiveStaffSession(repository, parsed.sessionToken);
  return {
    ok: true,
    staff: {
      _id: staff._id,
      displayName: staff.displayName,
      role: staff.role,
      username: staff.username,
      miniOpenId: staff.miniOpenId,
      storeId: staff.storeId,
      accessScope,
      managedStoreIds: accessibleStoreIds
    }
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

export async function searchMembersForStaff(repository: RestaurantRepository, input: unknown) {
  const parsed = staffMemberLookupInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER" && staff.role !== "STAFF") {
    throw new DomainError("FORBIDDEN", "当前账号没有会员查询权限");
  }

  const now = nowIso();
  const members = (await repository.searchMembers(parsed.query)).sort(compareMembers).slice(0, parsed.limit);
  const memberIds = members.map((member) => member._id);

  if (memberIds.length === 0) {
    return {
      ok: true,
      rows: []
    };
  }

  const [relations, visits, rawVouchers] = await Promise.all([
    repository.listInviteRelationsByInviteeIds(memberIds),
    repository.listVisitsByMemberIds(memberIds),
    repository.listVouchersByMemberIds(memberIds)
  ]);
  const vouchers = await syncExpiredVoucherStatuses(repository, rawVouchers, now);

  const relationStatusByInviteeId = new Map(relations.map((relation) => [relation.inviteeMemberId, relation.status]));
  const visitGroups = visits.reduce<Record<string, typeof visits>>((groups, visit) => {
    (groups[visit.memberId] ??= []).push(visit);
    return groups;
  }, {});
  const voucherGroups = vouchers.reduce<Record<string, typeof vouchers>>((groups, voucher) => {
    (groups[voucher.memberId] ??= []).push(voucher);
    return groups;
  }, {});

  const rows: StaffMemberLookupRow[] = members.map((member) => {
    const memberVisits = (visitGroups[member._id] ?? []).slice().sort((left, right) => right.verifiedAt.localeCompare(left.verifiedAt));
    const memberVouchers = voucherGroups[member._id] ?? [];
    return {
      member: {
        _id: member._id,
        memberCode: member.memberCode,
        phone: member.phone,
        phoneVerifiedAt: member.phoneVerifiedAt,
        nickname: member.nickname,
        pointsBalance: member.pointsBalance,
        hasCompletedFirstVisit: member.hasCompletedFirstVisit,
        firstVisitAt: member.firstVisitAt
      },
      relationStatus: relationStatusByInviteeId.get(member._id) ?? null,
      latestVisitAt: memberVisits[0]?.verifiedAt,
      readyVoucherCount: memberVouchers.filter((voucher) => voucher.status === "READY").length,
      totalVoucherCount: memberVouchers.length,
      totalVisitCount: memberVisits.length
    };
  });

  return {
    ok: true,
    rows
  };
}

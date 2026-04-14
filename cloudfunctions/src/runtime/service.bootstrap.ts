import { bootstrapStoreOwnerInputSchema, DomainError, type AuditLog, type StaffUser } from "@restaurant/shared";
import { hashPassword } from "./auth";
import { createId } from "./ids";
import { RestaurantRepository } from "./repository";

function nowIso(): string {
  return new Date().toISOString();
}

function getBootstrapSecret(): string {
  const secret = process.env.BOOTSTRAP_SECRET?.trim();
  if (!secret) {
    throw new DomainError("SYSTEM_NOT_READY", "缺少 BOOTSTRAP_SECRET，请先补齐云函数环境变量");
  }

  return secret;
}

function normalizeManagedStoreIds(storeId: string, managedStoreIds: string[]): string[] {
  return Array.from(new Set([storeId, ...managedStoreIds.map((item) => item.trim()).filter(Boolean)]));
}

async function writeAudit(
  repository: RestaurantRepository,
  payload: Omit<AuditLog, "_id" | "createdAt" | "updatedAt" | "storeId">
) {
  const now = nowIso();
  await repository.addAuditLog({
    _id: createId("audit"),
    storeId: repository.storeId,
    createdAt: now,
    updatedAt: now,
    ...payload
  });
}

export async function bootstrapStoreOwner(repository: RestaurantRepository, input: unknown) {
  const parsed = bootstrapStoreOwnerInputSchema.parse(input);
  if (parsed.secret !== getBootstrapSecret()) {
    throw new DomainError("FORBIDDEN", "门店初始化口令无效");
  }

  const existing = await repository.getStaffByUsername(parsed.ownerUsername);
  if (existing && existing.role !== "OWNER") {
    throw new DomainError("STAFF_USERNAME_EXISTS", "该账号已存在且不是老板账号，请更换用户名");
  }

  const now = nowIso();
  const managedStoreIds = normalizeManagedStoreIds(repository.storeId, parsed.managedStoreIds);
  const displayName = parsed.ownerDisplayName?.trim() || (parsed.accessScope === "ALL_STORES" ? "总店老板" : "门店老板");

  const owner: StaffUser = existing
    ? {
        ...existing,
        displayName,
        passwordHash: await hashPassword(parsed.ownerPassword),
        role: "OWNER",
        isEnabled: true,
        accessScope: parsed.accessScope,
        managedStoreIds,
        updatedAt: now
      }
    : {
        _id: createId("staff"),
        storeId: repository.storeId,
        username: parsed.ownerUsername,
        passwordHash: await hashPassword(parsed.ownerPassword),
        displayName,
        role: "OWNER",
        isEnabled: true,
        accessScope: parsed.accessScope,
        managedStoreIds,
        createdAt: now,
        updatedAt: now
      };

  await repository.saveStaffUser(owner);
  await writeAudit(repository, {
    actorId: "bootstrap-script",
    actorType: "SYSTEM",
    action: existing ? "UPSERT_STORE_OWNER" : "CREATE_STORE_OWNER",
    targetCollection: "staff_users",
    targetId: owner._id,
    summary: `${repository.storeId} 已初始化老板账号 ${owner.username}`,
    payload: {
      accessScope: owner.accessScope,
      managedStoreIds: owner.managedStoreIds
    }
  });

  return {
    ok: true,
    created: !existing,
    owner: {
      _id: owner._id,
      storeId: owner.storeId,
      username: owner.username,
      displayName: owner.displayName,
      role: owner.role,
      isEnabled: owner.isEnabled,
      accessScope: owner.accessScope,
      managedStoreIds: owner.managedStoreIds
    }
  };
}

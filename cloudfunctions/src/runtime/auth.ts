import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { DomainError, type AccessScope, type AuthSessionClaims, type Role } from "@restaurant/shared";

const SESSION_EXPIRY = "8h";
const SUPPORTED_ROLES: Role[] = ["OWNER", "STAFF"];

function normalizeManagedStoreIds(storeId: string, managedStoreIds?: string[]): string[] {
  return Array.from(new Set([storeId, ...(managedStoreIds ?? [])].map((item) => item.trim()).filter(Boolean)));
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new DomainError("SYSTEM_NOT_READY", "系统安全配置缺失，请联系管理员完成部署");
  }

  return secret;
}

export async function hashPassword(rawPassword: string): Promise<string> {
  return hash(rawPassword, 10);
}

export async function verifyPassword(rawPassword: string, passwordHash: string): Promise<boolean> {
  return compare(rawPassword, passwordHash);
}

function normalizeSessionClaims(claims: {
  staffUserId: string;
  username: string;
  role: Role;
  storeId: string;
  accessScope?: AccessScope;
  managedStoreIds?: string[];
}): AuthSessionClaims {
  const staffUserId = typeof claims.staffUserId === "string" ? claims.staffUserId.trim() : "";
  const username = typeof claims.username === "string" ? claims.username.trim() : "";
  const storeId = typeof claims.storeId === "string" ? claims.storeId.trim() : "";

  if (!staffUserId || !username || !storeId || !SUPPORTED_ROLES.includes(claims.role)) {
    throw new DomainError("UNAUTHORIZED", "登录已失效，请重新登录");
  }

  const normalizedAccessScope: AccessScope =
    claims.role === "OWNER" && claims.accessScope === "ALL_STORES" ? "ALL_STORES" : "STORE_ONLY";
  const normalizedManagedStoreIds =
    normalizedAccessScope === "ALL_STORES" ? normalizeManagedStoreIds(storeId, claims.managedStoreIds) : [storeId];

  return {
    staffUserId,
    username,
    role: claims.role,
    storeId,
    accessScope: normalizedAccessScope,
    managedStoreIds: normalizedManagedStoreIds
  };
}

export function issueSessionToken(claims: {
  staffUserId: string;
  username: string;
  role: Role;
  storeId: string;
  accessScope?: AccessScope;
  managedStoreIds?: string[];
}): string {
  const normalizedClaims = normalizeSessionClaims(claims);

  return jwt.sign(
    normalizedClaims,
    getSessionSecret(),
    {
      algorithm: "HS256",
      expiresIn: SESSION_EXPIRY
    }
  );
}

export function requireSessionToken(token: string): AuthSessionClaims {
  try {
    return normalizeSessionClaims(jwt.verify(token, getSessionSecret()) as AuthSessionClaims);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    throw new DomainError("UNAUTHORIZED", "登录已过期，请重新登录", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

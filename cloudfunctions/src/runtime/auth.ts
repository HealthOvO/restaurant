import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { DomainError, type AccessScope, type AuthSessionClaims, type Role } from "@restaurant/shared";

const SESSION_EXPIRY = "8h";

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

export function issueSessionToken(claims: {
  staffUserId: string;
  username: string;
  role: Role;
  storeId: string;
  accessScope?: AccessScope;
  managedStoreIds?: string[];
}): string {
  const normalizedManagedStoreIds = Array.from(
    new Set([claims.storeId, ...(claims.managedStoreIds ?? [])].map((item) => item.trim()).filter(Boolean))
  );
  const normalizedAccessScope: AccessScope =
    claims.role === "OWNER" && claims.accessScope === "ALL_STORES" ? "ALL_STORES" : "STORE_ONLY";

  return jwt.sign(
    {
      ...claims,
      accessScope: normalizedAccessScope,
      managedStoreIds: normalizedManagedStoreIds
    },
    getSessionSecret(),
    {
      algorithm: "HS256",
      expiresIn: SESSION_EXPIRY
    }
  );
}

export function requireSessionToken(token: string): AuthSessionClaims {
  try {
    return jwt.verify(token, getSessionSecret()) as AuthSessionClaims;
  } catch (error) {
    throw new DomainError("UNAUTHORIZED", "登录已过期，请重新登录", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

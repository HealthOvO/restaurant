import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { DomainError, v2OwnerLoginSchema, type V2OwnerSession } from "@restaurant/shared";
import type { V2Repository } from "./repository";

const SESSION_SECONDS = 8 * 60 * 60;

interface OwnerClaims {
  ownerId: string;
  storeId: string;
  sessionVersion: number;
}

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) {
    throw new DomainError("SYSTEM_NOT_READY", "后台安全配置尚未完成");
  }
  return value;
}

export async function hashV2OwnerPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function loginV2Owner(repository: V2Repository, rawInput: unknown, now = new Date()): Promise<V2OwnerSession> {
  const input = v2OwnerLoginSchema.parse(rawInput);
  const owner = await repository.getOwnerByUsername(input.username);
  if (!owner || !owner.enabled || !(await compare(input.password, owner.passwordHash))) {
    throw new DomainError("INVALID_CREDENTIALS", "账号或密码错误");
  }
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  const token = jwt.sign(
    { ownerId: owner._id, storeId: repository.storeId, sessionVersion: owner.sessionVersion } satisfies OwnerClaims,
    sessionSecret(),
    { algorithm: "HS256", expiresIn: SESSION_SECONDS }
  );
  await repository.saveOwner({ ...owner, lastLoginAt: now.toISOString(), updatedAt: now.toISOString() });
  return { token, owner: { _id: owner._id, username: owner.username, displayName: owner.displayName }, expiresAt };
}

export async function requireV2Owner(repository: V2Repository, token: string) {
  let claims: OwnerClaims;
  try {
    claims = jwt.verify(token, sessionSecret(), { algorithms: ["HS256"] }) as OwnerClaims;
  } catch {
    throw new DomainError("UNAUTHORIZED", "登录已过期，请重新登录");
  }
  if (!claims.ownerId || claims.storeId !== repository.storeId || !Number.isInteger(claims.sessionVersion)) {
    throw new DomainError("UNAUTHORIZED", "登录状态无效，请重新登录");
  }
  const owner = await repository.getOwnerById(claims.ownerId);
  if (!owner || !owner.enabled || owner.sessionVersion !== claims.sessionVersion) {
    throw new DomainError("UNAUTHORIZED", "登录已失效，请重新登录");
  }
  return owner;
}

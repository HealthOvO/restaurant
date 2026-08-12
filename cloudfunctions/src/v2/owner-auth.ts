import { compare, getRounds, hash } from "bcryptjs";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { DomainError, v2OwnerLoginSchema, type V2OwnerSession } from "@restaurant/shared";
import type { V2Repository } from "./repository";

const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_LOCK_MS = 15 * 60_000;
const MAX_LOGIN_ATTEMPTS = 5;
const PASSWORD_HASH_ROUNDS = 10;
const DUMMY_PASSWORD_HASH = "$2b$10$Mfk6zjhoDHCrqzbwOwkLWOW0XI0513tPQvRRLUDzWLrUJo3IgTWPG";
const UNKNOWN_OWNER_BUCKET = "__unknown_owner__";

interface OwnerClaims {
  ownerId: string;
  storeId: string;
  sessionVersion: number;
}

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || Buffer.byteLength(value) < 32) {
    throw new DomainError("SYSTEM_NOT_READY", "后台安全配置尚未完成");
  }
  return value;
}

function loginAttemptId(repository: V2Repository, username: string): string {
  const usernameKey = createHash("sha256").update(username.trim().toLowerCase()).digest("hex");
  return `${repository.storeId}:owner-login:${usernameKey}`;
}

interface LoginAttemptReservation {
  locked: boolean;
  allowed: boolean;
  generation?: number;
}

async function reserveLoginAttempt(repository: V2Repository, username: string, now: Date): Promise<LoginAttemptReservation> {
  const id = loginAttemptId(repository, username);
  const nowIso = now.toISOString();
  return repository.runTransaction(async (tx) => {
    const existing = await tx.getOwnerLoginAttempt(id);
    if (existing?.lockedUntil && existing.lockedUntil > nowIso) {
      return { locked: true, allowed: false };
    }
    const windowActive = Boolean(existing && now.getTime() - new Date(existing.windowStartedAt).getTime() < LOGIN_WINDOW_MS);
    const attemptCount = windowActive ? existing!.attemptCount + 1 : 1;
    const windowStartedAt = windowActive ? existing!.windowStartedAt : nowIso;
    const generation = (existing?.reservationGeneration ?? 0) + 1;
    const lockedUntil = attemptCount >= MAX_LOGIN_ATTEMPTS
      ? new Date(now.getTime() + LOGIN_LOCK_MS).toISOString()
      : undefined;
    await tx.saveOwnerLoginAttempt({
      _id: id,
      storeId: repository.storeId,
      usernameKey: id.slice(id.lastIndexOf(":") + 1),
      reservationGeneration: generation,
      attemptCount,
      windowStartedAt,
      lastAttemptAt: nowIso,
      lockedUntil,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso
    });
    // The attempt that fills the bucket is allowed to verify its password. Reserving
    // the lock now makes every concurrent attempt after it stop before bcrypt.
    return { locked: Boolean(lockedUntil), allowed: true, generation };
  });
}

export async function clearV2OwnerLoginAttempts(
  repository: V2Repository,
  username: string,
  now = new Date(),
  expectedGeneration?: number
): Promise<void> {
  const id = loginAttemptId(repository, username);
  const nowIso = now.toISOString();
  await repository.runTransaction(async (tx) => {
    const existing = await tx.getOwnerLoginAttempt(id);
    if (!existing) return;
    if (expectedGeneration !== undefined && existing.reservationGeneration !== expectedGeneration) return;
    await tx.saveOwnerLoginAttempt({
      ...existing,
      attemptCount: 0,
      windowStartedAt: nowIso,
      lastAttemptAt: nowIso,
      lockedUntil: undefined,
      updatedAt: nowIso
    });
  });
}

export async function hashV2OwnerPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_HASH_ROUNDS);
}

export async function loginV2Owner(repository: V2Repository, rawInput: unknown, now = new Date()): Promise<V2OwnerSession> {
  const input = v2OwnerLoginSchema.parse(rawInput);
  const owner = await repository.getOwnerByUsername(input.username);
  const attemptUsername = owner ? input.username : UNKNOWN_OWNER_BUCKET;
  const reservation = await reserveLoginAttempt(repository, attemptUsername, now);
  if (!reservation.allowed) throw new DomainError("LOGIN_RATE_LIMITED", "登录尝试较多，请稍后再试");
  const passwordMatches = await compare(input.password, owner?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!owner || !owner.enabled || !passwordMatches) {
    // Unknown usernames share one bucket, so arbitrary input cannot create an unbounded
    // number of documents.
    if (reservation.locked) throw new DomainError("LOGIN_RATE_LIMITED", "登录尝试较多，请稍后再试");
    throw new DomainError("INVALID_CREDENTIALS", "账号或密码错误");
  }
  const passwordHash = getRounds(owner.passwordHash) === PASSWORD_HASH_ROUNDS
    ? owner.passwordHash
    : await hashV2OwnerPassword(input.password);
  const attemptId = loginAttemptId(repository, input.username);
  const nowIso = now.toISOString();
  const authenticatedOwner = await repository.runTransaction(async (tx) => {
    const currentOwner = await tx.getOwner(owner._id);
    if (
      !currentOwner
      || !currentOwner.enabled
      || currentOwner.username !== owner.username
      || currentOwner.passwordHash !== owner.passwordHash
      || currentOwner.sessionVersion !== owner.sessionVersion
    ) {
      throw new DomainError("LOGIN_STATE_CHANGED", "账号信息刚刚更新，请重新登录");
    }
    const attempt = await tx.getOwnerLoginAttempt(attemptId);
    if (attempt && (reservation.generation === undefined || attempt.reservationGeneration === reservation.generation)) {
      await tx.saveOwnerLoginAttempt({
        ...attempt,
        attemptCount: 0,
        windowStartedAt: nowIso,
        lastAttemptAt: nowIso,
        lockedUntil: undefined,
        updatedAt: nowIso
      });
    }
    const updatedOwner = { ...currentOwner, passwordHash, lastLoginAt: nowIso, updatedAt: nowIso };
    await tx.saveOwner(updatedOwner);
    return updatedOwner;
  });
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  const token = jwt.sign(
    { ownerId: authenticatedOwner._id, storeId: repository.storeId, sessionVersion: authenticatedOwner.sessionVersion } satisfies OwnerClaims,
    sessionSecret(),
    { algorithm: "HS256", expiresIn: SESSION_SECONDS }
  );
  return {
    token,
    owner: { _id: authenticatedOwner._id, username: authenticatedOwner.username, displayName: authenticatedOwner.displayName },
    expiresAt
  };
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

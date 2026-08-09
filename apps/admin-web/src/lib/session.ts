import type { V2OwnerSession } from "@restaurant/shared";

const SESSION_KEY = "fuding-owner-session-v2";

export function loadOwnerSession(): V2OwnerSession | null {
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as V2OwnerSession;
    if (!session.token || !session.expiresAt || session.expiresAt <= new Date().toISOString()) {
      clearOwnerSession();
      return null;
    }
    return session;
  } catch {
    clearOwnerSession();
    return null;
  }
}

export function saveOwnerSession(session: V2OwnerSession): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearOwnerSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY);
}

import type { AccessScope, Role } from "@restaurant/shared";

export interface SessionStaff {
  _id: string;
  displayName: string;
  role: Role;
  username: string;
  miniOpenId?: string;
  storeId?: string;
  accessScope?: AccessScope;
  managedStoreIds?: string[];
}

export interface AdminSession {
  sessionToken: string;
  staff: SessionStaff;
}

const STORAGE_KEY = "restaurant-admin-session";

export function loadSession(): AdminSession | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AdminSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

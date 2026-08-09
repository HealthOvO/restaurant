import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { V2OwnerSession } from "@restaurant/shared";
import { createMerchantApi, MerchantApiError, type MerchantApi } from "../lib/api";
import { clearOwnerSession, loadOwnerSession, saveOwnerSession } from "../lib/session";
import { ToastViewport, type ToastMessage } from "../components/Toast";

interface MerchantContextValue {
  ready: boolean;
  api: MerchantApi | null;
  session: V2OwnerSession | null;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  notify(message: string, tone?: ToastMessage["tone"]): void;
  isMockMode: boolean;
}

const MerchantContext = createContext<MerchantContextValue | null>(null);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<MerchantApi | null>(null);
  const [session, setSession] = useState<V2OwnerSession | null>(() => loadOwnerSession());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    let active = true;
    createMerchantApi()
      .then(async (createdApi) => {
        if (!active) return;
        setApi(createdApi);
        if (session) {
          try {
            await createdApi.profile(session.token);
          } catch (error) {
            if (error instanceof MerchantApiError && error.code === "UNAUTHORIZED") {
              clearOwnerSession();
              setSession(null);
            }
          }
        }
      })
      .finally(() => active && setReady(true));
    return () => { active = false; };
  }, []);

  const notify = useCallback((message: string, tone: ToastMessage["tone"] = "neutral") => {
    const toast = { id: crypto.randomUUID(), message, tone };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3600);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (!api) throw new MerchantApiError("后台服务正在初始化");
    const next = await api.login(username, password);
    saveOwnerSession(next);
    setSession(next);
  }, [api]);

  const logout = useCallback(() => {
    clearOwnerSession();
    setSession(null);
  }, []);

  const value = useMemo<MerchantContextValue>(() => ({
    ready, api, session, login, logout, notify,
    isMockMode: import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock"
  }), [ready, api, session, login, logout, notify]);

  return (
    <MerchantContext.Provider value={value}>
      {children}
      <ToastViewport messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
    </MerchantContext.Provider>
  );
}

export function useMerchant() {
  const context = useContext(MerchantContext);
  if (!context) throw new Error("useMerchant must be used inside MerchantProvider");
  return context;
}

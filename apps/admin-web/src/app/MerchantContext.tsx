import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { V2Order, V2OwnerSession } from "@restaurant/shared";
import { createMerchantApi, MerchantApiError, type MerchantApi } from "../lib/api";
import { playNewOrderAlert } from "../lib/new-order-alert";
import { loadNewOrderSoundEnabled, saveNewOrderSoundEnabled } from "../lib/preferences";
import { clearOwnerSession, loadOwnerSession, saveOwnerSession } from "../lib/session";
import { clearResourceCache, writeResourceCache } from "../lib/resource-cache";
import { ToastViewport, type ToastMessage } from "../components/Toast";

export interface NewOrderNotice {
  count: number;
  pickupNumbers: string[];
}

interface MerchantContextValue {
  ready: boolean;
  api: MerchantApi | null;
  session: V2OwnerSession | null;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  notify(message: string, tone?: ToastMessage["tone"]): void;
  isMockMode: boolean;
  newOrderSoundEnabled: boolean;
  setNewOrderSoundEnabled(enabled: boolean): void;
  newOrderNotice: NewOrderNotice | null;
  dismissNewOrderNotice(): void;
}

const MerchantContext = createContext<MerchantContextValue | null>(null);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<MerchantApi | null>(null);
  const [session, setSession] = useState<V2OwnerSession | null>(() => loadOwnerSession());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [newOrderSoundEnabled, setNewOrderSoundEnabledState] = useState(loadNewOrderSoundEnabled);
  const [newOrderNotice, setNewOrderNotice] = useState<NewOrderNotice | null>(null);
  const seenWaitingIds = useRef<Set<string>>(new Set());
  const waitingBaselineReady = useRef(false);

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
              clearResourceCache();
              setSession(null);
            }
          }
        }
      })
      .finally(() => active && setReady(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!api || !session) return;
    let active = true;
    let running = false;

    const syncWaitingOrders = async () => {
      if (running) return;
      running = true;
      try {
        const rows = (await api.listOrders(session.token, "WAITING_FULFILLMENT"))
          .slice()
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.orderNo.localeCompare(right.orderNo));
        if (!active) return;
        writeResourceCache("orders:WAITING_FULFILLMENT", rows);
        const nextIds = new Set(rows.map((order) => order._id));
        const added = waitingBaselineReady.current ? rows.filter((order) => !seenWaitingIds.current.has(order._id)) : [];
        seenWaitingIds.current = nextIds;
        waitingBaselineReady.current = true;
        if (added.length) {
          setNewOrderNotice({ count: added.length, pickupNumbers: added.map((order) => order.pickupNumber).filter((value): value is string => Boolean(value)) });
          if (newOrderSoundEnabled) playNewOrderAlert();
        }
        window.dispatchEvent(new CustomEvent<{ orders: V2Order[]; syncedAt: number }>("xiongfei:waiting-orders", {
          detail: { orders: rows, syncedAt: Date.now() }
        }));
      } catch {
        // The order page keeps its own visible retry state; the global monitor retries automatically.
      } finally {
        running = false;
      }
    };

    void syncWaitingOrders();
    const timer = window.setInterval(() => void syncWaitingOrders(), 5000);
    const onVisible = () => document.visibilityState === "visible" && void syncWaitingOrders();
    const onOnline = () => void syncWaitingOrders();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [api, session, newOrderSoundEnabled]);

  useEffect(() => {
    document.title = newOrderNotice ? `(${newOrderNotice.count} 笔新单) 雄飞肉片 · 商家后台` : "雄飞肉片 · 商家后台";
    return () => { document.title = "雄飞肉片 · 商家后台"; };
  }, [newOrderNotice]);

  const notify = useCallback((message: string, tone: ToastMessage["tone"] = "neutral") => {
    const toast = { id: crypto.randomUUID(), message, tone };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3600);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (!api) throw new MerchantApiError("后台还没准备好，请稍等一下");
    const next = await api.login(username, password);
    clearResourceCache();
    saveOwnerSession(next);
    setSession(next);
  }, [api]);

  const logout = useCallback(() => {
    clearOwnerSession();
    clearResourceCache();
    setSession(null);
    seenWaitingIds.current = new Set();
    waitingBaselineReady.current = false;
    setNewOrderNotice(null);
  }, []);

  const setNewOrderSoundEnabled = useCallback((enabled: boolean) => {
    setNewOrderSoundEnabledState(enabled);
    saveNewOrderSoundEnabled(enabled);
    if (enabled) playNewOrderAlert();
  }, []);

  const dismissNewOrderNotice = useCallback(() => setNewOrderNotice(null), []);

  const value = useMemo<MerchantContextValue>(() => ({
    ready, api, session, login, logout, notify,
    newOrderSoundEnabled, setNewOrderSoundEnabled, newOrderNotice, dismissNewOrderNotice,
    isMockMode: import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock"
  }), [ready, api, session, login, logout, notify, newOrderSoundEnabled, setNewOrderSoundEnabled, newOrderNotice, dismissNewOrderNotice]);

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

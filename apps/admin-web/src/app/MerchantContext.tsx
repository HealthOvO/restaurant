import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { V2Order, V2OwnerSession } from "@restaurant/shared";
import { createMerchantApi, MerchantApiError, type MerchantApi } from "../lib/api";
import { playNewOrderAlert } from "../lib/new-order-alert";
import { loadNewOrderSoundEnabled, saveNewOrderSoundEnabled } from "../lib/preferences";
import { clearOwnerSession, loadOwnerSession, saveOwnerSession } from "../lib/session";
import { clearResourceCache } from "../lib/resource-cache";
import { ToastViewport, type ToastMessage } from "../components/Toast";

export interface NewOrderNotice {
  count: number;
  orderIds: string[];
  pickupNumbers: string[];
  kind: "CURRENT" | "NEW";
  hasMore?: boolean;
}

export interface OrderMonitorState {
  phase: "IDLE" | "CONNECTING" | "ONLINE" | "ERROR";
  waitingCount: number;
  hasMore?: boolean;
  lastSyncedAt?: number;
  error?: string;
}

interface MerchantContextValue {
  ready: boolean;
  api: MerchantApi | null;
  session: V2OwnerSession | null;
  sessionNotice: string;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  notify(message: string, tone?: ToastMessage["tone"]): void;
  isMockMode: boolean;
  newOrderSoundEnabled: boolean;
  setNewOrderSoundEnabled(enabled: boolean): void;
  newOrderNotice: NewOrderNotice | null;
  dismissNewOrderNotice(): void;
  orderMonitor: OrderMonitorState;
  retryOrderMonitor(): void;
}

const MerchantContext = createContext<MerchantContextValue | null>(null);

function waitingSettledAt(order: V2Order): string {
  return order.settledAt ?? order.createdAt;
}

export function MerchantProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<MerchantApi | null>(null);
  const [session, setSession] = useState<V2OwnerSession | null>(() => loadOwnerSession());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [newOrderSoundEnabled, setNewOrderSoundEnabledState] = useState(loadNewOrderSoundEnabled);
  const [newOrderNotice, setNewOrderNotice] = useState<NewOrderNotice | null>(null);
  const [sessionNotice, setSessionNotice] = useState("");
  const [orderMonitor, setOrderMonitor] = useState<OrderMonitorState>({ phase: "IDLE", waitingCount: 0 });
  const [monitorRevision, setMonitorRevision] = useState(0);
  const seenWaitingIds = useRef<Set<string>>(new Set());
  const waitingBaselineReady = useRef(false);
  const latestWaitingKey = useRef<{ settledAt: string; orderNo: string } | null>(null);
  const soundEnabledRef = useRef(newOrderSoundEnabled);
  const soundWarningShown = useRef(false);

  const notify = useCallback((message: string, tone: ToastMessage["tone"] = "neutral") => {
    const toast = { id: crypto.randomUUID(), message, tone };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3600);
  }, []);

  const expireOwnerSession = useCallback(() => {
    clearOwnerSession();
    clearResourceCache();
    setSession(null);
    setSessionNotice("登录已失效，请重新登录");
    seenWaitingIds.current = new Set();
    waitingBaselineReady.current = false;
    latestWaitingKey.current = null;
    setNewOrderNotice(null);
    setOrderMonitor({ phase: "IDLE", waitingCount: 0 });
  }, []);

  useEffect(() => {
    soundEnabledRef.current = newOrderSoundEnabled;
  }, [newOrderSoundEnabled]);

  useEffect(() => {
    let active = true;
    createMerchantApi(expireOwnerSession)
      .then(async (createdApi) => {
        if (!active) return;
        setApi(createdApi);
        if (session) {
          try {
            await createdApi.profile(session.token);
          } catch (error) {
            if (error instanceof MerchantApiError && error.code === "UNAUTHORIZED") {
              expireOwnerSession();
            }
          }
        }
      })
      .finally(() => active && setReady(true));
    return () => { active = false; };
  }, [expireOwnerSession]);

  useEffect(() => {
    if (!api || !session) return;
    let active = true;
    let running = false;
    setOrderMonitor((current) => ({ ...current, phase: "CONNECTING", error: undefined }));

    const syncWaitingOrders = async () => {
      if (running) return;
      running = true;
      try {
        const page = await api.listOrders(session.token, "WAITING_FULFILLMENT", undefined, 100, "RECENT");
        const rows = page.rows
          .slice()
          .sort((left, right) => waitingSettledAt(left).localeCompare(waitingSettledAt(right)) || left.orderNo.localeCompare(right.orderNo));
        if (!active) return;
        const hadBaseline = waitingBaselineReady.current;
        const previousLatest = latestWaitingKey.current;
        const added = hadBaseline
          ? rows.filter((order) => !seenWaitingIds.current.has(order._id) && (!previousLatest || waitingSettledAt(order) >= previousLatest.settledAt))
          : [];
        for (const order of rows) seenWaitingIds.current.add(order._id);
        while (seenWaitingIds.current.size > 500) {
          const oldestId = seenWaitingIds.current.values().next().value as string | undefined;
          if (!oldestId) break;
          seenWaitingIds.current.delete(oldestId);
        }
        const newest = rows[rows.length - 1];
        const newestSettledAt = newest ? waitingSettledAt(newest) : undefined;
        if (newest && newestSettledAt && (!previousLatest || newestSettledAt > previousLatest.settledAt || (newestSettledAt === previousLatest.settledAt && newest.orderNo > previousLatest.orderNo))) {
          latestWaitingKey.current = { settledAt: newestSettledAt, orderNo: newest.orderNo };
        }
        waitingBaselineReady.current = true;
        const syncedAt = Date.now();
        setOrderMonitor({ phase: "ONLINE", waitingCount: rows.length, hasMore: Boolean(page.nextCursor), lastSyncedAt: syncedAt });
        setNewOrderNotice((current) => {
          if (!current) return null;
          if (current.kind === "CURRENT") {
            if (!rows.length) return null;
            return {
              kind: "CURRENT",
              count: rows.length,
              hasMore: Boolean(page.nextCursor),
              orderIds: rows.map((order) => order._id),
              pickupNumbers: rows.map((order) => order.pickupNumber).filter((value): value is string => Boolean(value)).slice(0, 6)
            };
          }
          const waitingById = new Map(rows.map((order) => [order._id, order]));
          const remaining = current.orderIds.map((id) => waitingById.get(id)).filter((order): order is V2Order => Boolean(order));
          if (!remaining.length) return null;
          return {
            ...current,
            count: remaining.length,
            orderIds: remaining.map((order) => order._id),
            pickupNumbers: remaining.map((order) => order.pickupNumber).filter((value): value is string => Boolean(value)).slice(0, 6)
          };
        });
        if (!hadBaseline && rows.length) {
          setNewOrderNotice({
            kind: "CURRENT",
            count: rows.length,
            hasMore: Boolean(page.nextCursor),
            orderIds: rows.map((order) => order._id),
            pickupNumbers: rows.map((order) => order.pickupNumber).filter((value): value is string => Boolean(value)).slice(0, 6)
          });
        }
        if (added.length) {
          setNewOrderNotice({
            kind: "NEW",
            count: added.length,
            orderIds: added.map((order) => order._id),
            pickupNumbers: added.map((order) => order.pickupNumber).filter((value): value is string => Boolean(value)).slice(0, 6)
          });
          if (soundEnabledRef.current) {
            void playNewOrderAlert().then((played) => {
              if (!played && !soundWarningShown.current) {
                soundWarningShown.current = true;
                notify("浏览器没有播放提醒音，请检查标签页声音权限", "error");
              }
            });
          }
        }
        window.dispatchEvent(new CustomEvent<{ orders: V2Order[]; hasMore: boolean; syncedAt: number }>("xiongfei:waiting-orders", {
          detail: { orders: rows, hasMore: Boolean(page.nextCursor), syncedAt }
        }));
      } catch (error) {
        if (!active) return;
        setOrderMonitor((current) => ({
          ...current,
          phase: "ERROR",
          error: error instanceof MerchantApiError && error.code === "UNAUTHORIZED"
            ? "登录已失效"
            : "暂时无法同步新订单，请检查网络后重试"
        }));
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
  }, [api, session, monitorRevision, notify]);

  useEffect(() => {
    document.title = newOrderNotice ? `(${newOrderNotice.count} 笔${newOrderNotice.kind === "NEW" ? "新单" : "待出餐"}) 祯好七福鼎肉片 · 商家后台` : "祯好七福鼎肉片 · 商家后台";
    return () => { document.title = "祯好七福鼎肉片 · 商家后台"; };
  }, [newOrderNotice]);

  const login = useCallback(async (username: string, password: string) => {
    if (!api) throw new MerchantApiError("后台还没准备好，请稍等一下");
    const next = await api.login(username, password);
    clearResourceCache();
    saveOwnerSession(next);
    setSessionNotice("");
    seenWaitingIds.current = new Set();
    waitingBaselineReady.current = false;
    latestWaitingKey.current = null;
    setSession(next);
  }, [api]);

  const logout = useCallback(() => {
    clearOwnerSession();
    clearResourceCache();
    setSession(null);
    setSessionNotice("");
    seenWaitingIds.current = new Set();
    waitingBaselineReady.current = false;
    latestWaitingKey.current = null;
    setNewOrderNotice(null);
    setOrderMonitor({ phase: "IDLE", waitingCount: 0 });
  }, []);

  const setNewOrderSoundEnabled = useCallback((enabled: boolean) => {
    setNewOrderSoundEnabledState(enabled);
    saveNewOrderSoundEnabled(enabled);
    soundWarningShown.current = false;
    if (enabled) {
      void playNewOrderAlert().then((played) => {
        if (!played) {
          soundWarningShown.current = true;
          notify("浏览器没有播放声音，请检查网站声音权限", "error");
        }
      });
    }
  }, [notify]);

  const dismissNewOrderNotice = useCallback(() => setNewOrderNotice(null), []);
  const retryOrderMonitor = useCallback(() => setMonitorRevision((value) => value + 1), []);

  const value = useMemo<MerchantContextValue>(() => ({
    ready, api, session, sessionNotice, login, logout, notify,
    newOrderSoundEnabled, setNewOrderSoundEnabled, newOrderNotice, dismissNewOrderNotice,
    orderMonitor, retryOrderMonitor,
    isMockMode: import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock"
  }), [ready, api, session, sessionNotice, login, logout, notify, newOrderSoundEnabled, setNewOrderSoundEnabled, newOrderNotice, dismissNewOrderNotice, orderMonitor, retryOrderMonitor]);

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

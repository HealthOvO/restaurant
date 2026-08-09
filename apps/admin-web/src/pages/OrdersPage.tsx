import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Check, ReceiptText, RefreshCw, RotateCcw, TicketX, WifiOff } from "lucide-react";
import type { V2Order, V2OrderStatus } from "@restaurant/shared";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState, PageError, PageLoading } from "../components/PageState";
import { OrderSourceBadge, OrderStatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatMoney } from "../lib/format";

type Filter = "ALL" | Exclude<V2OrderStatus, "PENDING_PAYMENT">;
type PendingAction = { type: "complete" | "cancel" | "refund"; order: V2Order } | null;

const filters: Array<{ value: Filter; label: string }> = [
  { value: "ALL", label: "全部" },
  { value: "WAITING_FULFILLMENT", label: "待出餐" },
  { value: "COMPLETED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" },
  { value: "REFUNDING", label: "退款中" },
  { value: "REFUNDED", label: "已退款" }
];

const emptyCopy: Record<Filter, { title: string; detail: string }> = {
  ALL: { title: "还没有订单", detail: "顾客下单后会显示在这里。" },
  WAITING_FULFILLMENT: { title: "没有待出餐订单", detail: "当前订单都处理完了。" },
  COMPLETED: { title: "还没有已完成订单", detail: "完成出餐后可在这里查看。" },
  CANCELLED: { title: "没有已取消订单", detail: "取消的券订单会保留在这里。" },
  REFUNDING: { title: "没有退款中的订单", detail: "已提交的退款会显示在这里。" },
  REFUNDED: { title: "还没有退款记录", detail: "退款完成后可在这里查看。" }
};

function playNewOrderTone() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.38);
}

export function OrdersPage() {
  const { api, session, notify } = useMerchant();
  const [filter, setFilter] = useState<Filter>("WAITING_FULFILLMENT");
  const [orders, setOrders] = useState<V2Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [acting, setActing] = useState(false);
  const seenWaitingIds = useRef<Set<string>>(new Set());

  const load = useCallback(async (background = false) => {
    if (!api || !session) return;
    background ? setSyncing(true) : setLoading(true);
    try {
      const next = await api.listOrders(session.token, filter === "ALL" ? undefined : filter);
      const nextWaitingIds = new Set(next.filter((order) => order.status === "WAITING_FULFILLMENT").map((order) => order._id));
      if (soundEnabled && Array.from(nextWaitingIds).some((id) => !seenWaitingIds.current.has(id))) playNewOrderTone();
      seenWaitingIds.current = nextWaitingIds;
      setOrders(next);
      setLastSync(new Date());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "订单同步失败");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [api, session, filter, soundEnabled]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 5000);
    const visible = () => document.visibilityState === "visible" && void load(true);
    const goOnline = () => { setOnline(true); void load(true); };
    const goOffline = () => setOnline(false);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [load]);

  async function confirmAction() {
    if (!pendingAction || !api || !session) return;
    setActing(true);
    try {
      if (pendingAction.type === "complete") await api.completeOrder(session.token, pendingAction.order._id);
      if (pendingAction.type === "cancel") await api.cancelCouponOrder(session.token, pendingAction.order._id);
      if (pendingAction.type === "refund") await api.refundOrder(session.token, pendingAction.order._id);
      notify(pendingAction.type === "complete" ? "已完成出餐" : pendingAction.type === "cancel" ? "券订单已取消" : "退款已提交", "success");
      setPendingAction(null);
      await load(true);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "操作失败", "error");
    } finally {
      setActing(false);
    }
  }

  if (loading && !orders.length) return <PageLoading label="正在同步订单" />;
  if (error && !orders.length) return <PageError message={error} onRetry={() => load()} />;
  const actionTitle = pendingAction?.type === "complete" ? "完成这笔订单？" : pendingAction?.type === "cancel" ? "取消这笔券订单？" : "提交整单退款？";
  const actionDescription = pendingAction?.type === "complete"
    ? "确认顾客已经取餐后再完成。"
    : pendingAction?.type === "cancel"
      ? "商品券会退回顾客账户，取餐号保留。"
      : "将按原订单退款，并扣回相应积分。";
  const confirmLabel = pendingAction?.type === "complete" ? "完成出餐" : pendingAction?.type === "cancel" ? "确认取消" : "提交退款";

  return (
    <div className="page-stack orders-page">
      <header className="page-header">
        <div><p className="eyebrow">接单中 · 每 5 秒刷新</p><h1>订单</h1><p>按取餐号出餐，券订单会单独标明。</p></div>
        <div className="header-actions">
          <Button tone={soundEnabled ? "secondary" : "quiet"} onClick={() => { setSoundEnabled((value) => !value); if (!soundEnabled) playNewOrderTone(); }}>
            {soundEnabled ? <BellRing size={16} /> : <Bell size={16} />}{soundEnabled ? "新单声音已开启" : "打开新单声音"}
          </Button>
          <Button tone="secondary" onClick={() => load(true)} loading={syncing}><RefreshCw size={16} />刷新</Button>
        </div>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <div className="list-toolbar">
        <div className="segmented-tabs" role="tablist" aria-label="订单状态">
          {filters.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} className={filter === item.value ? "is-active" : ""} onClick={() => setFilter(item.value)}>{item.label}</button>
          ))}
        </div>
        <div className={`sync-strip ${!online ? "is-offline" : ""}`} role="status">
          {!online ? <><WifiOff size={15} /><span>网络断开，等待恢复</span></> : <><span className="live-dot" /><span>{syncing ? "同步中…" : `已更新 ${lastSync ? lastSync.toLocaleTimeString("zh-CN", { hour12: false }) : "—"}`}</span></>}
        </div>
        <span className="list-count">{orders.length} 单</span>
      </div>

      <section className="order-list" aria-label="订单列表">
        {orders.map((order) => (
          <article className="order-card" key={order._id}>
            <div className="order-pickup">
              <span>取餐号</span>
              <strong>{order.pickupNumber ?? "—"}</strong>
            </div>
            <div className="order-content">
              <header className="order-card-header">
                <div className="badge-row"><OrderSourceBadge source={order.source} /><OrderStatusBadge status={order.status} /></div>
                <time>{formatDateTime(order.createdAt)}</time>
              </header>
              <div className="order-lines">
                {order.lineItems.map((line) => (
                  <div className="order-line" key={line.lineId}>
                    <div><strong>{line.productName}</strong><span>{line.selectedChoices.map((choice) => choice.choiceName).join(" · ") || "标准规格"}</span></div>
                    <b>× {line.quantity}</b>
                  </div>
                ))}
              </div>
              <footer className="order-card-footer">
                <div className="order-total">
                  {order.source === "WECHAT_PAY" ? <><span>实付</span><strong>{formatMoney(order.paidAmount)}</strong></> : <><span>{order.couponName}</span><strong>{order.couponPointsCost} 积分兑换</strong></>}
                </div>
                <div className="order-actions">
                  {order.status === "WAITING_FULFILLMENT" && <Button onClick={() => setPendingAction({ type: "complete", order })}><Check size={16} />完成出餐</Button>}
                  {order.status === "WAITING_FULFILLMENT" && order.source === "COUPON" && <Button tone="quiet" onClick={() => setPendingAction({ type: "cancel", order })}><TicketX size={16} />取消</Button>}
                  {["WAITING_FULFILLMENT", "COMPLETED"].includes(order.status) && order.source === "WECHAT_PAY" && <Button tone="quiet" onClick={() => setPendingAction({ type: "refund", order })}><RotateCcw size={16} />整单退款</Button>}
                </div>
              </footer>
            </div>
          </article>
        ))}
        {!orders.length && <EmptyState title={emptyCopy[filter].title} detail={emptyCopy[filter].detail} icon={<ReceiptText size={26} />} />}
      </section>

      <Dialog open={Boolean(pendingAction)} title={actionTitle} description={actionDescription} onClose={() => !acting && setPendingAction(null)} width="small">
        {pendingAction && <div className="confirm-order-summary"><span>取餐号 {pendingAction.order.pickupNumber}</span><strong>{pendingAction.order.lineItems.map((item) => `${item.productName} × ${item.quantity}`).join("、")}</strong></div>}
        <div className="dialog-actions">
          <Button tone="secondary" onClick={() => setPendingAction(null)} disabled={acting}>先不处理</Button>
          <Button tone={pendingAction?.type === "complete" ? "primary" : "danger"} onClick={confirmAction} loading={acting}>{confirmLabel}</Button>
        </div>
      </Dialog>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, Bell, BellRing, Check, ReceiptText, RefreshCw, RotateCcw, TicketX, WifiOff } from "lucide-react";
import type { V2Order, V2OrderStatus } from "@restaurant/shared";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/PageState";
import { OrderSourceBadge, OrderStatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatMoney } from "../lib/format";
import { invalidateResourceCache } from "../lib/resource-cache";
import { orderPageCacheKey, readOrderPageCache, writeOrderPageCache } from "../lib/order-page-cache";

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

const PAGE_SIZE = 50;

const emptyCopy: Record<Filter, { title: string; detail: string }> = {
  ALL: { title: "还没有订单", detail: "顾客下单后会显示在这里。" },
  WAITING_FULFILLMENT: { title: "没有待出餐订单", detail: "当前订单都处理完了。" },
  COMPLETED: { title: "还没有已完成订单", detail: "完成出餐后可在这里查看。" },
  CANCELLED: { title: "没有已取消订单", detail: "取消的券订单会保留在这里。" },
  REFUNDING: { title: "没有退款中的订单", detail: "已提交的退款会显示在这里。" },
  REFUNDED: { title: "还没有退款记录", detail: "退款完成后可在这里查看。" }
};

export function sortOrdersForFilter(rows: V2Order[], filter: Filter): V2Order[] {
  return rows.slice().sort((left, right) => {
    const byTime = left.createdAt.localeCompare(right.createdAt);
    const direction = filter === "WAITING_FULFILLMENT" ? 1 : -1;
    if (byTime !== 0) return byTime * direction;
    return left.orderNo.localeCompare(right.orderNo) * direction;
  });
}

function OrderListSkeleton() {
  return (
    <div className="order-list-skeleton" role="status" aria-label="正在同步订单">
      {[0, 1].map((item) => (
        <div className="order-skeleton-card" key={item} aria-hidden="true">
          <span className="skeleton-block skeleton-pickup" />
          <div><span className="skeleton-block skeleton-short" /><span className="skeleton-block skeleton-long" /><span className="skeleton-block skeleton-medium" /></div>
        </div>
      ))}
    </div>
  );
}

export function OrdersPage() {
  const { api, session, notify, newOrderSoundEnabled, setNewOrderSoundEnabled, orderMonitor, retryOrderMonitor } = useMerchant();
  const [filter, setFilter] = useState<Filter>("WAITING_FULFILLMENT");
  const [orders, setOrders] = useState<V2Order[]>(() => readOrderPageCache("WAITING_FULFILLMENT")?.rows ?? []);
  const [nextCursor, setNextCursor] = useState<string | undefined>(() => readOrderPageCache("WAITING_FULFILLMENT")?.nextCursor);
  const [loading, setLoading] = useState(() => readOrderPageCache("WAITING_FULFILLMENT") === undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [acting, setActing] = useState(false);
  const requestSequence = useRef(0);
  const monitorRefreshInFlight = useRef(false);
  const ordersRef = useRef(orders);
  const nextCursorRef = useRef(nextCursor);

  const commitPage = useCallback((rows: V2Order[], cursor: string | undefined, requestedFilter: Filter) => {
    const sorted = sortOrdersForFilter(rows, requestedFilter);
    ordersRef.current = sorted;
    nextCursorRef.current = cursor;
    setOrders(sorted);
    setNextCursor(cursor);
    writeOrderPageCache(requestedFilter, { rows: sorted, nextCursor: cursor });
  }, []);

  const load = useCallback(async (background = false, append = false) => {
    if (!api || !session) return;
    const requestedFilter = filter;
    const cursor = append ? nextCursorRef.current : undefined;
    if (append && !cursor) return;
    const requestId = ++requestSequence.current;
    if (append) setLoadingMore(true);
    else if (background || readOrderPageCache(requestedFilter) !== undefined) setSyncing(true);
    else setLoading(true);
    try {
      const page = await api.listOrders(session.token, requestedFilter === "ALL" ? undefined : requestedFilter, cursor, PAGE_SIZE);
      if (requestId !== requestSequence.current) return;
      const merged = append
        ? [...ordersRef.current, ...page.rows.filter((row) => !ordersRef.current.some((current) => current._id === row._id))]
        : page.rows;
      commitPage(merged, page.nextCursor, requestedFilter);
      setLastSync(new Date());
      setError("");
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      setError(caught instanceof Error ? caught.message : "订单同步失败");
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
        setSyncing(false);
      }
    }
  }, [api, session, filter, commitPage]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onWaitingOrders = (event: Event) => {
      const detail = (event as CustomEvent<{ orders: V2Order[]; hasMore: boolean; syncedAt: number }>).detail;
      setLastSync(new Date(detail.syncedAt));
      setOnline(true);
      if (filter === "WAITING_FULFILLMENT") {
        if (detail.hasMore) {
          if (!monitorRefreshInFlight.current) {
            monitorRefreshInFlight.current = true;
            void load(true).finally(() => { monitorRefreshInFlight.current = false; });
          }
          return;
        }
        requestSequence.current += 1;
        commitPage(detail.orders, undefined, filter);
        setLoading(false);
        setLoadingMore(false);
        setSyncing(false);
        setError("");
      }
    };
    window.addEventListener("xiongfei:waiting-orders", onWaitingOrders);
    return () => window.removeEventListener("xiongfei:waiting-orders", onWaitingOrders);
  }, [filter, commitPage, load]);

  useEffect(() => {
    const visible = () => document.visibilityState === "visible" && filter !== "WAITING_FULFILLMENT" && void load(true);
    const goOnline = () => { setOnline(true); filter === "WAITING_FULFILLMENT" ? retryOrderMonitor() : void load(true); };
    const goOffline = () => setOnline(false);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [load, filter, retryOrderMonitor]);

  function toggleSound() {
    setNewOrderSoundEnabled(!newOrderSoundEnabled);
  }

  function selectFilter(next: Filter) {
    requestSequence.current += 1;
    const cached = readOrderPageCache(next);
    setFilter(next);
    ordersRef.current = cached?.rows ?? [];
    nextCursorRef.current = cached?.nextCursor;
    setOrders(cached?.rows ?? []);
    setNextCursor(cached?.nextCursor);
    setLoading(cached === undefined);
    setLoadingMore(false);
    setSyncing(false);
    setError("");
  }

  async function confirmAction() {
    if (!pendingAction || !api || !session) return;
    setActing(true);
    try {
      if (pendingAction.type === "complete") await api.completeOrder(session.token, pendingAction.order._id);
      if (pendingAction.type === "cancel") await api.cancelCouponOrder(session.token, pendingAction.order._id);
      if (pendingAction.type === "refund") await api.refundOrder(session.token, pendingAction.order._id);
      notify(pendingAction.type === "complete" ? "已完成出餐" : pendingAction.type === "cancel" ? "券订单已取消" : "退款已提交", "success");
      invalidateResourceCache("dashboard", ...filters.map((item) => orderPageCacheKey(item.value)));
      setPendingAction(null);
      await load(true);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "操作失败", "error");
    } finally {
      setActing(false);
    }
  }

  const isRefundRetry = pendingAction?.type === "refund" && pendingAction.order.status === "REFUNDING";
  const actionTitle = pendingAction?.type === "complete" ? "完成这笔订单？" : pendingAction?.type === "cancel" ? "取消这笔券订单？" : isRefundRetry ? "重新提交退款？" : "提交整单退款？";
  const actionDescription = pendingAction?.type === "complete"
    ? "确认顾客已经取餐后再完成。"
    : pendingAction?.type === "cancel"
      ? "商品券会退回顾客账户，取餐号保留。"
      : isRefundRetry ? "上一笔退款已关闭，将使用新的退款单号重新提交。" : "将按原订单退款，扣回积分，并返还本单使用的商品券。";
  const confirmLabel = pendingAction?.type === "complete" ? "完成出餐" : pendingAction?.type === "cancel" ? "确认取消" : isRefundRetry ? "重新退款" : "提交退款";

  return (
    <div className="page-stack orders-page">
      <header className="page-header">
        <div><p className="eyebrow">待出餐每 5 秒同步</p><h1>订单</h1><p>待出餐从早到晚处理，历史订单优先显示最近记录。</p></div>
        <div className="header-actions">
          <Button tone={newOrderSoundEnabled ? "secondary" : "quiet"} onClick={toggleSound} title="新单会连续响铃并显示页面提醒">
            {newOrderSoundEnabled ? <BellRing size={16} /> : <Bell size={16} />}{newOrderSoundEnabled ? "新单提醒已开启" : "打开新单提醒"}
          </Button>
          <Button tone="secondary" onClick={() => load(true)} loading={syncing}><RefreshCw size={16} />刷新</Button>
        </div>
      </header>

      {error && <div className="inline-alert alert-with-action" role="alert"><span>{error}</span><Button tone="secondary" onClick={() => load(true)}>重试</Button></div>}

      <div className="list-toolbar">
        <div className="segmented-tabs" role="tablist" aria-label="订单状态">
          {filters.map((item) => (
            <button key={item.value} type="button" role="tab" aria-controls="merchant-order-list" aria-selected={filter === item.value} className={filter === item.value ? "is-active" : ""} onClick={() => selectFilter(item.value)}>{item.label}</button>
          ))}
        </div>
        <div className={`sync-strip ${!online ? "is-offline" : ""}`} role="status">
          {!online || orderMonitor.phase === "ERROR" ? <><WifiOff size={15} /><span>{!online ? "网络断开，等待恢复" : "新单同步中断"}</span></> : <><span className="live-dot" /><span>{syncing ? "同步中…" : `已更新 ${lastSync ? lastSync.toLocaleTimeString("zh-CN", { hour12: false }) : "—"}`}</span></>}
        </div>
        <span className="sort-hint"><ArrowDownWideNarrow size={14} />{filter === "WAITING_FULFILLMENT" ? "最早优先" : "最近优先"}</span>
        <span className="list-count">已加载 {orders.length} 单</span>
      </div>

      <section id="merchant-order-list" className="order-list" aria-label="订单列表" aria-busy={loading || syncing || loadingMore}>
        {loading && !orders.length && <OrderListSkeleton />}
        {!loading && orders.map((order) => (
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
                    <div><strong>{line.productName}{(line.pricingSource === "COUPON" || line.couponId) && <small className="line-coupon-label">券抵扣</small>}</strong><span>{line.selectedChoices.map((choice) => choice.choiceName).join(" · ") || "标准规格"}</span></div>
                    <b>× {line.quantity}</b>
                  </div>
                ))}
              </div>
              {order.status === "REFUNDING" && order.refundStatus === "ABNORMAL" && (
                <div className="order-refund-alert" role="alert">退款异常，请到微信支付商户平台处理</div>
              )}
              <footer className="order-card-footer">
                <div className="order-total">
                  {order.paidAmount > 0
                    ? <><span>实付{(order.couponApplications?.length ?? 0) > 0 ? ` · 另用 ${order.couponApplications?.length} 张券` : ""}</span><strong>{formatMoney(order.paidAmount)}</strong></>
                    : <><span>商品券订单</span><strong>{order.couponApplications?.length ?? (order.couponId ? 1 : 0)} 张券</strong></>}
                </div>
                <div className="order-actions">
                  {order.status === "WAITING_FULFILLMENT" && <Button onClick={() => setPendingAction({ type: "complete", order })}><Check size={16} />完成出餐</Button>}
                  {order.status === "WAITING_FULFILLMENT" && order.source === "COUPON" && <Button tone="quiet" onClick={() => setPendingAction({ type: "cancel", order })}><TicketX size={16} />取消</Button>}
                  {["WAITING_FULFILLMENT", "COMPLETED"].includes(order.status) && order.paidAmount > 0 && <Button tone="quiet" onClick={() => setPendingAction({ type: "refund", order })}><RotateCcw size={16} />整单退款</Button>}
                  {order.status === "REFUNDING" && order.refundStatus === "CLOSED" && <Button tone="danger" onClick={() => setPendingAction({ type: "refund", order })}><RotateCcw size={16} />重新退款</Button>}
                </div>
              </footer>
            </div>
          </article>
        ))}
        {!loading && !orders.length && <EmptyState title={emptyCopy[filter].title} detail={emptyCopy[filter].detail} icon={<ReceiptText size={26} />} />}
        {!loading && nextCursor && <div className="load-more-row"><Button tone="secondary" loading={loadingMore} onClick={() => load(false, true)}>加载更多</Button></div>}
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

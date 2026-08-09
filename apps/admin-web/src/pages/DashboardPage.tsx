import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Banknote, CheckCheck, Coins, ReceiptText, RefreshCw, RotateCcw, TicketPercent, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import type { V2DashboardStats, V2Order } from "@restaurant/shared";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";
import { EmptyState, PageError, PageLoading } from "../components/PageState";
import { OrderSourceBadge, OrderStatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatMoney } from "../lib/format";
import { readResourceCache, writeResourceCache } from "../lib/resource-cache";

const DASHBOARD_CACHE_KEY = "dashboard";

export function DashboardPage() {
  const { api, session } = useMerchant();
  const [stats, setStats] = useState<V2DashboardStats | null>(() => readResourceCache<{ stats: V2DashboardStats; orders: V2Order[] }>(DASHBOARD_CACHE_KEY)?.stats ?? null);
  const [orders, setOrders] = useState<V2Order[]>(() => readResourceCache<{ stats: V2DashboardStats; orders: V2Order[] }>(DASHBOARD_CACHE_KEY)?.orders ?? []);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(() => readResourceCache(DASHBOARD_CACHE_KEY) === undefined);

  const load = useCallback(async () => {
    if (!api || !session) return;
    setRefreshing(true);
    setError("");
    try {
      const [nextStats, nextOrders] = await Promise.all([
        api.getDashboard(session.token),
        api.listOrders(session.token, "WAITING_FULFILLMENT")
      ]);
      writeResourceCache(DASHBOARD_CACHE_KEY, { stats: nextStats, orders: nextOrders });
      setStats(nextStats);
      setOrders(nextOrders);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "数据加载失败");
    } finally {
      setRefreshing(false);
    }
  }, [api, session]);

  useEffect(() => { void load(); }, [load]);
  if (!stats && refreshing) return <PageLoading label="正在汇总今日数据" />;
  if (!stats && error) return <PageError message={error} onRetry={load} />;
  if (!stats) return null;

  const primaryMetrics = [
    { label: "支付金额", value: formatMoney(stats.paymentAmount), detail: `${stats.paymentOrderCount} 笔支付订单`, icon: Banknote, tone: "red" },
    { label: "待出餐", value: String(orders.length), detail: "当前需要处理", icon: ReceiptText, tone: "amber" },
    { label: "已完成", value: String(stats.completedOrderCount), detail: "今日完成订单", icon: CheckCheck, tone: "green" },
    { label: "券订单", value: String(stats.couponOrderCount), detail: "免费取餐订单", icon: TicketPercent, tone: "blue" }
  ];

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">营业日 {stats.businessDate}</p>
          <h1>今天的生意</h1>
          <p>待出餐先处理，今天的经营数据都在这里。</p>
        </div>
        <Button tone="secondary" onClick={load} loading={refreshing}><RefreshCw size={16} />刷新</Button>
      </header>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <section className="metric-grid" aria-label="今日核心数据">
        {primaryMetrics.map(({ label, value, detail, icon: Icon, tone }) => (
          <article className="metric-card" key={label}>
            <span className={`metric-icon metric-icon-${tone}`}><Icon size={20} aria-hidden="true" /></span>
            <div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel dashboard-orders">
          <header className="section-heading">
            <div><h2>待出餐</h2><p>{orders.length ? `${orders.length} 单等待处理` : "暂时没有新单"}</p></div>
            <Link className="text-link" to="/orders">查看全部<ArrowRight size={15} /></Link>
          </header>
          <div className="compact-order-list">
            {orders.slice(0, 4).map((order) => (
              <article className="compact-order" key={order._id}>
                <span className="pickup-mini">{order.pickupNumber}</span>
                <div className="compact-order-main">
                  <div><strong>{order.lineItems.map((item) => `${item.productName} × ${item.quantity}`).join("、")}</strong><span>{formatDateTime(order.createdAt)}</span></div>
                  <div className="badge-row"><OrderSourceBadge source={order.source} /><OrderStatusBadge status={order.status} /></div>
                </div>
              </article>
            ))}
            {!orders.length && <EmptyState compact title="没有待出餐订单" detail="有新单时会出现在这里。" icon={<ReceiptText size={24} />} />}
          </div>
        </section>

        <section className="panel points-summary">
          <header className="section-heading"><div><h2>积分情况</h2><p>今日发放与消耗</p></div><Coins size={20} aria-hidden="true" /></header>
          <dl className="summary-list">
            <div><dt>下单获得</dt><dd>+{stats.buyerPointsIssued}</dd></div>
            <div><dt>邀请奖励</dt><dd>+{stats.inviterPointsIssued}</dd></div>
            <div><dt>换券使用</dt><dd>-{stats.exchangePointsSpent}</dd></div>
          </dl>
          <div className="summary-divider" />
          <dl className="summary-list muted-summary">
            <div><dt><UserPlus size={16} />新增用户</dt><dd>{stats.newMemberCount}</dd></div>
            <div><dt><RotateCcw size={16} />退款订单</dt><dd>{stats.refundCount}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

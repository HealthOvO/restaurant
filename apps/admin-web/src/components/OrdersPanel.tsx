import { useEffect, useMemo, useState } from "react";
import type { OrderRecord, OrderStatus, OrderStatusLog, PaginationMeta } from "@restaurant/shared";

type OrderActionStatus = "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

interface OrdersPanelProps {
  rows: OrderRecord[];
  pagination: PaginationMeta;
  loading?: boolean;
  query: string;
  status: OrderStatus | "ALL";
  selectedOrder: OrderRecord | null;
  orderLogs: OrderStatusLog[];
  detailLoading?: boolean;
  updatingStatus?: OrderActionStatus | null;
  onSearch: (query: string, status: OrderStatus | "ALL", page?: number) => Promise<void>;
  onSelectOrder: (orderId: string) => Promise<void>;
  onUpdateStatus: (payload: { orderId: string; nextStatus: OrderActionStatus; note?: string }) => Promise<void>;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_CONFIRM: "待确认",
  CONFIRMED: "已确认",
  PREPARING: "制作中",
  READY: "待取餐",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

const ACTION_LABELS: Record<OrderActionStatus, string> = {
  CONFIRMED: "确认接单",
  PREPARING: "开始制作",
  READY: "标记待取",
  COMPLETED: "完成订单",
  CANCELLED: "取消订单"
};

function formatDateTime(value?: string) {
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toFixed(0)}`;
}

function getStatusClass(status: OrderStatus) {
  return status === "COMPLETED" || status === "READY"
    ? "tag tag-success"
    : status === "CANCELLED"
      ? "tag tag-navy"
      : "tag";
}

function getAvailableActions(status?: OrderStatus): OrderActionStatus[] {
  if (!status) {
    return [];
  }
  if (status === "PENDING_CONFIRM") {
    return ["CONFIRMED", "CANCELLED"];
  }
  if (status === "CONFIRMED") {
    return ["PREPARING", "CANCELLED"];
  }
  if (status === "PREPARING") {
    return ["READY", "CANCELLED"];
  }
  if (status === "READY") {
    return ["COMPLETED"];
  }
  return [];
}

function buildVisiblePages(page: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function OrdersPanel({
  rows,
  pagination,
  loading = false,
  query,
  status,
  selectedOrder,
  orderLogs,
  detailLoading = false,
  updatingStatus = null,
  onSearch,
  onSelectOrder,
  onUpdateStatus
}: OrdersPanelProps) {
  const [searchDraft, setSearchDraft] = useState(query);
  const [statusDraft, setStatusDraft] = useState<OrderStatus | "ALL">(status);
  const [note, setNote] = useState("");

  useEffect(() => {
    setSearchDraft(query);
  }, [query]);

  useEffect(() => {
    setStatusDraft(status);
  }, [status]);

  useEffect(() => {
    setNote("");
  }, [selectedOrder?._id]);

  const pageButtons = useMemo(
    () => buildVisiblePages(pagination.page, pagination.totalPages),
    [pagination.page, pagination.totalPages]
  );
  const pendingCount = rows.filter((item) => item.status === "PENDING_CONFIRM").length;
  const readyCount = rows.filter((item) => item.status === "READY").length;
  const dineInCount = rows.filter((item) => item.fulfillmentMode === "DINE_IN").length;
  const pickupCount = rows.filter((item) => item.fulfillmentMode === "PICKUP").length;
  const availableActions = getAvailableActions(selectedOrder?.status);

  return (
    <div className="section-stack">
      <div className="metric-grid compact-metric-grid">
        <div className="metric-card compact-metric-card">
          <div className="tag">当前页订单</div>
          <div className="metric-value metric-value-compact">{rows.length}</div>
          <div className="metric-footnote">当前筛选结果里的订单数。</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag tag-navy">待确认</div>
          <div className="metric-value metric-value-compact">{pendingCount}</div>
          <div className="metric-footnote">优先确认，避免顾客久等。</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag tag-success">待取餐</div>
          <div className="metric-value metric-value-compact">{readyCount}</div>
          <div className="metric-footnote">制作完成后尽快提醒取餐。</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag">堂食 / 自提</div>
          <div className="metric-value metric-value-compact">{`${dineInCount}/${pickupCount}`}</div>
          <div className="metric-footnote">看当前页的履约结构。</div>
        </div>
      </div>

      <div className="split orders-workbench-grid">
        <div className="section-stack">
          <div className="row-card stack">
            <div className="card-title-block">
              <div className="section-eyebrow">订单筛选</div>
              <h3 className="section-title">按状态或关键词查看</h3>
              <p className="subtle">支持订单号、会员号、联系人、手机号和桌号搜索。</p>
            </div>

            <div className="field-grid">
              <label className="field-label" htmlFor="orders-query">
                搜索关键词
                <input
                  id="orders-query"
                  className="field"
                  placeholder="订单号、会员号、桌号、联系人"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                />
              </label>

              <label className="field-label" htmlFor="orders-status">
                订单状态
                <select
                  id="orders-status"
                  className="field"
                  value={statusDraft}
                  onChange={(event) => setStatusDraft(event.target.value as OrderStatus | "ALL")}
                >
                  <option value="ALL">全部状态</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="button-row">
              <button className="button button-primary" disabled={loading} type="button" onClick={() => void onSearch(searchDraft.trim(), statusDraft, 1)}>
                {loading ? "加载中..." : "刷新订单"}
              </button>
              <button className="button button-secondary" disabled={loading} type="button" onClick={() => void onSearch("", "ALL", 1)}>
                清空筛选
              </button>
            </div>

            <div className="member-toolbar-strip">
              <div className="toolbar-pill">
                {pagination.total > 0
                  ? `当前显示 ${pagination.rangeStart}-${pagination.rangeEnd} / ${pagination.total}`
                  : "当前没有订单"}
              </div>
              <div className="toolbar-pill">{statusDraft === "ALL" ? "状态：全部" : `状态：${STATUS_LABELS[statusDraft]}`}</div>
            </div>
          </div>

          <div className="table-like orders-list">
            {rows.length > 0 ? (
              rows.map((order) => (
                <button
                  key={order._id}
                  className={`row-card order-row ${selectedOrder?._id === order._id ? "order-row-active" : ""}`}
                  type="button"
                  onClick={() => void onSelectOrder(order._id)}
                >
                  <div className="card-header">
                    <div className="card-title-block">
                      <div className="inline-tags">
                        <div className="tag tag-navy">{order.orderNo}</div>
                        <div className={getStatusClass(order.status)}>{STATUS_LABELS[order.status]}</div>
                        <div className="tag">{order.fulfillmentMode === "DINE_IN" ? "堂食" : "自提"}</div>
                      </div>
                      <h3 className="section-title">{order.nickname || order.memberCode || "散客下单"}</h3>
                      <p className="subtle">
                        {order.fulfillmentMode === "DINE_IN"
                          ? order.tableNo || "未填桌号"
                          : order.contactName || order.contactPhone || "未填联系人"}
                      </p>
                    </div>
                    <div className="stack order-row-side">
                      <strong>{formatCurrency(order.payableAmount)}</strong>
                      <span className="subtle tiny">{formatDateTime(order.submittedAt)}</span>
                    </div>
                  </div>

                  <div className="data-points">
                    <div className="data-point">
                      <span className="data-label">菜品</span>
                      <span className="data-value order-line-summary">
                        {order.lineItems.slice(0, 3).map((item) => item.name).join(" / ") || "暂无菜品"}
                      </span>
                    </div>
                    <div className="data-point">
                      <span className="data-label">数量</span>
                      <span className="data-value">{order.itemCount} 份</span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <div className="tag">没有匹配订单</div>
                <h3 className="section-title">当前筛选下没有结果</h3>
                <p className="subtle">可以清空筛选条件，或者换个关键词再查一遍。</p>
              </div>
            )}
          </div>

          {pagination.total > 0 ? (
            <div className="button-row order-pagination">
              <button
                className="button button-secondary"
                disabled={!pagination.hasPrevPage || loading}
                type="button"
                onClick={() => void onSearch(query, status, pagination.page - 1)}
              >
                上一页
              </button>
              {pageButtons.map((page) => (
                <button
                  key={page}
                  className={`button ${page === pagination.page ? "button-primary" : "button-secondary"}`}
                  disabled={loading}
                  type="button"
                  onClick={() => void onSearch(query, status, page)}
                >
                  {page}
                </button>
              ))}
              <button
                className="button button-secondary"
                disabled={!pagination.hasNextPage || loading}
                type="button"
                onClick={() => void onSearch(query, status, pagination.page + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}
        </div>

        <div className="section-stack">
          {selectedOrder ? (
            <div className="row-card stack">
              <div className="card-header">
                <div className="card-title-block">
                  <div className="section-eyebrow">订单详情</div>
                  <h3 className="section-title">{selectedOrder.orderNo}</h3>
                  <p className="subtle">{selectedOrder.nickname || selectedOrder.memberCode || "散客下单"}</p>
                </div>
                <div className="inline-tags">
                  <div className={getStatusClass(selectedOrder.status)}>{STATUS_LABELS[selectedOrder.status]}</div>
                  <div className="tag">{formatCurrency(selectedOrder.payableAmount)}</div>
                </div>
              </div>

              {detailLoading ? <div className="notice">正在读取订单详情...</div> : null}

              <div className="data-points">
                <div className="data-point">
                  <span className="data-label">下单时间</span>
                  <span className="data-value">{formatDateTime(selectedOrder.submittedAt)}</span>
                </div>
                <div className="data-point">
                  <span className="data-label">履约方式</span>
                  <span className="data-value">
                    {selectedOrder.fulfillmentMode === "DINE_IN"
                      ? `堂食 ${selectedOrder.tableNo ? `· ${selectedOrder.tableNo}` : ""}`
                      : `自提 ${selectedOrder.contactName ? `· ${selectedOrder.contactName}` : ""}`}
                  </span>
                </div>
                <div className="data-point">
                  <span className="data-label">备注</span>
                  <span className="data-value order-line-summary">{selectedOrder.remark || "无备注"}</span>
                </div>
              </div>

              <div className="table-like order-detail-lines">
                {selectedOrder.lineItems.map((item) => (
                  <div className="order-detail-line" key={item.lineId}>
                    <div className="stack">
                      <strong>{item.name}</strong>
                      <span className="subtle tiny">
                        {item.selectedOptions.map((option) => option.choiceName).join(" / ") || "默认规格"}
                      </span>
                    </div>
                    <div className="stack order-row-side">
                      <strong>{`${item.quantity} x ${formatCurrency(item.unitPrice)}`}</strong>
                      <span className="subtle tiny">{formatCurrency(item.lineTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <label className="field-label" htmlFor="order-action-note">
                处理备注
                <textarea
                  id="order-action-note"
                  className="textarea"
                  placeholder="例如 已通知后厨加急、顾客稍后到店取餐"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>

              <div className="button-row">
                {availableActions.length > 0 ? (
                  availableActions.map((action) => (
                    <button
                      key={action}
                      className={action === "CANCELLED" ? "button button-danger" : "button button-primary"}
                      disabled={updatingStatus === action}
                      type="button"
                      onClick={() =>
                        void onUpdateStatus({
                          orderId: selectedOrder._id,
                          nextStatus: action,
                          note: note.trim()
                        })
                      }
                    >
                      {updatingStatus === action ? "处理中..." : ACTION_LABELS[action]}
                    </button>
                  ))
                ) : (
                  <div className="tag tag-navy">当前订单已经走完流程</div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="tag">先选一笔订单</div>
              <h3 className="section-title">右侧显示订单详情和处理动作</h3>
              <p className="subtle">点左侧任意一笔订单，就能看到菜品明细、时间线和可执行动作。</p>
            </div>
          )}

          {selectedOrder ? (
            <div className="row-card stack">
              <div className="card-title-block">
                <div className="section-eyebrow">状态时间线</div>
                <h3 className="section-title">订单处理留痕</h3>
                <p className="subtle">老板和店员的每一步处理都会写入日志。</p>
              </div>

              {orderLogs.length > 0 ? (
                <div className="table-like order-log-list">
                  {orderLogs.map((log) => (
                    <div className="order-log-row" key={log._id}>
                      <div className="inline-tags">
                        <div className={getStatusClass(log.status)}>{STATUS_LABELS[log.status]}</div>
                        <div className="tag tag-navy">{log.operatorType}</div>
                      </div>
                      <div className="stack">
                        <strong>{formatDateTime(log.createdAt)}</strong>
                        <span className="subtle tiny">{log.note || log.operatorName || log.operatorId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state order-logs-empty">
                  <div className="tag">暂无日志</div>
                  <p className="subtle">这笔订单还没有写入状态流转记录。</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

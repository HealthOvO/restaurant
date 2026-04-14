import { useMemo, useState } from "react";
import type { AuditLog } from "@restaurant/shared";

interface AuditPanelProps {
  logs: AuditLog[];
}

const ACTION_LABELS: Record<string, string> = {
  SAVE_RULES: "保存奖励规则",
  ADJUST_BINDING: "调整邀请关系",
  ADJUST_MEMBER_POINTS: "调整会员积分",
  CREATE_STAFF: "新增店员账号",
  UPDATE_STAFF: "更新店员状态",
  SUBMIT_FEEDBACK: "提交用户反馈",
  UPDATE_FEEDBACK: "处理用户反馈",
  SETTLE_FIRST_VISIT: "录入消费核销",
  REDEEM_VOUCHER: "核销菜品券",
  POINT_EXCHANGE: "积分兑换菜品",
  RULES_SAVE: "保存奖励规则",
  BINDING_ADJUST: "调整邀请关系",
  STAFF_CREATE: "新增员工账号",
  STAFF_UPDATE_STATUS: "更新员工状态",
  VISIT_SETTLE: "录入消费核销",
  VOUCHER_REDEEM: "核销菜品券"
};

const ACTOR_LABELS: Record<string, string> = {
  SYSTEM: "系统",
  OWNER: "老板",
  STAFF: "店员",
  MEMBER: "会员"
};

const COLLECTION_LABELS: Record<string, string> = {
  reward_rules: "奖励规则",
  invite_relations: "邀请关系",
  members: "会员",
  staff_users: "员工账号",
  feedback_tickets: "用户反馈",
  visit_records: "消费核销",
  dish_vouchers: "菜品券",
  point_exchange_items: "积分兑换菜品",
  member_point_transactions: "积分流水"
};

function prettifyText(value: string) {
  return value
    .toLowerCase()
    .split(/[_\-.]/)
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
}

function formatDateTime(value?: string) {
  if (!value) {
    return "未知";
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

function formatPayload(payload: AuditLog["payload"]) {
  if (!payload) {
    return "";
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return `${payload}`;
  }
}

function matchesQuery(log: AuditLog, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const actionLabel = ACTION_LABELS[log.action] || prettifyText(log.action);
  const collectionLabel = COLLECTION_LABELS[log.targetCollection] || prettifyText(log.targetCollection);
  const actorLabel = ACTOR_LABELS[log.actorType] || log.actorType;

  return [actionLabel, collectionLabel, actorLabel, log.summary, log.actorId, log.targetId, formatPayload(log.payload)]
    .filter(Boolean)
    .some((value) => `${value}`.toLowerCase().includes(normalized));
}

export function AuditPanel({ logs }: AuditPanelProps) {
  const [query, setQuery] = useState("");
  const [actorFilter, setActorFilter] = useState<"ALL" | keyof typeof ACTOR_LABELS>("ALL");
  const [collectionFilter, setCollectionFilter] = useState<"ALL" | keyof typeof COLLECTION_LABELS>("ALL");
  const [expandedPayloadIds, setExpandedPayloadIds] = useState<Record<string, boolean>>({});
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = logs.filter((log) => log.createdAt.startsWith(today)).length;
  const ownerCount = logs.filter((log) => log.actorType === "OWNER").length;
  const latestCreatedAt = logs[0]?.createdAt;
  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (actorFilter !== "ALL" && log.actorType !== actorFilter) {
          return false;
        }
        if (collectionFilter !== "ALL" && log.targetCollection !== collectionFilter) {
          return false;
        }

        return matchesQuery(log, query);
      }),
    [actorFilter, collectionFilter, logs, query]
  );
  const hasActiveFilters = Boolean(query.trim()) || actorFilter !== "ALL" || collectionFilter !== "ALL";

  function resetFilters() {
    setQuery("");
    setActorFilter("ALL");
    setCollectionFilter("ALL");
  }

  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <div className="tag tag-navy">暂无日志</div>
        <h3 className="section-title">最近还没有操作记录</h3>
        <p className="subtle">保存规则、改账号、处理反馈后都会在这里留痕。</p>
      </div>
    );
  }

  return (
    <div className="section-stack">
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-kicker">日志总数</div>
          <div className="summary-value">{logs.length}</div>
          <div className="summary-footnote">最近 100 条</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">今日新增</div>
          <div className="summary-value">{todayCount}</div>
          <div className="summary-footnote">今天新增</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">老板操作</div>
          <div className="summary-value">{ownerCount}</div>
          <div className="summary-footnote">老板发起</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">最近一条</div>
          <div className="summary-value summary-value-text">{formatDateTime(latestCreatedAt)}</div>
          <div className="summary-footnote">最新记录</div>
        </div>
      </div>

      <div className="table-like">
        <div className="row-card stack">
          <div className="card-title-block">
            <div className="section-eyebrow">筛选日志</div>
            <h3 className="section-title">日志筛选</h3>
            <p className="subtle">支持摘要、记录 ID 和操作人。</p>
          </div>

          <div className="field-grid audit-filter-grid">
            <label className="field-label" htmlFor="audit-query">
              搜索关键词
              <input
                id="audit-query"
                className="field"
                placeholder="摘要、记录 ID、操作人 ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <label className="field-label" htmlFor="audit-actor-filter">
              操作人
              <select
                id="audit-actor-filter"
                className="field"
                value={actorFilter}
                onChange={(event) => setActorFilter(event.target.value as "ALL" | keyof typeof ACTOR_LABELS)}
              >
                <option value="ALL">全部操作人</option>
                {Object.entries(ACTOR_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label" htmlFor="audit-collection-filter">
              目标集合
              <select
                id="audit-collection-filter"
                className="field"
                value={collectionFilter}
                onChange={(event) => setCollectionFilter(event.target.value as "ALL" | keyof typeof COLLECTION_LABELS)}
              >
                <option value="ALL">全部集合</option>
                {Object.entries(COLLECTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="member-toolbar-strip">
            <div className="toolbar-pill">
              当前显示 {filteredLogs.length} / {logs.length}
            </div>
            <button className="button button-secondary" disabled={!hasActiveFilters} type="button" onClick={resetFilters}>
              重置筛选
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <div className="tag">没有匹配日志</div>
            <h3 className="section-title">当前筛选下没有日志</h3>
            <p className="subtle">先重置筛选，再看最近记录。</p>
          </div>
        ) : null}

        {filteredLogs.map((log) => {
          const actionLabel = ACTION_LABELS[log.action] || prettifyText(log.action);
          const collectionLabel = COLLECTION_LABELS[log.targetCollection] || prettifyText(log.targetCollection);
          const actorLabel = ACTOR_LABELS[log.actorType] || log.actorType;
          const payloadPreview = formatPayload(log.payload);
          const actorTagClass =
            log.actorType === "OWNER"
              ? "tag tag-success"
              : log.actorType === "SYSTEM"
                ? "tag tag-navy"
                : log.actorType === "MEMBER"
                  ? "tag"
                  : "tag";

          return (
            <div className="row-card audit-card" key={log._id}>
              <div className="card-header">
                <div className="card-title-block">
                  <div className="inline-tags">
                    <div className="tag tag-navy">{collectionLabel}</div>
                    <div className={actorTagClass}>{actorLabel}</div>
                  </div>
                  <h3 className="section-title">{actionLabel}</h3>
                  <p className="subtle">{log.summary}</p>
                </div>
                <div className="audit-time">{formatDateTime(log.createdAt)}</div>
              </div>

              <div className="data-points">
                <div className="data-point">
                  <span className="data-label">操作人 ID</span>
                  <code className="code-pill">{log.actorId}</code>
                </div>
                <div className="data-point">
                  <span className="data-label">目标记录 ID</span>
                  <code className="code-pill">{log.targetId}</code>
                </div>
                <div className="data-point">
                  <span className="data-label">变更详情</span>
                  <span className="data-value">{log.payload ? "已记录" : "无"}</span>
                </div>
              </div>

              {log.payload ? (
                <div className="stack">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      setExpandedPayloadIds((current) => ({
                        ...current,
                        [log._id]: !current[log._id]
                      }))
                    }
                  >
                    {expandedPayloadIds[log._id] ? "收起变更详情" : "查看变更详情"}
                  </button>
                  {expandedPayloadIds[log._id] ? <pre className="payload-preview">{payloadPreview}</pre> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

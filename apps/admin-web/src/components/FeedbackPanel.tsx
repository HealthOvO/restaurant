import { useEffect, useMemo, useState } from "react";
import type { FeedbackCategory, FeedbackPriority, FeedbackStatus, FeedbackTicket } from "@restaurant/shared";

interface FeedbackPanelProps {
  feedbacks: FeedbackTicket[];
  updatingFeedbackId?: string | null;
  onUpdate: (payload: {
    feedbackId: string;
    status: FeedbackStatus;
    priority: FeedbackPriority;
    ownerReply: string;
  }) => Promise<void>;
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: "待处理",
  PROCESSING: "处理中",
  RESOLVED: "已解决"
};

const PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  NORMAL: "普通",
  HIGH: "优先",
  URGENT: "紧急"
};

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  BUG: "页面异常",
  POINTS: "积分问题",
  VOUCHER: "菜品券问题",
  VISIT: "到店核销",
  INVITE: "邀请关系",
  STAFF_TOOL: "店员工具",
  SUGGESTION: "建议优化",
  OTHER: "其他问题"
};

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

function getStatusTagClass(status: FeedbackStatus) {
  return status === "RESOLVED" ? "tag tag-success" : status === "PROCESSING" ? "tag tag-navy" : "tag";
}

function getSourceLabel(ticket: FeedbackTicket) {
  return ticket.sourceType === "STAFF" ? "店员反馈" : "会员反馈";
}

function matchesQuery(ticket: FeedbackTicket, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    ticket.feedbackCode,
    ticket.title,
    ticket.content,
    ticket.contactName,
    ticket.contactInfo,
    ticket.memberCode,
    ticket.staffUsername,
    ticket.ownerReply
  ]
    .filter(Boolean)
    .some((value) => `${value}`.toLowerCase().includes(normalized));
}

export function FeedbackPanel({ feedbacks, updatingFeedbackId = null, onUpdate }: FeedbackPanelProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | FeedbackStatus>("ALL");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "MEMBER" | "STAFF">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | FeedbackCategory>("ALL");
  const [statusDrafts, setStatusDrafts] = useState<Record<string, FeedbackStatus>>({});
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, FeedbackPriority>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextStatusDrafts: Record<string, FeedbackStatus> = {};
    const nextPriorityDrafts: Record<string, FeedbackPriority> = {};
    const nextReplyDrafts: Record<string, string> = {};

    feedbacks.forEach((ticket) => {
      nextStatusDrafts[ticket._id] = ticket.status;
      nextPriorityDrafts[ticket._id] = ticket.priority;
      nextReplyDrafts[ticket._id] = ticket.ownerReply ?? "";
    });

    setStatusDrafts(nextStatusDrafts);
    setPriorityDrafts(nextPriorityDrafts);
    setReplyDrafts(nextReplyDrafts);
  }, [feedbacks]);

  const filteredFeedbacks = useMemo(
    () =>
      feedbacks
        .filter((ticket) => {
          if (statusFilter !== "ALL" && ticket.status !== statusFilter) {
            return false;
          }
          if (sourceFilter !== "ALL" && ticket.sourceType !== sourceFilter) {
            return false;
          }
          if (categoryFilter !== "ALL" && ticket.category !== categoryFilter) {
            return false;
          }

          return matchesQuery(ticket, query);
        })
        .slice()
        .sort((left, right) => {
          const priorityWeight = {
            URGENT: 3,
            HIGH: 2,
            NORMAL: 1
          } as const;
          const statusWeight = {
            OPEN: 3,
            PROCESSING: 2,
            RESOLVED: 1
          } as const;

          return (
            priorityWeight[right.priority] - priorityWeight[left.priority] ||
            statusWeight[right.status] - statusWeight[left.status] ||
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
          );
        }),
    [categoryFilter, feedbacks, query, sourceFilter, statusFilter]
  );

  const openCount = feedbacks.filter((ticket) => ticket.status === "OPEN").length;
  const processingCount = feedbacks.filter((ticket) => ticket.status === "PROCESSING").length;
  const resolvedCount = feedbacks.filter((ticket) => ticket.status === "RESOLVED").length;
  const urgentCount = feedbacks.filter((ticket) => ticket.priority === "URGENT").length;
  const filteredUrgentCount = filteredFeedbacks.filter((ticket) => ticket.priority === "URGENT").length;
  const hasActiveFilters = Boolean(query.trim()) || statusFilter !== "ALL" || sourceFilter !== "ALL" || categoryFilter !== "ALL";

  function resetFilters() {
    setQuery("");
    setStatusFilter("ALL");
    setSourceFilter("ALL");
    setCategoryFilter("ALL");
  }

  if (feedbacks.length === 0) {
    return (
      <div className="empty-state">
        <div className="tag tag-navy">暂无反馈</div>
        <h3 className="section-title">最近还没有问题回流</h3>
        <p className="subtle">会员和店员的反馈都会在这里。</p>
      </div>
    );
  }

  return (
    <div className="section-stack">
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-kicker">待处理</div>
          <div className="summary-value">{openCount}</div>
          <div className="summary-footnote">未开始处理</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">处理中</div>
          <div className="summary-value">{processingCount}</div>
          <div className="summary-footnote">处理中</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">已解决</div>
          <div className="summary-value">{resolvedCount}</div>
          <div className="summary-footnote">已处理完成</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">紧急反馈</div>
          <div className="summary-value">{urgentCount}</div>
          <div className="summary-footnote">优先处理</div>
        </div>
      </div>

      <div className="row-card stack">
        <div className="card-title-block">
          <div className="section-eyebrow">筛选反馈</div>
          <h3 className="section-title">反馈筛选</h3>
          <p className="subtle">可按编号、标题、内容和联系方式筛选。</p>
        </div>

        <div className="field-grid feedback-filter-grid">
          <label className="field-label" htmlFor="feedback-query">
            搜索关键词
            <input
              id="feedback-query"
              className="field"
              placeholder="编号、标题、内容、会员号、店员账号"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="field-label" htmlFor="feedback-status-filter">
            处理状态
            <select
              id="feedback-status-filter"
              className="field"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | FeedbackStatus)}
            >
              <option value="ALL">全部状态</option>
              <option value="OPEN">待处理</option>
              <option value="PROCESSING">处理中</option>
              <option value="RESOLVED">已解决</option>
            </select>
          </label>

          <label className="field-label" htmlFor="feedback-source-filter">
            提交来源
            <select
              id="feedback-source-filter"
              className="field"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as "ALL" | "MEMBER" | "STAFF")}
            >
              <option value="ALL">全部来源</option>
              <option value="MEMBER">会员反馈</option>
              <option value="STAFF">店员反馈</option>
            </select>
          </label>

          <label className="field-label" htmlFor="feedback-category-filter">
            问题分类
            <select
              id="feedback-category-filter"
              className="field"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as "ALL" | FeedbackCategory)}
            >
              <option value="ALL">全部分类</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="member-toolbar-strip">
          <div className="toolbar-pill">
            当前显示 {filteredFeedbacks.length} / {feedbacks.length}
          </div>
          <div className="toolbar-pill">
            {filteredUrgentCount > 0 ? `紧急 ${filteredUrgentCount} 条` : "无紧急反馈"}
          </div>
          <button className="button button-secondary" disabled={!hasActiveFilters} type="button" onClick={resetFilters}>
            重置筛选
          </button>
        </div>
      </div>

      {filteredFeedbacks.length === 0 ? (
        <div className="empty-state">
          <div className="tag">没有匹配结果</div>
          <h3 className="section-title">当前筛选下没有反馈</h3>
          <p className="subtle">先重置筛选，再看最近上报的问题。</p>
        </div>
      ) : (
        <div className="table-like feedback-card-list">
          {filteredFeedbacks.map((ticket) => {
            const statusValue = statusDrafts[ticket._id] ?? ticket.status;
            const priorityValue = priorityDrafts[ticket._id] ?? ticket.priority;
            const replyValue = replyDrafts[ticket._id] ?? ticket.ownerReply ?? "";
            const isDirty =
              statusValue !== ticket.status ||
              priorityValue !== ticket.priority ||
              replyValue !== (ticket.ownerReply ?? "");

            return (
              <div className="row-card feedback-card" key={ticket._id}>
                <div className="card-header feedback-card-header">
                  <div className="card-title-block">
                    <div className="inline-tags">
                      <div className="tag tag-navy">{ticket.feedbackCode}</div>
                      <div className={getStatusTagClass(statusValue)}>{STATUS_LABELS[statusValue]}</div>
                      <div className="tag">{getSourceLabel(ticket)}</div>
                      {isDirty ? <div className="tag">待保存</div> : null}
                    </div>
                    <h3 className="section-title">{ticket.title}</h3>
                    <p className="subtle">
                      {CATEGORY_LABELS[ticket.category]} · {formatDateTime(ticket.createdAt)} ·
                      {ticket.contactName ? ` ${ticket.contactName}` : " 未留姓名"}
                    </p>
                  </div>
                  <div className="tag">{PRIORITY_LABELS[priorityValue]}</div>
                </div>

                <div className="data-points">
                  <div className="data-point">
                    <span className="data-label">反馈内容</span>
                    <span className="data-value feedback-long-text">{ticket.content}</span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">联系方式</span>
                    <span className="data-value feedback-long-text">
                      {ticket.contactInfo || (ticket.sourceType === "MEMBER" ? "未留联系方式" : ticket.staffUsername || "未留联系方式")}
                    </span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">来源标识</span>
                    <span className="data-value feedback-long-text">
                      {ticket.memberCode || ticket.staffUsername || ticket.submitterOpenId || "未记录"}
                    </span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">来源页面</span>
                    <span className="data-value feedback-long-text">{ticket.sourcePage || "未记录"}</span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">最近处理</span>
                    <span className="data-value feedback-long-text">
                      {ticket.handledAt ? formatDateTime(ticket.handledAt) : "还没有处理记录"}
                    </span>
                  </div>
                </div>

                <div className="field-grid feedback-editor-grid">
                  <label className="field-label" htmlFor={`feedback-status-${ticket._id}`}>
                    处理状态
                    <select
                      id={`feedback-status-${ticket._id}`}
                      className="field"
                      value={statusValue}
                      onChange={(event) =>
                        setStatusDrafts((current) => ({
                          ...current,
                          [ticket._id]: event.target.value as FeedbackStatus
                        }))
                      }
                    >
                      <option value="OPEN">待处理</option>
                      <option value="PROCESSING">处理中</option>
                      <option value="RESOLVED">已解决</option>
                    </select>
                  </label>

                  <label className="field-label" htmlFor={`feedback-priority-${ticket._id}`}>
                    优先级
                    <select
                      id={`feedback-priority-${ticket._id}`}
                      className="field"
                      value={priorityValue}
                      onChange={(event) =>
                        setPriorityDrafts((current) => ({
                          ...current,
                          [ticket._id]: event.target.value as FeedbackPriority
                        }))
                      }
                    >
                      <option value="NORMAL">普通</option>
                      <option value="HIGH">优先</option>
                      <option value="URGENT">紧急</option>
                    </select>
                  </label>
                </div>

                <label className="field-label" htmlFor={`feedback-reply-${ticket._id}`}>
                  给用户的回复
                  <textarea
                    id={`feedback-reply-${ticket._id}`}
                    className="textarea"
                    placeholder="回复处理进度"
                    value={replyValue}
                    onChange={(event) =>
                      setReplyDrafts((current) => ({
                        ...current,
                        [ticket._id]: event.target.value
                      }))
                    }
                  />
                </label>

                <div className="button-row">
                  <button
                    className="button button-primary"
                    disabled={!isDirty || updatingFeedbackId === ticket._id}
                    onClick={() =>
                      void onUpdate({
                        feedbackId: ticket._id,
                        status: statusValue,
                        priority: priorityValue,
                        ownerReply: replyValue.trim()
                      })
                    }
                    type="button"
                  >
                    {updatingFeedbackId === ticket._id ? "保存中..." : "保存处理"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

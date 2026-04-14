import { useEffect, useMemo, useState } from "react";
import type { OpsTask, OpsTaskPriority, OpsTaskStatus } from "@restaurant/shared";

interface OpsTasksPanelProps {
  tasks: OpsTask[];
  status: OpsTaskStatus;
  loading?: boolean;
  retryingTaskId?: string | null;
  resolvingTaskId?: string | null;
  onStatusChange: (status: OpsTaskStatus) => Promise<void>;
  onRetry: (taskId: string) => Promise<void>;
  onResolve: (payload: {
    taskId: string;
    action: "RESOLVE" | "IGNORE";
    note?: string;
  }) => Promise<void>;
}

const STATUS_LABELS: Record<OpsTaskStatus, string> = {
  OPEN: "待处理",
  RESOLVED: "已处理",
  IGNORED: "已忽略"
};

const PRIORITY_LABELS: Record<OpsTaskPriority, string> = {
  NORMAL: "普通",
  HIGH: "优先",
  URGENT: "紧急"
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

function getPriorityTagClass(priority: OpsTaskPriority) {
  return priority === "URGENT" ? "tag" : priority === "HIGH" ? "tag tag-navy" : "tag tag-success";
}

export function OpsTasksPanel({
  tasks,
  status,
  loading = false,
  retryingTaskId = null,
  resolvingTaskId = null,
  onStatusChange,
  onRetry,
  onResolve
}: OpsTasksPanelProps) {
  const [statusDraft, setStatusDraft] = useState<OpsTaskStatus>(status);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setStatusDraft(status);
  }, [status]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    tasks.forEach((task) => {
      nextDrafts[task._id] = task.resolutionNote ?? "";
    });
    setNoteDrafts(nextDrafts);
  }, [tasks]);

  const urgentCount = useMemo(() => tasks.filter((task) => task.priority === "URGENT").length, [tasks]);
  const retryableCount = useMemo(
    () => tasks.filter((task) => task.status === "OPEN" && task.priority !== "URGENT").length,
    [tasks]
  );

  return (
    <div className="section-stack">
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-kicker">当前列表</div>
          <div className="summary-value">{tasks.length}</div>
          <div className="summary-footnote">当前结果</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">需人工复核</div>
          <div className="summary-value">{urgentCount}</div>
          <div className="summary-footnote">优先处理</div>
        </div>
        <div className="summary-card">
          <div className="summary-kicker">可直接重试</div>
          <div className="summary-value">{retryableCount}</div>
          <div className="summary-footnote">可直接重试</div>
        </div>
      </div>

      <div className="row-card stack">
        <div className="card-title-block">
          <div className="section-eyebrow">处理方式</div>
          <h3 className="section-title">异常处理</h3>
          <p className="subtle">先看待处理，再决定重试或关闭。</p>
        </div>

        <div className="field-grid">
          <label className="field-label" htmlFor="ops-task-status-filter">
            查看范围
            <select
              id="ops-task-status-filter"
              className="field"
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value as OpsTaskStatus)}
            >
              <option value="OPEN">待处理</option>
              <option value="RESOLVED">已处理</option>
              <option value="IGNORED">已忽略</option>
            </select>
          </label>
        </div>

        <div className="button-row">
          <button className="button button-primary" disabled={loading} type="button" onClick={() => void onStatusChange(statusDraft)}>
            {loading ? "加载中..." : "刷新事项"}
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="tag tag-success">{STATUS_LABELS[status]}</div>
          <h3 className="section-title">当前没有事项</h3>
          <p className="subtle">
            {status === "OPEN" ? "当前没有异常。" : "可以切回待处理再看。"}
          </p>
        </div>
      ) : (
        <div className="feedback-card-list">
          {tasks.map((task) => {
            const noteValue = noteDrafts[task._id] ?? "";
            const isBusy = retryingTaskId === task._id || resolvingTaskId === task._id;
            const isOpen = task.status === "OPEN";

            return (
              <div className="row-card feedback-card" key={task._id}>
                <div className="card-header feedback-card-header">
                  <div className="card-title-block">
                    <div className="inline-tags">
                      <div className={getPriorityTagClass(task.priority)}>{PRIORITY_LABELS[task.priority]}</div>
                      <div className="tag tag-navy">{STATUS_LABELS[task.status]}</div>
                      <div className="tag">{task.taskType === "ORDER_VISIT_SETTLEMENT" ? "订单结算" : task.taskType}</div>
                    </div>
                    <h3 className="section-title">{task.title}</h3>
                    <p className="subtle">{task.description}</p>
                  </div>
                </div>

                <div className="data-points">
                  <div className="data-point">
                    <span className="data-label">订单号</span>
                    <span className="data-value">{task.orderNo || "未记录"}</span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">会员</span>
                    <span className="data-value">{task.memberCode || task.memberId || "未记录"}</span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">错误码</span>
                    <span className="data-value">{task.lastErrorCode || "未记录"}</span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">触发时间</span>
                    <span className="data-value">{formatDateTime(task.lastTriggeredAt)}</span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">最近重试</span>
                    <span className="data-value">{formatDateTime(task.lastRetriedAt)}</span>
                  </div>
                  <div className="data-point">
                    <span className="data-label">重试次数</span>
                    <span className="data-value">{task.retryCount}</span>
                  </div>
                </div>

                <label className="field-label" htmlFor={`ops-task-note-${task._id}`}>
                  处理备注
                  <textarea
                    id={`ops-task-note-${task._id}`}
                    className="textarea"
                    placeholder="可选"
                    value={noteValue}
                    onChange={(event) =>
                      setNoteDrafts((current) => ({
                        ...current,
                        [task._id]: event.target.value
                      }))
                    }
                  />
                </label>

                <div className="button-row">
                  {isOpen ? (
                    <>
                      <button
                        className="button button-primary"
                        disabled={isBusy}
                        type="button"
                        onClick={() => void onRetry(task._id)}
                      >
                        {retryingTaskId === task._id ? "重试中..." : "立即重试"}
                      </button>
                      <button
                        className="button button-secondary"
                        disabled={isBusy}
                        type="button"
                        onClick={() =>
                          void onResolve({
                            taskId: task._id,
                            action: "RESOLVE",
                            note: noteValue.trim()
                          })
                        }
                      >
                        {resolvingTaskId === task._id ? "提交中..." : "人工确认已处理"}
                      </button>
                      <button
                        className="button button-danger"
                        disabled={isBusy}
                        type="button"
                        onClick={() =>
                          void onResolve({
                            taskId: task._id,
                            action: "IGNORE",
                            note: noteValue.trim()
                          })
                        }
                      >
                        {resolvingTaskId === task._id ? "提交中..." : "忽略事项"}
                      </button>
                    </>
                  ) : (
                    <div className="toolbar-pill">
                      {task.resolutionNote || "已关闭"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

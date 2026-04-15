import { useState, type FormEvent } from "react";
import type { StaffUser } from "@restaurant/shared";

interface StaffPanelProps {
  creating?: boolean;
  currentStaffId: string;
  passwordUpdatingStaffId?: string | null;
  staffUsers: Array<Omit<StaffUser, "passwordHash">>;
  togglingStaffId?: string | null;
  onCreate: (payload: {
    username: string;
    password: string;
    displayName: string;
    isEnabled: boolean;
  }) => Promise<void>;
  onToggle: (payload: {
    _id: string;
    username: string;
    displayName: string;
    role: "OWNER" | "STAFF";
    isEnabled: boolean;
  }) => Promise<void>;
  onUpdatePassword: (payload: {
    _id: string;
    username: string;
    password: string;
    displayName: string;
    role: "OWNER" | "STAFF";
  }) => Promise<void>;
}

const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;

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

function maskMiniOpenId(value?: string) {
  if (!value) {
    return "首次小程序登录后自动绑定";
  }
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function getUsernameError(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "请输入登录账号。";
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return "账号仅支持字母、数字、-、_，长度 4-32 位。";
  }
  return "";
}

function getPasswordError(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "请输入密码。";
  }
  if (normalized.length < MIN_PASSWORD_LENGTH) {
    return `密码至少 ${MIN_PASSWORD_LENGTH} 位。`;
  }
  return "";
}

export function StaffPanel({
  creating = false,
  currentStaffId,
  passwordUpdatingStaffId = null,
  staffUsers,
  togglingStaffId = null,
  onCreate,
  onToggle,
  onUpdatePassword
}: StaffPanelProps) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    displayName: ""
  });
  const [ownerPassword, setOwnerPassword] = useState("");
  const [staffPasswordDrafts, setStaffPasswordDrafts] = useState<Record<string, string>>({});
  const ownerUsers = staffUsers.filter((item) => item.role === "OWNER");
  const cashierUsers = staffUsers.filter((item) => item.role === "STAFF");
  const ownerCount = staffUsers.filter((item) => item.role === "OWNER").length;
  const staffCount = staffUsers.filter((item) => item.role === "STAFF").length;
  const enabledCount = staffUsers.filter((item) => item.isEnabled).length;
  const boundCount = staffUsers.filter((item) => Boolean(item.miniOpenId)).length;
  const usernameError = getUsernameError(form.username);
  const createPasswordError = getPasswordError(form.password);
  const ownerPasswordError = getPasswordError(ownerPassword);
  const shouldShowCreateError = Boolean(form.username || form.password || form.displayName);
  const canSubmit = Boolean(form.displayName.trim()) && !usernameError && !createPasswordError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    await onCreate({
      username: form.username.trim(),
      password: form.password.trim(),
      displayName: form.displayName.trim(),
      isEnabled: true
    });
    setForm({
      username: "",
      password: "",
      displayName: ""
    });
  }

  async function handleOwnerPasswordSubmit(staff: Omit<StaffUser, "passwordHash">) {
    const nextPassword = ownerPassword.trim();
    if (getPasswordError(nextPassword)) {
      return;
    }

    await onUpdatePassword({
      _id: staff._id,
      username: staff.username,
      password: nextPassword,
      displayName: staff.displayName,
      role: staff.role
    });
    setOwnerPassword("");
  }

  async function handleStaffPasswordReset(staff: Omit<StaffUser, "passwordHash">) {
    const nextPassword = (staffPasswordDrafts[staff._id] || "").trim();
    if (getPasswordError(nextPassword)) {
      return;
    }

    await onUpdatePassword({
      _id: staff._id,
      username: staff.username,
      password: nextPassword,
      displayName: staff.displayName,
      role: staff.role
    });
    setStaffPasswordDrafts((current) => ({
      ...current,
      [staff._id]: ""
    }));
  }

  return (
    <div className="section-stack">
      <div className="metric-grid compact-metric-grid">
        <div className="metric-card compact-metric-card">
          <div className="tag tag-navy">后台账号</div>
          <div className="metric-value metric-value-compact">{ownerCount}</div>
          <div className="metric-footnote">Web 登录</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag tag-navy">店员账号</div>
          <div className="metric-value metric-value-compact">{staffCount}</div>
          <div className="metric-footnote">小程序登录</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag tag-success">已启用</div>
          <div className="metric-value metric-value-compact">{enabledCount}</div>
          <div className="metric-footnote">当前可登录</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag">已绑微信</div>
          <div className="metric-value metric-value-compact">{boundCount}</div>
          <div className="metric-footnote">首次登录自动绑定</div>
        </div>
      </div>

      <div className="row-card section-banner">
        <div className="card-title-block">
          <div className="inline-tags">
            <div className="tag tag-navy">账号分工</div>
            <div className="tag">网页后台</div>
            <div className="tag">店员小程序</div>
          </div>
          <h3 className="section-title">登录说明</h3>
          <p className="subtle">老板用网页，店员用小程序。</p>
        </div>
        <div className="guide-list">
          <div className="guide-item">
            <div className="guide-index">01</div>
            <div className="stack">
              <strong>先创建店员账号</strong>
                <p className="subtle tiny">建议单人单号。</p>
            </div>
          </div>
          <div className="guide-item">
            <div className="guide-index">02</div>
            <div className="stack">
              <strong>首次登录后自动绑定微信</strong>
              <p className="subtle tiny">用本人微信登录即可。</p>
            </div>
          </div>
          <div className="guide-item">
            <div className="guide-index">03</div>
            <div className="stack">
              <strong>离职或换岗时停用账号</strong>
              <p className="subtle tiny">历史记录会保留。</p>
            </div>
          </div>
        </div>
      </div>

      <div className="split staff-panel-grid">
        <div className="section-stack">
          <form className="row-card stack" onSubmit={handleSubmit}>
            <div className="card-title-block">
              <div className="inline-tags">
                <div className="tag tag-navy">新建账号</div>
                <div className="tag">店员专用</div>
              </div>
              <h3 className="section-title">新增店员账号</h3>
              <p className="subtle">供店员登录小程序。</p>
            </div>

            <div className="field-grid">
              <label className="field-label" htmlFor="staff-username">
                登录账号
                <input
                  id="staff-username"
                  className="field"
                  disabled={creating}
                  placeholder="例如 cashier01"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <span className="field-hint">字母、数字、-、_，长度 4-32 位。</span>
              </label>

              <label className="field-label" htmlFor="staff-password">
                初始密码
                <input
                  id="staff-password"
                  autoComplete="new-password"
                  className="field"
                  disabled={creating}
                  placeholder="请输入临时密码"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <span className="field-hint">建议至少 8 位，交接后让店员尽快改密。</span>
              </label>
            </div>

            <div className="field-grid">
              <label className="field-label" htmlFor="staff-display-name">
                显示名称
                <input
                  id="staff-display-name"
                  className="field"
                  disabled={creating}
                  placeholder="例如 前台小王"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </label>

              <div className="field-label">
                账号角色
                <div className="field static-field">店员</div>
              </div>
            </div>

            {shouldShowCreateError && (usernameError || createPasswordError) ? (
              <div className="error" role="alert">
                {usernameError || createPasswordError}
              </div>
            ) : (
              <div className="notice">建议单人单号</div>
            )}

            <div className="button-row">
              <button className="button button-primary" disabled={!canSubmit || creating} type="submit">
                {creating ? "创建中..." : "创建账号"}
              </button>
            </div>
          </form>

          <div className="row-card stack">
            <div className="card-title-block">
              <div className="tag">交接给店员</div>
              <h3 className="section-title">使用流程</h3>
              <p className="subtle">按下面做就行。</p>
            </div>

            <div className="guide-list">
              <div className="guide-item">
              <div className="guide-index">A</div>
              <div className="stack">
                <strong>把账号和临时密码发给店员</strong>
                <p className="subtle tiny">提醒走小程序登录。</p>
              </div>
            </div>
              <div className="guide-item">
                <div className="guide-index">B</div>
                <div className="stack">
                  <strong>让店员用本人微信首次登录</strong>
                  <p className="subtle tiny">首次成功后自动绑定。</p>
                </div>
              </div>
              <div className="guide-item">
                <div className="guide-index">C</div>
              <div className="stack">
                <strong>班次调整时只做启用或停用</strong>
                <p className="subtle tiny">不建议共用账号。</p>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="section-stack">
          <section className="account-section">
            <div className="account-section-header">
              <div className="card-title-block">
                <div className="section-eyebrow">网页登录账号</div>
                <h3 className="section-title">当前后台账号</h3>
                  <p className="subtle">用于网页登录。</p>
              </div>
            </div>

            <div className="card-list">
              {ownerUsers.map((staff) => (
                <div className="row-card" key={staff._id}>
                  <div className="card-header">
                    <div className="card-title-block">
                      <div className="inline-tags">
                        <div className="tag tag-navy">网页登录</div>
                        <div className="tag tag-success">{staff._id === currentStaffId ? "当前登录" : "可用账号"}</div>
                      </div>
                      <h3 className="section-title">{staff.displayName}</h3>
                      <p className="subtle">{staff.username}</p>
                    </div>
                    <div className={staff.miniOpenId ? "tag tag-success" : "tag"}>
                      {staff.miniOpenId ? "微信已绑定" : "待微信绑定"}
                    </div>
                  </div>

                  <div className="data-points">
                    <div className="data-point">
                      <span className="data-label">登录入口</span>
                      <span className="data-value">Web 后台</span>
                    </div>
                    <div className="data-point">
                      <span className="data-label">微信绑定</span>
                      <span className="data-value">{maskMiniOpenId(staff.miniOpenId)}</span>
                    </div>
                    <div className="data-point">
                      <span className="data-label">创建时间</span>
                      <span className="data-value">{formatDateTime(staff.createdAt)}</span>
                    </div>
                  </div>

                  {staff._id === currentStaffId ? (
                    <div className="stack">
                      <div className="field-grid">
                        <label className="field-label" htmlFor={`owner-password-${staff._id}`}>
                          新登录密码
                          <input
                            id={`owner-password-${staff._id}`}
                            autoComplete="new-password"
                            className="field"
                            disabled={passwordUpdatingStaffId === staff._id}
                            placeholder="请输入新的后台密码"
                            type="password"
                            value={ownerPassword}
                            onChange={(event) => setOwnerPassword(event.target.value)}
                          />
                          <span className="field-hint">密码至少 8 位。</span>
                        </label>
                      </div>

                      {ownerPassword.trim() && ownerPasswordError ? (
                        <div className="error" role="alert">
                          {ownerPasswordError}
                        </div>
                      ) : null}

                      <div className="button-row">
                        <button
                          className="button button-primary"
                          disabled={!ownerPassword.trim() || Boolean(ownerPasswordError) || passwordUpdatingStaffId === staff._id}
                          onClick={() => void handleOwnerPasswordSubmit(staff)}
                          type="button"
                        >
                          {passwordUpdatingStaffId === staff._id ? "更新中..." : "更新主账号密码"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <p className="subtle tiny">建议定期更新网页登录密码。</p>
                </div>
              ))}
            </div>
          </section>

          <section className="account-section">
            <div className="account-section-header">
              <div className="card-title-block">
                <div className="section-eyebrow">店员账号</div>
                  <h3 className="section-title">店员账号</h3>
                  <p className="subtle">可重置密码或停用。</p>
              </div>
              <div className="inline-tags">
                <div className="tag">{cashierUsers.length} 个账号</div>
                <div className="tag tag-success">{cashierUsers.filter((staff) => staff.isEnabled).length} 个启用中</div>
              </div>
            </div>

            {cashierUsers.length === 0 ? (
              <div className="empty-state">
                <div className="tag tag-navy">暂无店员</div>
                <h3 className="section-title">先创建一个店员账号</h3>
                <p className="subtle">创建后就能登录小程序。</p>
              </div>
            ) : null}

            <div className="card-list">
              {cashierUsers.map((staff) => (
                <div className="row-card" key={staff._id}>
                  <div className="card-header">
                    <div className="card-title-block">
                      <div className="inline-tags">
                        <div className="tag">店员</div>
                        <div className={staff.isEnabled ? "tag tag-success" : "tag tag-navy"}>{staff.isEnabled ? "已启用" : "已停用"}</div>
                      </div>
                      <h3 className="section-title">{staff.displayName}</h3>
                      <p className="subtle">{staff.username}</p>
                    </div>
                    <div className={staff.miniOpenId ? "tag tag-success" : "tag"}>
                      {staff.miniOpenId ? "微信已绑定" : "待微信绑定"}
                    </div>
                  </div>

                  <div className="data-points">
                    <div className="data-point">
                      <span className="data-label">登录入口</span>
                      <span className="data-value">小程序店员端</span>
                    </div>
                    <div className="data-point">
                      <span className="data-label">微信绑定</span>
                      <span className="data-value">{maskMiniOpenId(staff.miniOpenId)}</span>
                    </div>
                    <div className="data-point">
                      <span className="data-label">创建时间</span>
                      <span className="data-value">{formatDateTime(staff.createdAt)}</span>
                    </div>
                  </div>

                  <div className="field-grid">
                    <label className="field-label" htmlFor={`staff-password-reset-${staff._id}`}>
                      重置临时密码
                      <input
                        id={`staff-password-reset-${staff._id}`}
                        autoComplete="new-password"
                        className="field"
                        disabled={passwordUpdatingStaffId === staff._id}
                        placeholder="请输入新的临时密码"
                        type="password"
                        value={staffPasswordDrafts[staff._id] || ""}
                        onChange={(event) =>
                          setStaffPasswordDrafts((current) => ({
                            ...current,
                            [staff._id]: event.target.value
                          }))
                        }
                      />
                      <span className="field-hint">密码至少 8 位。</span>
                    </label>
                  </div>

                  {(staffPasswordDrafts[staff._id] || "").trim() &&
                  getPasswordError(staffPasswordDrafts[staff._id] || "") ? (
                    <div className="error" role="alert">
                      {getPasswordError(staffPasswordDrafts[staff._id] || "")}
                    </div>
                  ) : null}

                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      disabled={
                        !(staffPasswordDrafts[staff._id] || "").trim() ||
                        Boolean(getPasswordError(staffPasswordDrafts[staff._id] || "")) ||
                        passwordUpdatingStaffId === staff._id
                      }
                      onClick={() => void handleStaffPasswordReset(staff)}
                      type="button"
                    >
                      {passwordUpdatingStaffId === staff._id ? "重置中..." : "重置密码"}
                    </button>
                    <button
                      className={staff.isEnabled ? "button button-danger" : "button button-secondary"}
                      disabled={togglingStaffId === staff._id}
                      onClick={() =>
                        onToggle({
                          _id: staff._id,
                          username: staff.username,
                          displayName: staff.displayName,
                          role: staff.role,
                          isEnabled: !staff.isEnabled
                        })
                      }
                      type="button"
                    >
                      {togglingStaffId === staff._id ? "提交中..." : staff.isEnabled ? "停用账号" : "启用账号"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

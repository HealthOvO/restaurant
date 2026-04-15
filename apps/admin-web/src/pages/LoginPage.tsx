import { useEffect, useState, type FormEvent } from "react";

type SetupMode = "login" | "bootstrap";

interface LoginPageProps {
  loginLoading: boolean;
  bootstrapLoading: boolean;
  loginErrorMessage: string;
  bootstrapErrorMessage: string;
  noticeMessage: string;
  onLogin: (username: string, password: string, storeId: string) => Promise<void>;
  onBootstrap: (payload: {
    storeId: string;
    secret: string;
    ownerUsername: string;
    ownerPassword: string;
    ownerDisplayName?: string;
    accessScope?: "STORE_ONLY" | "ALL_STORES";
    managedStoreIds?: string[];
  }) => Promise<void>;
}

function parseManagedStoreIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,，]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function LoginPage({
  loginLoading,
  bootstrapLoading,
  loginErrorMessage,
  bootstrapErrorMessage,
  noticeMessage,
  onLogin,
  onBootstrap
}: LoginPageProps) {
  const [mode, setMode] = useState<SetupMode>("login");
  const [storeId, setStoreId] = useState("default-store");
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("owner");
  const [ownerDisplayName, setOwnerDisplayName] = useState("老板");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState("");
  const [accessScope, setAccessScope] = useState<"STORE_ONLY" | "ALL_STORES">("STORE_ONLY");
  const [managedStoreIdsText, setManagedStoreIdsText] = useState("");
  const [localBootstrapError, setLocalBootstrapError] = useState("");
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);

  useEffect(() => {
    if (noticeMessage) {
      setMode("login");
      setLocalBootstrapError("");
      setShowAdvancedSetup(false);
    }
  }, [noticeMessage]);

  function clearLocalBootstrapError() {
    if (localBootstrapError) {
      setLocalBootstrapError("");
    }
  }

  function handleModeChange(nextMode: SetupMode) {
    setMode(nextMode);
    clearLocalBootstrapError();
    if (nextMode !== "bootstrap") {
      setShowAdvancedSetup(false);
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(username.trim(), password, storeId.trim() || "default-store");
  }

  async function handleBootstrapSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedStoreId = storeId.trim() || "default-store";
    const trimmedOwnerUsername = ownerUsername.trim();
    const trimmedOwnerDisplayName = ownerDisplayName.trim();

    if (!bootstrapSecret.trim()) {
      setLocalBootstrapError("请输入初始化口令");
      return;
    }

    if (!trimmedOwnerUsername) {
      setLocalBootstrapError("请输入老板账号");
      return;
    }

    if (ownerPassword.length < 6) {
      setLocalBootstrapError("老板密码至少 6 位");
      return;
    }

    if (ownerPassword !== ownerPasswordConfirm) {
      setLocalBootstrapError("两次输入的密码不一致");
      return;
    }

    setLocalBootstrapError("");
    setUsername(trimmedOwnerUsername);
    setPassword(ownerPassword);

    await onBootstrap({
      storeId: trimmedStoreId,
      secret: bootstrapSecret.trim(),
      ownerUsername: trimmedOwnerUsername,
      ownerPassword: ownerPassword,
      ownerDisplayName: trimmedOwnerDisplayName || undefined,
      accessScope,
      managedStoreIds: accessScope === "ALL_STORES" ? parseManagedStoreIds(managedStoreIdsText) : []
    });
  }

  const activeErrorMessage = mode === "login" ? loginErrorMessage : localBootstrapError || bootstrapErrorMessage;

  return (
    <div className="app-shell">
      <div className="login-shell">
        <section className="panel login-story stack">
          <div className="login-story-grid">
            <div className="brand-mark">店长后台</div>
            <div className="stack">
              <p className="section-eyebrow">门店后台</p>
              <h1 className="headline">老板后台</h1>
              <p className="subtle login-story-lead">看订单、会员、菜单和员工。</p>
            </div>

            <div className="login-stat-strip">
              <div className="login-stat-card">
                <div className="summary-kicker">老板</div>
                <div className="summary-value summary-value-text">网页登录</div>
                <div className="summary-footnote">看经营数据和门店设置。</div>
              </div>
              <div className="login-stat-card">
                <div className="summary-kicker">店员</div>
                <div className="summary-value summary-value-text">小程序登录</div>
                <div className="summary-footnote">核销、查会员、处理订单。</div>
              </div>
              <div className="login-stat-card">
                <div className="summary-kicker">首次使用</div>
                <div className="summary-value summary-value-text">先开通老板账号</div>
                <div className="summary-footnote">新环境只做一次。</div>
              </div>
            </div>

            <div className="story-step-list">
              <div className="story-step-item">
                <div className="story-step-index">01</div>
                <div className="stack">
                  <div className="section-title">先开通老板账号</div>
                  <p className="subtle">填写初始化口令、账号和密码就行，单店默认不用改高级项。</p>
                </div>
              </div>
              <div className="story-step-item">
                <div className="story-step-index">02</div>
                <div className="stack">
                  <div className="section-title">再把门店配起来</div>
                  <p className="subtle">先配菜单、积分和兑换规则，再建店员账号。</p>
                </div>
              </div>
              <div className="story-step-item">
                <div className="story-step-index">03</div>
                <div className="stack">
                  <div className="section-title">最后让店员登录</div>
                  <p className="subtle">店员在小程序里登录，处理订单、核销和查会员。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel login-form stack">
          <div className="stack">
            <p className="section-eyebrow">入口</p>
            <h2 className="headline">登录后台</h2>
            <p className="subtle">老板在这里登录，店员请到小程序。</p>
          </div>

          <div className="login-mode-switch" role="tablist" aria-label="后台入口模式">
            <button
              className={`login-mode-button ${mode === "login" ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => handleModeChange("login")}
            >
              登录
            </button>
            <button
              className={`login-mode-button ${mode === "bootstrap" ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "bootstrap"}
              onClick={() => handleModeChange("bootstrap")}
            >
              首次初始化
            </button>
          </div>

          {noticeMessage ? (
            <div className="login-callout" role="status">
              <div className="inline-tags">
                <div className="tag tag-success">已处理</div>
              </div>
              <p className="subtle">{noticeMessage}</p>
              <div className="guide-list">
                <div className="guide-item">
                  <div className="guide-index">1</div>
                  <div className="stack">
                    <div className="section-title">先配菜单</div>
                    <p className="subtle">把分类、菜品和规格补齐，顾客端点餐才会完整。</p>
                  </div>
                </div>
                <div className="guide-item">
                  <div className="guide-index">2</div>
                  <div className="stack">
                    <div className="section-title">再建店员账号</div>
                    <p className="subtle">店员用小程序登录，不用进老板后台。</p>
                  </div>
                </div>
                <div className="guide-item">
                  <div className="guide-index">3</div>
                  <div className="stack">
                    <div className="section-title">最后开规则</div>
                    <p className="subtle">确认积分、首单礼和兑换项后，再给门店正式使用。</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {mode === "login" ? (
            <form className="stack" onSubmit={handleLoginSubmit}>
              <label className="field-label" htmlFor="admin-store-id">
                门店编号
                <input
                  id="admin-store-id"
                  className="field"
                  placeholder="例如 default-store"
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                />
                <span className="field-hint">单店一般保持 `default-store`。</span>
              </label>

              <label className="field-label" htmlFor="admin-username">
                账号
                <input
                  id="admin-username"
                  autoComplete="username"
                  className="field"
                  placeholder="请输入账号"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>

              <label className="field-label" htmlFor="admin-password">
                密码
                <input
                  id="admin-password"
                  autoComplete="current-password"
                  className="field"
                  placeholder="请输入密码"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {activeErrorMessage ? (
                <div className="error" role="alert">
                  {activeErrorMessage}
                </div>
              ) : null}

              <div className="login-callout">
                <div className="inline-tags">
                  <div className="tag tag-navy">网页登录</div>
                  <div className="tag">店员去小程序</div>
                </div>
                <p className="subtle">新环境再切到“首次初始化”。</p>
              </div>

              <div className="button-row">
                <button className="button button-primary" disabled={loginLoading} type="submit">
                  {loginLoading ? "登录中..." : "进入后台"}
                </button>
                <div className="login-submit-note">店员请到小程序登录</div>
              </div>
            </form>
          ) : (
            <form className="stack" onSubmit={handleBootstrapSubmit}>
              <div className="login-callout">
                <div className="inline-tags">
                  <div className="tag tag-accent">默认按单店开通</div>
                  <div className="tag">高级项可稍后再开</div>
                </div>
                <p className="subtle">先把老板账号建起来，跨店和门店编号需要时再展开高级设置。</p>
              </div>

              <label className="field-label" htmlFor="bootstrap-secret">
                初始化口令
                <input
                  id="bootstrap-secret"
                  className="field"
                  placeholder="请输入初始化口令"
                  type="password"
                  value={bootstrapSecret}
                  onChange={(event) => {
                    clearLocalBootstrapError();
                    setBootstrapSecret(event.target.value);
                  }}
                />
              </label>

              <div className="field-grid">
                <label className="field-label" htmlFor="bootstrap-owner-username">
                  老板账号
                  <input
                    id="bootstrap-owner-username"
                    className="field"
                    placeholder="例如 owner"
                    value={ownerUsername}
                    onChange={(event) => {
                      clearLocalBootstrapError();
                      setOwnerUsername(event.target.value);
                    }}
                  />
                </label>

                <label className="field-label" htmlFor="bootstrap-owner-display-name">
                  显示名称
                  <input
                    id="bootstrap-owner-display-name"
                    className="field"
                    placeholder="例如 店长"
                    value={ownerDisplayName}
                    onChange={(event) => {
                      clearLocalBootstrapError();
                      setOwnerDisplayName(event.target.value);
                    }}
                  />
                </label>
              </div>

              <div className="field-grid">
                <label className="field-label" htmlFor="bootstrap-owner-password">
                  老板密码
                  <input
                    id="bootstrap-owner-password"
                    className="field"
                    placeholder="至少 6 位"
                    type="password"
                    value={ownerPassword}
                    onChange={(event) => {
                      clearLocalBootstrapError();
                      setOwnerPassword(event.target.value);
                    }}
                  />
                </label>

                <label className="field-label" htmlFor="bootstrap-owner-password-confirm">
                  确认密码
                  <input
                    id="bootstrap-owner-password-confirm"
                    className="field"
                    placeholder="再输一次"
                    type="password"
                    value={ownerPasswordConfirm}
                    onChange={(event) => {
                      clearLocalBootstrapError();
                      setOwnerPasswordConfirm(event.target.value);
                    }}
                  />
                </label>
              </div>

              <div className="button-row">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setShowAdvancedSetup((current) => !current)}
                >
                  {showAdvancedSetup ? "收起高级设置" : "展开高级设置"}
                </button>
              </div>

              {showAdvancedSetup ? (
                <div className="login-setup-box">
                  <div className="section-title">高级设置</div>
                  <p className="subtle">多店或总店账号再改这里，单店保持默认即可。</p>

                  <div className="field-grid">
                    <label className="field-label" htmlFor="bootstrap-store-id">
                      门店编号
                      <input
                        id="bootstrap-store-id"
                        className="field"
                        placeholder="例如 default-store"
                        value={storeId}
                        onChange={(event) => {
                          clearLocalBootstrapError();
                          setStoreId(event.target.value);
                        }}
                      />
                    </label>

                    <label className="field-label" htmlFor="bootstrap-access-scope">
                      权限范围
                      <select
                        id="bootstrap-access-scope"
                        className="field"
                        value={accessScope}
                        onChange={(event) => {
                          clearLocalBootstrapError();
                          setAccessScope(event.target.value as "STORE_ONLY" | "ALL_STORES");
                        }}
                      >
                        <option value="STORE_ONLY">仅当前门店</option>
                        <option value="ALL_STORES">总店，可切店</option>
                      </select>
                    </label>
                  </div>

                  <label className="field-label" htmlFor="bootstrap-managed-store-ids">
                    可管理门店
                    <input
                      id="bootstrap-managed-store-ids"
                      className="field"
                      placeholder="branch-01, branch-02"
                      value={managedStoreIdsText}
                      disabled={accessScope !== "ALL_STORES"}
                      onChange={(event) => {
                        clearLocalBootstrapError();
                        setManagedStoreIdsText(event.target.value);
                      }}
                    />
                    <span className="field-hint">只在总店账号时填写，多个门店用空格或逗号分开。</span>
                  </label>
                </div>
              ) : null}

              {activeErrorMessage ? (
                <div className="error" role="alert">
                  {activeErrorMessage}
                </div>
              ) : null}

              <div className="login-callout">
                <div className="inline-tags">
                  <div className="tag tag-accent">仅首次使用</div>
                  <div className="tag">也可用于重置老板账号</div>
                </div>
                <p className="subtle">完成后会自动登录。</p>
              </div>

              <div className="button-row">
                <button className="button button-primary" disabled={bootstrapLoading} type="submit">
                  {bootstrapLoading ? "初始化中..." : "创建老板账号"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    if (noticeMessage) {
      setMode("login");
      setLocalBootstrapError("");
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
              <p className="subtle login-story-lead">规则、订单、会员、员工都在这里处理。</p>
            </div>

            <div className="login-stat-strip">
              <div className="login-stat-card">
                <div className="summary-kicker">老板</div>
                <div className="summary-value summary-value-text">电脑后台</div>
                <div className="summary-footnote">看数据、配规则、管账号。</div>
              </div>
              <div className="login-stat-card">
                <div className="summary-kicker">店员</div>
                <div className="summary-value summary-value-text">店员小程序</div>
                <div className="summary-footnote">核销、查会员、看订单。</div>
              </div>
              <div className="login-stat-card">
                <div className="summary-kicker">首次使用</div>
                <div className="summary-value summary-value-text">先初始化</div>
                <div className="summary-footnote">新环境先创建老板账号。</div>
              </div>
            </div>

            <div className="login-support-grid">
              <div className="story-item">
                <div className="section-title">门店编号</div>
                <p className="subtle">单店默认用 `default-store`，多店按门店编号切换。</p>
              </div>
              <div className="story-item">
                <div className="section-title">初始化口令</div>
                <p className="subtle">只在首次建老板账号或需要重置时使用，对应云函数环境变量 `BOOTSTRAP_SECRET`。</p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel login-form stack">
          <div className="stack">
            <p className="section-eyebrow">入口</p>
            <h2 className="headline">进入后台</h2>
            <p className="subtle">老板网页登录，店员走小程序。</p>
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
                  <div className="tag tag-navy">老板后台</div>
                  <div className="tag">店员不在这里登录</div>
                </div>
                <p className="subtle">如果是新环境，先切到“首次初始化”。</p>
              </div>

              <div className="button-row">
                <button className="button button-primary" disabled={loginLoading} type="submit">
                  {loginLoading ? "登录中..." : "进入后台"}
                </button>
                <div className="login-submit-note">店员请在小程序登录</div>
              </div>
            </form>
          ) : (
            <form className="stack" onSubmit={handleBootstrapSubmit}>
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

                <label className="field-label" htmlFor="bootstrap-secret">
                  初始化口令
                  <input
                    id="bootstrap-secret"
                    className="field"
                    placeholder="请输入 BOOTSTRAP_SECRET"
                    type="password"
                    value={bootstrapSecret}
                    onChange={(event) => {
                      clearLocalBootstrapError();
                      setBootstrapSecret(event.target.value);
                    }}
                  />
                </label>
              </div>

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
                    placeholder="例如 门店老板"
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

              <div className="login-setup-box">
                <div className="section-title">高级设置</div>
                <p className="subtle">单店不用改。总店账号才需要开启跨店查看。</p>

                <div className="field-grid">
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
                </label>
              </div>
              </div>

              {activeErrorMessage ? (
                <div className="error" role="alert">
                  {activeErrorMessage}
                </div>
              ) : null}

              <div className="login-callout">
                <div className="inline-tags">
                  <div className="tag tag-accent">仅首次使用</div>
                  <div className="tag">也可用于老板重置</div>
                </div>
                <p className="subtle">初始化完成后会自动尝试登录。</p>
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

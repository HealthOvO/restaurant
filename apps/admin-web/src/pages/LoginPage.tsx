import { useState, type FormEvent } from "react";

interface LoginPageProps {
  loading: boolean;
  errorMessage: string;
  onLogin: (username: string, password: string, storeId: string) => Promise<void>;
}

export function LoginPage({ loading, errorMessage, onLogin }: LoginPageProps) {
  const [storeId, setStoreId] = useState("default-store");
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(username, password, storeId.trim() || "default-store");
  }

  return (
    <div className="app-shell">
      <div className="login-shell">
        <section className="panel login-story stack">
          <div className="login-story-grid">
            <div className="brand-mark">会员积分后台</div>
            <div className="stack">
              <p className="section-eyebrow">Restaurant Growth Console</p>
              <h1 className="headline">会员增长、积分奖励和核销，在一张经营台面上完成。</h1>
              <p className="subtle login-story-lead">
                老板用网页后台看经营数据和配置规则，店员继续在小程序里核销、查会员和处理到店消费。
              </p>
            </div>

            <div className="login-stat-strip">
              <div className="login-stat-card">
                <div className="summary-kicker">后台入口</div>
                <div className="summary-value summary-value-text">老板网页登录</div>
                <div className="summary-footnote">配规则、查数据、看日志。</div>
              </div>
              <div className="login-stat-card">
                <div className="summary-kicker">门店入口</div>
                <div className="summary-value summary-value-text">店员小程序</div>
                <div className="summary-footnote">消费核销、菜券核销、查会员。</div>
              </div>
              <div className="login-stat-card">
                <div className="summary-kicker">运行保障</div>
                <div className="summary-value summary-value-text">关键操作留痕</div>
                <div className="summary-footnote">规则、账号、人工修正都有记录。</div>
              </div>
            </div>
          </div>

          <div className="login-support-grid">
            <div className="story-item story-item-highlight">
              <strong>今天先看三件事</strong>
              会员有没有新增、首单有没有被激活、积分和菜品券有没有正常入账。
            </div>
            <div className="story-item">
              <strong>老板和店员入口分开</strong>
              老板只进网页后台，店员只进小程序工作台。
            </div>
            <div className="story-item">
              <strong>上线前先跑一遍主流程</strong>
              邀请、首单礼、积分到账、扫码核销四段都走通，再交给门店营业。
            </div>
            <div className="story-item">
              <strong>总店和分店数据隔离</strong>
              总店账号后续可切换查看分店，分店账号始终只看自己门店。
            </div>
          </div>

          <div className="story-step-list">
            <div className="story-step-item">
              <div className="story-step-index">01</div>
              <div className="stack">
                <strong>先登录老板后台</strong>
                <p className="subtle">首次部署后先修改主账号密码，再检查规则是否可用。</p>
              </div>
            </div>
            <div className="story-step-item">
              <div className="story-step-index">02</div>
              <div className="stack">
                <strong>创建并启用店员账号</strong>
                <p className="subtle">店员账号只给小程序工作台使用，用于消费核销、菜品券核销和会员查询。</p>
              </div>
            </div>
            <div className="story-step-item">
              <div className="story-step-index">03</div>
              <div className="stack">
                <strong>用店员端跑一遍真实流程</strong>
                <p className="subtle">查会员、录订单、扫券核销各走一遍，正式营业前更稳。</p>
              </div>
            </div>
          </div>
        </section>

        <form className="panel login-form stack" onSubmit={handleSubmit}>
          <div className="stack">
            <p className="section-eyebrow">老板入口</p>
            <h2 className="headline">登录老板后台</h2>
            <p className="subtle">仅老板账号可登录网页后台；店员请在小程序端登录。首次部署后建议立即更新主账号密码。</p>
          </div>

          <div className="summary-grid login-summary-grid">
            <div className="summary-card">
              <div className="summary-kicker">当前入口</div>
              <div className="summary-value summary-value-text">老板网页登录</div>
              <div className="summary-footnote">规则配置、员工管理、审计日志都在这里。</div>
            </div>
            <div className="summary-card">
              <div className="summary-kicker">店员入口</div>
              <div className="summary-value summary-value-text">小程序工作台</div>
              <div className="summary-footnote">消费核销、券核销、会员查询都不在这个页面。</div>
            </div>
          </div>

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
              placeholder="请输入老板账号"
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

          {errorMessage ? (
            <div className="error" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="login-callout">
            <div className="inline-tags">
              <div className="tag tag-navy">首次开通建议</div>
              <div className="tag">先改主账号密码</div>
            </div>
            <p className="subtle">登录后先确认当前门店规则、员工账号和门店编号都配置正确。</p>
          </div>

          <div className="button-row">
            <button className="button button-primary" disabled={loading} type="submit">
              {loading ? "登录中..." : "进入后台"}
            </button>
            <div className="login-submit-note">首次登录后建议先创建店员账号</div>
          </div>

          <div className="login-help-grid">
            <div className="login-help-card">
              <div className="summary-kicker">老板登录后先做</div>
              <div className="summary-footnote">检查规则开关、创建店员账号、确认员工已能进小程序。</div>
            </div>
            <div className="login-help-card">
              <div className="summary-kicker">店员如果打不开后台</div>
              <div className="summary-footnote">这是正常的，店员应从微信小程序中的店员工作台登录。</div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

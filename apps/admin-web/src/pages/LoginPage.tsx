import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Soup } from "lucide-react";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";

export function LoginPage() {
  const { login, isMockMode, sessionNotice } = useMerchant();
  const [username, setUsername] = useState(isMockMode ? "owner" : "");
  const [password, setPassword] = useState(isMockMode ? "demo12345" : "");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-brand-panel" aria-label="后台介绍">
          <div className="login-brand-content">
            <header className="login-brand-header">
              <div className="login-brand-lockup">
                <span className="login-logo"><Soup size={23} aria-hidden="true" /></span>
                <span>
                  <strong>祯好七福鼎肉片</strong>
                  <small>商家后台</small>
                </span>
              </div>
              <span className="login-brand-tag">营业管理</span>
            </header>

            <div className="login-brand-copy">
              <p className="eyebrow">每天开摊，从这里开始</p>
              <h1>今天的订单，<br />都在这里。</h1>
              <p className="login-intro">查看新订单和取餐号，完成出餐，也可以随时调整商品。</p>
            </div>

            <p className="login-brand-footnote">新鲜现做 · 叫号取餐</p>
          </div>
        </section>

        <section className="login-form-panel">
          <form className="login-form" onSubmit={submit} noValidate>
            <div className="login-form-heading">
              <p className="eyebrow">老板账号</p>
              <h2>老板登录</h2>
              <p>登录后查看今天的订单。</p>
            </div>
            <div className="login-fields">
              <label className="field" htmlFor="merchant-username">
                <span>账号</span>
                <input id="merchant-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入账号" />
              </label>
              <label className="field" htmlFor="merchant-password">
                <span>密码</span>
                <span className="password-field">
                  <input id="merchant-password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="请输入密码" />
                  <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
            </div>
            {sessionNotice && <div className="inline-alert login-session-alert" role="status">{sessionNotice}</div>}
            {error && <div className="form-error" role="alert">{error}</div>}
            <Button type="submit" loading={loading} className="login-submit">登录</Button>
            <p className="session-note"><LockKeyhole size={14} aria-hidden="true" />账号信息仅用于本店后台</p>
            {isMockMode && <p className="dev-note">本地演示账号已填好</p>}
          </form>
        </section>
      </div>
    </main>
  );
}

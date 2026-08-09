import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Soup } from "lucide-react";
import { useMerchant } from "../app/MerchantContext";
import { Button } from "../components/Button";

export function LoginPage() {
  const { login, isMockMode } = useMerchant();
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
      <section className="login-brand-panel" aria-label="后台介绍">
        <div className="login-brand-content">
          <div className="login-logo"><Soup size={26} aria-hidden="true" /></div>
          <p className="eyebrow">阿福肉片</p>
          <h1>收单、出餐、配置，<br />都在一个地方。</h1>
          <p className="login-intro">新订单、取餐号和商品设置，一眼就能找到。</p>
          <div className="login-preview" aria-hidden="true">
            <div><span>103</span><p>福鼎肉片 × 2</p><strong>待出餐</strong></div>
            <div><span>102</span><p>商品券订单</p><strong>待出餐</strong></div>
          </div>
        </div>
      </section>
      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-form-heading">
            <span className="login-mobile-logo"><Soup size={22} aria-hidden="true" /></span>
            <p className="eyebrow">商家后台</p>
            <h2>欢迎回来</h2>
            <p>使用老板账号登录</p>
          </div>
          <label className="field">
            <span>账号</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入账号" />
          </label>
          <label className="field">
            <span>密码</span>
            <span className="password-field">
              <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="请输入密码" />
              <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <Button type="submit" loading={loading} className="login-submit"><LockKeyhole size={18} aria-hidden="true" />进入后台</Button>
          <p className="session-note">关闭浏览器后需要重新登录</p>
          {isMockMode && <p className="dev-note">本地演示账号已填好</p>}
        </form>
      </section>
    </main>
  );
}

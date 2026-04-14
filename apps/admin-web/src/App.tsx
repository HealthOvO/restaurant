import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { clearSession, loadSession, saveSession, type AdminSession } from "./lib/session";
import { bootstrapStoreOwner, login } from "./lib/api";

export function App() {
  const [session, setSession] = useState<AdminSession | null>(loadSession());
  const [loginErrorMessage, setLoginErrorMessage] = useState("");
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  useEffect(() => {
    if (session) {
      saveSession(session);
      return;
    }

    clearSession();
  }, [session]);

  async function handleLogin(username: string, password: string, storeId: string) {
    setLoginLoading(true);
    setLoginErrorMessage("");
    setBootstrapErrorMessage("");
    setNoticeMessage("");
    try {
      const response = await login(username, password, storeId);
      if (response.staff.role !== "OWNER") {
        throw new Error("店员账号请在小程序里登录，Web 后台当前仅开放给老板账号。");
      }
      setSession({
        sessionToken: response.sessionToken,
        staff: response.staff
      });
    } catch (error) {
      setLoginErrorMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleBootstrap(payload: {
    storeId: string;
    secret: string;
    ownerUsername: string;
    ownerPassword: string;
    ownerDisplayName?: string;
    accessScope?: "STORE_ONLY" | "ALL_STORES";
    managedStoreIds?: string[];
  }) {
    setBootstrapLoading(true);
    setBootstrapErrorMessage("");
    setLoginErrorMessage("");
    setNoticeMessage("");

    try {
      const result = await bootstrapStoreOwner(payload);
      const completedMessage = result.created ? "老板账号已创建" : "老板账号已更新";

      try {
        const response = await login(payload.ownerUsername, payload.ownerPassword, payload.storeId);
        if (response.staff.role !== "OWNER") {
          throw new Error("当前账号不是老板账号，请重新检查初始化信息。");
        }
        setSession({
          sessionToken: response.sessionToken,
          staff: response.staff
        });
      } catch (error) {
        setNoticeMessage(`${completedMessage}，请手动登录。`);
        setLoginErrorMessage(error instanceof Error ? error.message : "初始化成功，请返回登录");
      }
    } catch (error) {
      setBootstrapErrorMessage(error instanceof Error ? error.message : "初始化失败");
    } finally {
      setBootstrapLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setNoticeMessage("");
    setLoginErrorMessage("");
    setBootstrapErrorMessage("");
  }

  if (!session) {
    return (
      <LoginPage
        loginLoading={loginLoading}
        bootstrapLoading={bootstrapLoading}
        loginErrorMessage={loginErrorMessage}
        bootstrapErrorMessage={bootstrapErrorMessage}
        noticeMessage={noticeMessage}
        onLogin={handleLogin}
        onBootstrap={handleBootstrap}
      />
    );
  }

  return <DashboardPage session={session} onLogout={handleLogout} />;
}

import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { clearSession, loadSession, saveSession, type AdminSession } from "./lib/session";
import { login } from "./lib/api";

export function App() {
  const [session, setSession] = useState<AdminSession | null>(loadSession());
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      saveSession(session);
    }
  }, [session]);

  async function handleLogin(username: string, password: string, storeId: string) {
    setLoading(true);
    setErrorMessage("");
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
      setErrorMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
  }

  if (!session) {
    return <LoginPage loading={loading} errorMessage={errorMessage} onLogin={handleLogin} />;
  }

  return <DashboardPage session={session} onLogout={handleLogout} />;
}

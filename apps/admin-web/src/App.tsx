import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { MerchantProvider, useMerchant } from "./app/MerchantContext";
import { MerchantShell } from "./app/MerchantShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ExchangePage } from "./pages/ExchangePage";
import { MembersPage } from "./pages/MembersPage";
import { SettingsPage } from "./pages/SettingsPage";

function AppRoutes() {
  const { ready, session } = useMerchant();
  if (!ready) {
    return (
      <main className="app-loading" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>正在打开后台</p>
      </main>
    );
  }
  if (!session) return <LoginPage />;
  return (
    <Routes>
      <Route element={<MerchantShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/exchange" element={<ExchangePage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <MerchantProvider>
        <AppRoutes />
      </MerchantProvider>
    </HashRouter>
  );
}

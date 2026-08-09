import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  ChevronLeft,
  Menu,
  PackageOpen,
  ReceiptText,
  Settings,
  ShoppingBag,
  TicketPercent,
  Users,
  X
} from "lucide-react";
import { useMerchant } from "./MerchantContext";

const navigation = [
  { to: "/dashboard", label: "今日概览", icon: BarChart3 },
  { to: "/orders", label: "订单", icon: ReceiptText },
  { to: "/products", label: "商品", icon: ShoppingBag },
  { to: "/exchange", label: "兑换项", icon: TicketPercent },
  { to: "/members", label: "用户", icon: Users },
  { to: "/settings", label: "营业设置", icon: Settings }
];

export function MerchantShell() {
  const { session, logout } = useMerchant();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const active = navigation.find((item) => location.pathname.startsWith(item.to));

  return (
    <div className="merchant-layout">
      <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="后台导航">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><PackageOpen size={22} /></span>
          <div>
            <strong>阿福肉片</strong>
            <span>商家后台</span>
          </div>
          <button className="icon-button sidebar-close" type="button" aria-label="关闭导航" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link is-active" : "nav-link"}>
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="avatar" aria-hidden="true">{session?.owner.displayName.slice(0, 1)}</div>
          <div className="account-copy">
            <strong>{session?.owner.displayName}</strong>
            <span>老板账号</span>
          </div>
          <button className="icon-button" type="button" aria-label="退出登录" title="退出登录" onClick={logout}>
            <ChevronLeft size={19} />
          </button>
        </div>
      </aside>
      {open && <button className="sidebar-scrim" type="button" aria-label="关闭导航" onClick={() => setOpen(false)} />}
      <div className="workspace">
        <header className="mobile-header">
          <button className="icon-button" type="button" aria-label="打开导航" onClick={() => setOpen(true)}><Menu size={21} /></button>
          <strong>{active?.label ?? "商家后台"}</strong>
          <span className="mobile-header-spacer" />
        </header>
        <main className="workspace-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

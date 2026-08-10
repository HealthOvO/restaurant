import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BellRing,
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
  const { session, logout, newOrderNotice, dismissNewOrderNotice } = useMerchant();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const active = navigation.find((item) => location.pathname.startsWith(item.to));

  return (
    <div className="merchant-layout">
      <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="后台导航">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><PackageOpen size={22} /></span>
          <div>
            <strong>祯好七福鼎肉片</strong>
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
          {newOrderNotice && (
            <aside className="new-order-alert" role="alert" aria-live="assertive">
              <span className="new-order-alert-icon"><BellRing size={21} aria-hidden="true" /></span>
              <div>
                <strong>收到 {newOrderNotice.count} 笔新订单</strong>
                <span>{newOrderNotice.pickupNumbers.length ? `取餐号 ${newOrderNotice.pickupNumbers.join("、")}，已按下单时间排队` : "已放入待出餐队列"}</span>
              </div>
              <Link to="/orders" onClick={dismissNewOrderNotice}>查看订单<ArrowRight size={15} /></Link>
              <button className="icon-button" type="button" aria-label="关闭新单提醒" onClick={dismissNewOrderNotice}><X size={17} /></button>
            </aside>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_STORE_ID,
  type AuditLog,
  type FeedbackTicket,
  type MenuCategory,
  type MenuItem,
  type OpsTask,
  type OrderRecord,
  type OrderStatus,
  type OrderStatusLog,
  type PaginationMeta,
  type PointExchangeItem,
  type RewardRule,
  type StaffUser,
  type StoreConfig
} from "@restaurant/shared";
import {
  adjustBinding,
  adjustMemberPoints,
  createStaff,
  fetchFeedbackTickets,
  fetchAuditLogs,
  fetchDashboard,
  fetchMenuConfig,
  fetchOpsTasks,
  fetchOrderWorkbenchDetail,
  fetchOrders,
  fetchRules,
  listStaff,
  resolveOpsTask,
  retryOpsTask,
  saveRules,
  saveMenuConfig,
  searchMembers,
  updateFeedbackTicket,
  updateOrderWorkbenchStatus,
  updateStaffPassword,
  updateStaff,
  type MemberSearchRow
} from "../lib/api";
import type { AdminSession } from "../lib/session";
import { AuditPanel } from "../components/AuditPanel";
import { FeedbackPanel } from "../components/FeedbackPanel";
import { MemberSearchPanel } from "../components/MemberSearchPanel";
import { MetricCard } from "../components/MetricCard";
import { MenuPanel } from "../components/MenuPanel";
import { OpsTasksPanel } from "../components/OpsTasksPanel";
import { OrdersPanel } from "../components/OrdersPanel";
import { RulesEditor } from "../components/RulesEditor";
import { StaffPanel } from "../components/StaffPanel";
import { getErrorCode } from "../lib/cloudbase";

type TabKey = "overview" | "ops" | "menu" | "orders" | "members" | "rules" | "staff" | "feedback" | "audit";
type OrderWorkbenchActionStatus = "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
type RequestKey =
  | TabKey
  | "menuSave"
  | "membersSearch"
  | "orderDetail"
  | "ordersSearch"
  | "orderStatus"
  | "adjustBinding"
  | "adjustPoints"
  | "saveRules"
  | "createStaff"
  | "toggleStaff"
  | "updatePassword"
  | "updateFeedback"
  | "retryOpsTask"
  | "resolveOpsTask";

const NOTICE_TIMEOUT_MS = 2600;
const MEMBER_PAGE_SIZE = 8;
const ORDER_PAGE_SIZE = 8;
const EMPTY_STATS = {
  memberCount: 0,
  activatedInviteCount: 0,
  readyVoucherCount: 0,
  todayVisitCount: 0,
  openOpsTaskCount: 0,
  todayOrderCount: 0,
  todayRevenueAmount: 0,
  pendingConfirmOrderCount: 0,
  readyOrderCount: 0,
  todayPointsIssued: 0,
  todayPointsRedeemed: 0,
  todayVoucherRedeemedCount: 0,
  memberBenefitsSkippedOrderCount: 0
};
const EMPTY_TAB_FLAGS: Record<TabKey, boolean> = {
  overview: false,
  ops: false,
  menu: false,
  orders: false,
  members: false,
  rules: false,
  staff: false,
  feedback: false,
  audit: false
};
const EMPTY_MEMBER_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: MEMBER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  pageItemCount: 0,
  rangeStart: 0,
  rangeEnd: 0,
  hasPrevPage: false,
  hasNextPage: false
};
const EMPTY_ORDER_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: ORDER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  pageItemCount: 0,
  rangeStart: 0,
  rangeEnd: 0,
  hasPrevPage: false,
  hasNextPage: false
};
const EMPTY_STORE_CONFIG: StoreConfig = {
  _id: "store-config-empty",
  storeId: DEFAULT_STORE_ID,
  storeName: "门店",
  dineInEnabled: true,
  pickupEnabled: true,
  minOrderAmount: 0,
  createdAt: "",
  updatedAt: ""
};

function formatCurrencyAmount(value: number) {
  return `¥${Number(value || 0).toFixed(0)}`;
}

function buildRulesSavedNotice(summary: {
  enabledWelcomeRuleCount: number;
  enabledMilestoneRuleCount: number;
  repeatableMilestoneRuleCount: number;
  enabledExchangeItemCount: number;
}) {
  const milestoneText =
    summary.enabledMilestoneRuleCount > 0
      ? `邀请积分 ${summary.enabledMilestoneRuleCount} 条${
          summary.repeatableMilestoneRuleCount > 0 ? `（循环 ${summary.repeatableMilestoneRuleCount} 条）` : ""
        }`
      : "邀请积分 0 条";

  return `已保存：首单礼 ${summary.enabledWelcomeRuleCount} 条，${milestoneText}，兑换菜品 ${summary.enabledExchangeItemCount} 条`;
}

const TABS: Array<{ key: TabKey; label: string; summary: string }> = [
  { key: "overview", label: "数据概览", summary: "今天情况" },
  { key: "ops", label: "异常处理", summary: "异常和补单" },
  { key: "menu", label: "点餐菜单", summary: "菜单和规格" },
  { key: "orders", label: "订单工作台", summary: "查单改状态" },
  { key: "members", label: "会员管理", summary: "会员和积分" },
  { key: "rules", label: "奖励规则", summary: "积分和兑换" },
  { key: "staff", label: "员工账号", summary: "员工账号" },
  { key: "feedback", label: "用户反馈", summary: "问题回流" },
  { key: "audit", label: "审计日志", summary: "操作记录" }
];

export function DashboardPage({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const homeStoreId = session.staff.storeId || DEFAULT_STORE_ID;
  const accessibleStoreIds = Array.from(new Set([homeStoreId, ...(session.staff.managedStoreIds ?? [])].filter(Boolean)));
  const canSwitchStores = session.staff.accessScope === "ALL_STORES" && accessibleStoreIds.length > 1;
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedStoreId, setSelectedStoreId] = useState(homeStoreId);
  const currentStoreId = selectedStoreId || homeStoreId;
  const [stats, setStats] = useState(EMPTY_STATS);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(EMPTY_STORE_CONFIG);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [rules, setRulesState] = useState<RewardRule[]>([]);
  const [exchangeItems, setExchangeItems] = useState<PointExchangeItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [orderLogs, setOrderLogs] = useState<OrderStatusLog[]>([]);
  const [rows, setRows] = useState<MemberSearchRow[]>([]);
  const [staffUsers, setStaffUsers] = useState<Array<Omit<StaffUser, "passwordHash">>>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackTicket[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [opsTasks, setOpsTasks] = useState<OpsTask[]>([]);
  const [savingMenu, setSavingMenu] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingOrderDetail, setLoadingOrderDetail] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [hasAttemptedOrdersBootstrap, setHasAttemptedOrdersBootstrap] = useState(false);
  const [hasAttemptedMembersBootstrap, setHasAttemptedMembersBootstrap] = useState(false);
  const [loadingOpsTasks, setLoadingOpsTasks] = useState(false);
  const [opsStatusFilter, setOpsStatusFilter] = useState<OpsTask["status"]>("OPEN");
  const [updatingOrderStatus, setUpdatingOrderStatus] = useState<OrderWorkbenchActionStatus | null>(null);
  const [retryingOpsTaskId, setRetryingOpsTaskId] = useState<string | null>(null);
  const [resolvingOpsTaskId, setResolvingOpsTaskId] = useState<string | null>(null);
  const [adjustingBinding, setAdjustingBinding] = useState(false);
  const [adjustingPoints, setAdjustingPoints] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [togglingStaffId, setTogglingStaffId] = useState<string | null>(null);
  const [passwordUpdatingStaffId, setPasswordUpdatingStaffId] = useState<string | null>(null);
  const [updatingFeedbackId, setUpdatingFeedbackId] = useState<string | null>(null);
  const [hasSearchedOrders, setHasSearchedOrders] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [orderPagination, setOrderPagination] = useState<PaginationMeta>(EMPTY_ORDER_PAGINATION);
  const [hasSearchedMembers, setHasSearchedMembers] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberPagination, setMemberPagination] = useState<PaginationMeta>(EMPTY_MEMBER_PAGINATION);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [tabLoading, setTabLoading] = useState<Record<TabKey, boolean>>(EMPTY_TAB_FLAGS);
  const [tabLoaded, setTabLoaded] = useState<Record<TabKey, boolean>>(EMPTY_TAB_FLAGS);
  const currentStoreRef = useRef(currentStoreId);
  const requestTrackerRef = useRef<Partial<Record<RequestKey, number>>>({});

  currentStoreRef.current = currentStoreId;

  useEffect(() => {
    setSelectedStoreId(homeStoreId);
  }, [homeStoreId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice("");
    }, NOTICE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [notice]);

  useEffect(() => {
    setNotice("");
  }, [activeTab]);

  useEffect(() => {
    setStats(EMPTY_STATS);
    setStoreConfig(EMPTY_STORE_CONFIG);
    setMenuCategories([]);
    setMenuItems([]);
    setRulesState([]);
    setExchangeItems([]);
    setOpsTasks([]);
    setOrders([]);
    setSelectedOrder(null);
    setOrderLogs([]);
    setSavingMenu(false);
    setRows([]);
    setStaffUsers([]);
    setFeedbacks([]);
    setLogs([]);
    setSavingRules(false);
    setLoadingOrders(false);
    setLoadingOrderDetail(false);
    setLoadingMembers(false);
    setHasAttemptedOrdersBootstrap(false);
    setHasAttemptedMembersBootstrap(false);
    setLoadingOpsTasks(false);
    setOpsStatusFilter("OPEN");
    setUpdatingOrderStatus(null);
    setRetryingOpsTaskId(null);
    setResolvingOpsTaskId(null);
    setAdjustingBinding(false);
    setAdjustingPoints(false);
    setCreatingStaff(false);
    setTogglingStaffId(null);
    setPasswordUpdatingStaffId(null);
    setUpdatingFeedbackId(null);
    setHasSearchedOrders(false);
    setOrderQuery("");
    setOrderStatusFilter("ALL");
    setOrderPagination(EMPTY_ORDER_PAGINATION);
    setHasSearchedMembers(false);
    setMemberQuery("");
    setMemberPagination(EMPTY_MEMBER_PAGINATION);
    setNotice("");
    setErrorMessage("");
    setTabLoaded({ ...EMPTY_TAB_FLAGS });
    setTabLoading({ ...EMPTY_TAB_FLAGS });
    void loadOverview(true);
  }, [currentStoreId]);

  useEffect(() => {
    if (activeTab === "ops") {
      void loadOpsTasks();
      return;
    }

    if (activeTab === "menu") {
      void loadMenuConfig();
      return;
    }

    if (activeTab === "orders" && !hasAttemptedOrdersBootstrap && !loadingOrders) {
      setHasAttemptedOrdersBootstrap(true);
      void handleOrderSearch("", "ALL", 1, { silent: true });
      return;
    }

    if (activeTab === "members" && !hasAttemptedMembersBootstrap && !loadingMembers) {
      setHasAttemptedMembersBootstrap(true);
      void handleSearch("", 1, { silent: true });
      return;
    }

    if (activeTab === "rules") {
      void loadRules();
    } else if (activeTab === "staff") {
      void loadStaffUsers();
    } else if (activeTab === "feedback") {
      void loadFeedbacks();
    } else if (activeTab === "audit") {
      void loadAuditLogs();
    }
  }, [
    activeTab,
    hasAttemptedMembersBootstrap,
    hasAttemptedOrdersBootstrap,
    hasSearchedMembers,
    loadingMembers,
    hasSearchedOrders,
    loadingOrders
  ]);

  function handleSessionFailure(error: unknown): boolean {
    const code = getErrorCode(error);
    if (code === "UNAUTHORIZED" || code === "INVALID_SESSION_SCOPE") {
      onLogout();
      return true;
    }

    return false;
  }

  function markTabLoading(tab: TabKey, loading: boolean) {
    setTabLoading((current) => ({
      ...current,
      [tab]: loading
    }));
  }

  function markTabLoaded(tab: TabKey) {
    setTabLoaded((current) => ({
      ...current,
      [tab]: true
    }));
  }

  function beginRequest(key: RequestKey, storeId = currentStoreId) {
    const requestId = (requestTrackerRef.current[key] ?? 0) + 1;
    requestTrackerRef.current[key] = requestId;
    return { key, requestId, storeId };
  }

  function isLatestRequest(request: { key: RequestKey; requestId: number; storeId: string }) {
    return requestTrackerRef.current[request.key] === request.requestId && currentStoreRef.current === request.storeId;
  }

  async function loadOverview(force = false) {
    if (!force && (tabLoading.overview || tabLoaded.overview)) {
      return;
    }

    const request = beginRequest("overview");
    markTabLoading("overview", true);
    setErrorMessage("");
    try {
      const statsResponse = await fetchDashboard(session.sessionToken, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setStats(statsResponse.stats);
      markTabLoaded("overview");
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "数据读取失败，请稍后重试。");
    } finally {
      if (isLatestRequest(request)) {
        markTabLoading("overview", false);
      }
    }
  }

  async function loadMenuConfig(force = false) {
    if (!force && (tabLoading.menu || tabLoaded.menu)) {
      return;
    }

    const request = beginRequest("menu");
    markTabLoading("menu", true);
    setErrorMessage("");
    try {
      const response = await fetchMenuConfig(session.sessionToken, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setStoreConfig(response.storeConfig);
      setMenuCategories(response.categories);
      setMenuItems(response.items);
      markTabLoaded("menu");
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "菜单配置读取失败");
    } finally {
      if (isLatestRequest(request)) {
        markTabLoading("menu", false);
      }
    }
  }

  async function loadOpsTasks(force = false, status = opsStatusFilter) {
    if (!force && (tabLoading.ops || tabLoaded.ops) && status === opsStatusFilter) {
      return;
    }

    const request = beginRequest("ops");
    markTabLoading("ops", true);
    setLoadingOpsTasks(true);
    setErrorMessage("");
    try {
      const response = await fetchOpsTasks(session.sessionToken, status, 50, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setOpsTasks(response.tasks);
      setOpsStatusFilter(status);
      markTabLoaded("ops");
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "异常事项读取失败");
    } finally {
      if (isLatestRequest(request)) {
        markTabLoading("ops", false);
        setLoadingOpsTasks(false);
      }
    }
  }

  async function handleSaveMenu(payload: {
    storeConfig: StoreConfig;
    categories: MenuCategory[];
    items: MenuItem[];
  }) {
    const request = beginRequest("menuSave");
    setSavingMenu(true);
    setErrorMessage("");
    try {
      const response = await saveMenuConfig(session.sessionToken, payload, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setStoreConfig(response.storeConfig);
      setMenuCategories(response.categories);
      setMenuItems(response.items);
      markTabLoaded("menu");
      setNotice("菜单已保存");
      await loadAuditLogs(true);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "菜单配置保存失败");
    } finally {
      if (isLatestRequest(request)) {
        setSavingMenu(false);
      }
    }
  }

  async function loadRules(force = false) {
    if (!force && (tabLoading.rules || tabLoaded.rules)) {
      return;
    }

    const request = beginRequest("rules");
    markTabLoading("rules", true);
    setErrorMessage("");
    try {
      const response = await fetchRules(session.sessionToken, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setRulesState(response.rules);
      setExchangeItems(response.exchangeItems);
      markTabLoaded("rules");
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "奖励规则读取失败");
    } finally {
      if (isLatestRequest(request)) {
        markTabLoading("rules", false);
      }
    }
  }

  async function loadStaffUsers(force = false) {
    if (!force && (tabLoading.staff || tabLoaded.staff)) {
      return;
    }

    const request = beginRequest("staff");
    markTabLoading("staff", true);
    setErrorMessage("");
    try {
      const response = await listStaff(session.sessionToken, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setStaffUsers(response.staffUsers);
      markTabLoaded("staff");
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "员工账号读取失败");
    } finally {
      if (isLatestRequest(request)) {
        markTabLoading("staff", false);
      }
    }
  }

  async function loadAuditLogs(force = false) {
    if (!force && (tabLoading.audit || tabLoaded.audit)) {
      return;
    }

    const request = beginRequest("audit");
    markTabLoading("audit", true);
    setErrorMessage("");
    try {
      const response = await fetchAuditLogs(session.sessionToken, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setLogs(response.logs);
      markTabLoaded("audit");
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "审计日志读取失败");
    } finally {
      if (isLatestRequest(request)) {
        markTabLoading("audit", false);
      }
    }
  }

  async function loadFeedbacks(force = false) {
    if (!force && (tabLoading.feedback || tabLoaded.feedback)) {
      return;
    }

    const request = beginRequest("feedback");
    markTabLoading("feedback", true);
    setErrorMessage("");
    try {
      const response = await fetchFeedbackTickets(session.sessionToken, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setFeedbacks(response.tickets);
      markTabLoaded("feedback");
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "用户反馈读取失败");
    } finally {
      if (isLatestRequest(request)) {
        markTabLoading("feedback", false);
      }
    }
  }

  async function loadOrderDetail(orderId: string) {
    const request = beginRequest("orderDetail");
    setLoadingOrderDetail(true);
    setErrorMessage("");
    try {
      const response = await fetchOrderWorkbenchDetail(session.sessionToken, orderId, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setSelectedOrder(response.order);
      setOrderLogs(response.logs);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "订单详情读取失败");
    } finally {
      if (isLatestRequest(request)) {
        setLoadingOrderDetail(false);
      }
    }
  }

  async function handleOrderSearch(
    query: string,
    status: OrderStatus | "ALL" = "ALL",
    page = 1,
    options?: { silent?: boolean }
  ) {
    const request = beginRequest("ordersSearch");
    setLoadingOrders(true);
    setErrorMessage("");
    try {
      const normalizedQuery = query.trim();
      const normalizedStatus = status === "ALL" ? undefined : status;
      const response = await fetchOrders(
        session.sessionToken,
        normalizedQuery,
        normalizedStatus,
        page,
        ORDER_PAGE_SIZE,
        request.storeId
      );
      if (!isLatestRequest(request)) {
        return;
      }
      setOrders(response.rows);
      setOrderQuery(normalizedQuery);
      setOrderStatusFilter(status);
      setOrderPagination(response.pagination);
      setHasSearchedOrders(true);
      markTabLoaded("orders");

      const fallbackOrder =
        selectedOrder && response.rows.find((item) => item._id === selectedOrder._id)
          ? selectedOrder._id
          : response.rows[0]?._id;

      if (fallbackOrder) {
        await loadOrderDetail(fallbackOrder);
      } else {
        setSelectedOrder(null);
        setOrderLogs([]);
      }

      if (!options?.silent) {
        setNotice(
          normalizedQuery || status !== "ALL"
            ? `订单列表 ${response.pagination.page} / ${response.pagination.totalPages}`
            : response.pagination.total > 0
              ? `已刷新订单，第 ${response.pagination.page} / ${response.pagination.totalPages} 页`
              : "暂无订单"
        );
      }
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setOrders([]);
      setOrderPagination(EMPTY_ORDER_PAGINATION);
      setSelectedOrder(null);
      setOrderLogs([]);
      setErrorMessage(error instanceof Error ? error.message : "订单查询失败");
    } finally {
      if (isLatestRequest(request)) {
        setLoadingOrders(false);
      }
    }
  }

  async function handleOrderStatusUpdate(payload: {
    orderId: string;
    nextStatus: OrderWorkbenchActionStatus;
    note?: string;
  }) {
    const request = beginRequest("orderStatus");
    setUpdatingOrderStatus(payload.nextStatus);
    setErrorMessage("");
    try {
      const response = await updateOrderWorkbenchStatus(session.sessionToken, payload, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }

      const settlementText =
        payload.nextStatus === "COMPLETED" && response.visitSettlement
          ? response.visitSettlement.state === "SETTLED"
            ? " 奖励已结算。"
            : response.visitSettlement.state === "MANUAL_REVIEW"
              ? ` 奖励待处理：${response.visitSettlement.reason || "请复核会员或订单。"}`
              : ` 奖励未结算：${response.visitSettlement.reason || "可稍后再试。"}`
          : "";

      setNotice(
        response.isIdempotent
          ? "状态未变"
          : `订单已${payload.nextStatus === "CANCELLED" ? "取消" : "更新"}。${settlementText}`.trim()
      );

      await loadOrderDetail(payload.orderId);
      if (!isLatestRequest(request)) {
        return;
      }
      if (hasSearchedOrders) {
        await handleOrderSearch(orderQuery, orderStatusFilter, orderPagination.page, { silent: true });
      }
      await Promise.all([
        loadAuditLogs(true),
        loadOverview(true),
        tabLoaded.ops || activeTab === "ops" ? loadOpsTasks(true, opsStatusFilter) : Promise.resolve()
      ]);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "订单状态更新失败");
    } finally {
      if (isLatestRequest(request)) {
        setUpdatingOrderStatus(null);
      }
    }
  }

  async function handleSearch(query: string, page = 1, options?: { silent?: boolean }) {
    const request = beginRequest("membersSearch");
    setLoadingMembers(true);
    setErrorMessage("");
    try {
      const normalizedQuery = query.trim();
      const response = await searchMembers(session.sessionToken, normalizedQuery, page, MEMBER_PAGE_SIZE, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setRows(response.rows);
      setMemberQuery(normalizedQuery);
      setMemberPagination(response.pagination);
      setHasSearchedMembers(true);
      if (!options?.silent) {
        setNotice(
          normalizedQuery
            ? `已筛选“${normalizedQuery}”`
            : response.pagination.total > 0
              ? `会员列表 ${response.pagination.page} / ${response.pagination.totalPages}`
              : "暂无会员"
        );
      }
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setRows([]);
      setMemberPagination(EMPTY_MEMBER_PAGINATION);
      setErrorMessage(error instanceof Error ? error.message : "会员查询失败");
    } finally {
      if (isLatestRequest(request)) {
        setLoadingMembers(false);
      }
    }
  }

  async function handleAdjust(inviteeMemberId: string, inviterMemberId: string, reason: string) {
    const request = beginRequest("adjustBinding");
    setAdjustingBinding(true);
    setErrorMessage("");
    try {
      await adjustBinding(session.sessionToken, inviteeMemberId, inviterMemberId, reason, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setNotice("邀请关系已调整");
      await loadAuditLogs(true);
      if (!isLatestRequest(request)) {
        return;
      }
      if (hasSearchedMembers) {
        await handleSearch(memberQuery, memberPagination.page, { silent: true });
      }
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "邀请关系调整失败");
    } finally {
      if (isLatestRequest(request)) {
        setAdjustingBinding(false);
      }
    }
  }

  async function handleAdjustPoints(memberId: string, delta: number, reason: string) {
    const request = beginRequest("adjustPoints");
    setAdjustingPoints(true);
    setErrorMessage("");
    try {
      await adjustMemberPoints(session.sessionToken, memberId, delta, reason, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setNotice("积分已调整");
      await loadAuditLogs(true);
      if (!isLatestRequest(request)) {
        return;
      }
      if (hasSearchedMembers) {
        await handleSearch(memberQuery, memberPagination.page, { silent: true });
      }
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "会员积分调整失败");
    } finally {
      if (isLatestRequest(request)) {
        setAdjustingPoints(false);
      }
    }
  }

  async function handleSaveRules(nextRules: RewardRule[], nextExchangeItems: PointExchangeItem[]) {
    const request = beginRequest("saveRules");
    setSavingRules(true);
    setErrorMessage("");
    try {
      const response = await saveRules(session.sessionToken, nextRules, nextExchangeItems, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setRulesState(response.rules);
      setExchangeItems(response.exchangeItems);
      markTabLoaded("rules");
      setNotice(buildRulesSavedNotice(response.summary));
      await loadAuditLogs(true);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "奖励规则保存失败");
    } finally {
      if (isLatestRequest(request)) {
        setSavingRules(false);
      }
    }
  }

  async function handleCreateStaff(payload: {
    username: string;
    password: string;
    displayName: string;
    isEnabled: boolean;
  }) {
    const request = beginRequest("createStaff");
    setCreatingStaff(true);
    setErrorMessage("");
    try {
      await createStaff(session.sessionToken, payload, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setNotice("账号已创建");
      await Promise.all([loadStaffUsers(true), loadAuditLogs(true)]);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "员工账号创建失败");
    } finally {
      if (isLatestRequest(request)) {
        setCreatingStaff(false);
      }
    }
  }

  async function handleToggleStaff(payload: {
    _id: string;
    username: string;
    displayName: string;
    role: "OWNER" | "STAFF";
    isEnabled: boolean;
  }) {
    const request = beginRequest("toggleStaff");
    setTogglingStaffId(payload._id);
    setErrorMessage("");
    try {
      await updateStaff(session.sessionToken, payload, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setNotice("账号状态已更新");
      await Promise.all([loadStaffUsers(true), loadAuditLogs(true)]);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "员工状态更新失败");
    } finally {
      if (isLatestRequest(request)) {
        setTogglingStaffId(null);
      }
    }
  }

  async function handleUpdatePassword(payload: {
    _id: string;
    username: string;
    password: string;
    displayName: string;
    role: "OWNER" | "STAFF";
  }) {
    const request = beginRequest("updatePassword");
    setPasswordUpdatingStaffId(payload._id);
    setErrorMessage("");
    try {
      await updateStaffPassword(session.sessionToken, payload, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setNotice(payload._id === session.staff._id ? "密码已更新" : "密码已重置");
      await Promise.all([loadStaffUsers(true), loadAuditLogs(true)]);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "密码更新失败");
    } finally {
      if (isLatestRequest(request)) {
        setPasswordUpdatingStaffId(null);
      }
    }
  }

  async function handleUpdateFeedback(payload: {
    feedbackId: string;
    status: "OPEN" | "PROCESSING" | "RESOLVED";
    priority: "NORMAL" | "HIGH" | "URGENT";
    ownerReply: string;
  }) {
    const request = beginRequest("updateFeedback");
    setUpdatingFeedbackId(payload.feedbackId);
    setErrorMessage("");
    try {
      await updateFeedbackTicket(session.sessionToken, payload, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setNotice("反馈已保存");
      await Promise.all([loadFeedbacks(true), loadAuditLogs(true)]);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "反馈处理失败");
    } finally {
      if (isLatestRequest(request)) {
        setUpdatingFeedbackId(null);
      }
    }
  }

  async function handleRetryOpsTask(taskId: string) {
    const request = beginRequest("retryOpsTask");
    setRetryingOpsTaskId(taskId);
    setErrorMessage("");
    try {
      const response = await retryOpsTask(session.sessionToken, taskId, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }

      const settlementText =
        response.settlement.state === "SETTLED"
          ? "已补结算"
          : response.settlement.state === "MANUAL_REVIEW"
            ? `仍需人工处理：${response.settlement.reason || "请复核会员或订单。"}`
            : `重试未成功：${response.settlement.reason || "请稍后再试。"}`
      setNotice(settlementText);
      await Promise.all([loadOpsTasks(true, opsStatusFilter), loadOverview(true), loadAuditLogs(true)]);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "待处理事项重试失败");
    } finally {
      if (isLatestRequest(request)) {
        setRetryingOpsTaskId(null);
      }
    }
  }

  async function handleResolveOpsTask(payload: {
    taskId: string;
    action: "RESOLVE" | "IGNORE";
    note?: string;
  }) {
    const request = beginRequest("resolveOpsTask");
    setResolvingOpsTaskId(payload.taskId);
    setErrorMessage("");
    try {
      await resolveOpsTask(session.sessionToken, payload, request.storeId);
      if (!isLatestRequest(request)) {
        return;
      }
      setNotice(payload.action === "IGNORE" ? "已忽略" : "已处理");
      await Promise.all([loadOpsTasks(true, opsStatusFilter), loadOverview(true), loadAuditLogs(true)]);
    } catch (error) {
      if (!isLatestRequest(request)) {
        return;
      }
      if (handleSessionFailure(error)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "待处理事项更新失败");
    } finally {
      if (isLatestRequest(request)) {
        setResolvingOpsTaskId(null);
      }
    }
  }

  const activeTabConfig = TABS.find((item) => item.key === activeTab) ?? TABS[0];
  const enabledStaffCount = tabLoaded.staff ? staffUsers.filter((item) => item.isEnabled).length : 0;
  const boundStaffCount = tabLoaded.staff ? staffUsers.filter((item) => Boolean(item.miniOpenId)).length : 0;
  const enabledRuleCount = tabLoaded.rules ? rules.filter((item) => item.isEnabled).length : 0;
  const repeatableRuleCount = tabLoaded.rules
    ? rules.filter((item) => item.type === "INVITE_MILESTONE" && item.isEnabled && item.rewardMode === "REPEATABLE").length
    : null;
  const enabledExchangeCount = tabLoaded.rules ? exchangeItems.filter((item) => item.isEnabled).length : null;
  const welcomeRuleEnabled = tabLoaded.rules ? rules.some((item) => item.type === "WELCOME" && item.isEnabled) : null;
  const rulesStatusText = tabLoading.rules ? "加载中" : tabLoaded.rules ? (welcomeRuleEnabled ? "已开启" : "未开启") : "待查看";
  const repeatableStatusText =
    tabLoading.rules
      ? "加载中"
      : tabLoaded.rules
        ? repeatableRuleCount && repeatableRuleCount > 0
          ? `已配置 ${repeatableRuleCount} 条`
          : "还未配置"
        : "待查看";
  const staffEnabledText =
    tabLoading.staff ? "加载中" : tabLoaded.staff ? `${enabledStaffCount} / ${staffUsers.length}` : "待查看";
  const staffBoundText =
    tabLoading.staff ? "加载中" : tabLoaded.staff ? `${boundStaffCount} / ${staffUsers.length}` : "待查看";

  const operationFocus = [
    {
      title: "今日订单",
      value: `${stats.todayOrderCount} 单`,
      detail:
        stats.todayOrderCount > 0
          ? `营业额 ${formatCurrencyAmount(stats.todayRevenueAmount)}`
          : "今天还没有订单。"
    },
    {
      title: "待确认",
      value: `${stats.pendingConfirmOrderCount} 单`,
      detail:
        stats.pendingConfirmOrderCount > 0
          ? "优先确认新订单。"
          : "当前没有待确认订单。"
    },
    {
      title: "待取餐",
      value: `${stats.readyOrderCount} 单`,
      detail:
        stats.readyOrderCount > 0
          ? "留意出餐和叫号。"
          : "当前没有待取餐订单。"
    },
    {
      title: "未参与会员活动",
      value: `${stats.memberBenefitsSkippedOrderCount} 单`,
      detail:
        stats.memberBenefitsSkippedOrderCount > 0
          ? "重点关注未验证手机号订单。"
          : "近期没有跳过会员活动的订单。"
    }
  ];

  const readinessChecklist = [
    {
      label: "首单礼",
      value: rulesStatusText,
      tone: welcomeRuleEnabled ? "tag-success" : "tag-navy"
    },
    {
      label: "循环积分",
      value: repeatableStatusText,
      tone: repeatableRuleCount && repeatableRuleCount > 0 ? "tag-success" : "tag-navy"
    },
    {
      label: "兑换菜品",
      value: tabLoading.rules ? "加载中" : tabLoaded.rules ? `${enabledExchangeCount} 条` : "待查看",
      tone: enabledExchangeCount && enabledExchangeCount > 0 ? "tag-success" : "tag-navy"
    },
    {
      label: "员工账号",
      value: staffEnabledText,
      tone: enabledStaffCount && enabledStaffCount > 0 ? "tag-success" : "tag-navy"
    },
    {
      label: "微信绑定",
      value: staffBoundText,
      tone: boundStaffCount && boundStaffCount > 0 ? "tag-success" : "tag-navy"
    }
  ];
  const storeLabel =
    storeConfig.storeName && storeConfig.storeName !== EMPTY_STORE_CONFIG.storeName ? storeConfig.storeName : currentStoreId;
  const heroStats = [
    {
      label: "今日订单",
      value: stats.todayOrderCount,
      copy: "今天下单"
    },
    {
      label: "今日营业额",
      value: formatCurrencyAmount(stats.todayRevenueAmount),
      copy: "未含已取消"
    },
    {
      label: "待确认",
      value: stats.pendingConfirmOrderCount,
      copy: "优先处理"
    }
  ];
  const sidebarSnapshot = [
    {
      label: "今日订单",
      value: `${stats.todayOrderCount} 单`
    },
    {
      label: "今日营业额",
      value: formatCurrencyAmount(stats.todayRevenueAmount)
    },
    {
      label: "待确认",
      value: `${stats.pendingConfirmOrderCount} 单`
    }
  ];
  const tabBadges: Record<TabKey, { text: string; tone: "default" | "success" | "navy" }> = {
    overview: {
      text: `${stats.todayOrderCount} 单`,
      tone: stats.todayOrderCount > 0 ? "success" : "navy"
    },
    ops: {
      text: tabLoaded.ops ? `${stats.openOpsTaskCount} 条待处理` : "待加载",
      tone: stats.openOpsTaskCount > 0 ? "default" : "success"
    },
    menu: {
      text: tabLoaded.menu ? `${menuItems.filter((item) => item.isEnabled && !item.isSoldOut).length} 道可售` : "待加载",
      tone: tabLoaded.menu ? "success" : "navy"
    },
    orders: {
      text: tabLoaded.orders ? `${orders.filter((item) => item.status === "PENDING_CONFIRM").length} 单待确认` : "待加载",
      tone: orders.some((item) => item.status === "PENDING_CONFIRM") ? "default" : tabLoaded.orders ? "success" : "navy"
    },
    members: {
      text: hasSearchedMembers ? `${memberPagination.total} 位会员` : "待检索",
      tone: hasSearchedMembers && memberPagination.total > 0 ? "success" : "navy"
    },
    rules: {
      text: tabLoaded.rules ? `${enabledRuleCount} 条启用` : "待加载",
      tone: enabledRuleCount > 0 ? "success" : "navy"
    },
    staff: {
      text: tabLoaded.staff ? `${enabledStaffCount}/${staffUsers.length} 个可用` : "待加载",
      tone: enabledStaffCount > 0 ? "success" : "navy"
    },
    feedback: {
      text: tabLoaded.feedback ? `${feedbacks.filter((item) => item.status !== "RESOLVED").length} 条待跟进` : "待加载",
      tone: feedbacks.some((item) => item.status !== "RESOLVED") ? "default" : tabLoaded.feedback ? "success" : "navy"
    },
    audit: {
      text: tabLoaded.audit ? `${logs.length} 条记录` : "待加载",
      tone: tabLoaded.audit ? "success" : "navy"
    }
  };
  const heroTitle = activeTab === "overview" ? `${storeLabel} 概况` : activeTabConfig.label;
  const heroSummary = activeTab === "overview" ? "先看订单、出餐和异常。" : activeTabConfig.summary;

  function renderDeferredPanel(tab: TabKey, title: string, copy: string) {
    return (
      <div className="empty-state deferred-panel">
        <div className="tag tag-navy">{tabLoading[tab] ? "加载中" : "待加载"}</div>
        <h3 className="section-title">{title}</h3>
        <p className="subtle">{copy}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="dashboard-grid">
        <aside className="panel sidebar stack">
          <div className="sidebar-top">
            <div className="brand-mark">门店后台</div>
            <div className="stack">
              <h1 className="brand-title">店长后台</h1>
              <p className="subtle">订单、会员、设置。</p>
            </div>
            <div className="sidebar-meta stack">
              <div className="section-eyebrow">账号</div>
              <div className="section-title">
                {session.staff.displayName} / {session.staff.username}
              </div>
              <div className="inline-tags">
                <div className="tag tag-navy">Web</div>
                <div className="tag">{canSwitchStores ? "总店视角" : "门店视角"}</div>
              </div>
              {canSwitchStores ? (
                <label className="field-label" htmlFor="dashboard-store-select">
                  门店范围
                  <select
                    id="dashboard-store-select"
                    className="field"
                    value={currentStoreId}
                    onChange={(event) => setSelectedStoreId(event.target.value)}
                  >
                    {accessibleStoreIds.map((storeId) => (
                      <option key={storeId} value={storeId}>
                        {storeId === homeStoreId ? `${storeId}（总店账号）` : storeId}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="toolbar-pill">门店：{storeLabel}</div>
              )}
            </div>
          </div>

          <div className="sidebar-snapshot">
            {sidebarSnapshot.map((item) => (
              <div className="sidebar-stat-line" key={item.label}>
                <span className="sidebar-stat-label">{item.label}</span>
                <strong className="sidebar-stat-value">{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="sidebar-nav">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`button nav-button ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="nav-button-main">
                  <span>{tab.label}</span>
                  <span className={`nav-button-badge nav-button-badge-${tabBadges[tab.key].tone}`}>{tabBadges[tab.key].text}</span>
                </span>
                <span className="nav-button-summary">{tab.summary}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-actions">
            <button className="button button-danger sidebar-logout" onClick={onLogout}>
              退出登录
            </button>
          </div>
        </aside>

        <main className="panel content section-stack">
          <section className="hero">
            <div className="hero-grid">
              <div className="stack hero-main">
                <div className="hero-kicker-row">
                  <div className="section-eyebrow">{activeTabConfig.label}</div>
                  <div className="hero-sync-badge">
                    {tabLoading[activeTab] ? "加载中" : tabLoaded[activeTab] ? "在线" : "待加载"}
                  </div>
                </div>
                <h2 className="headline">{heroTitle}</h2>
                <p className="subtle hero-summary">{heroSummary}</p>
                <div className="hero-brief-grid">
                  <div className="hero-brief-card">
                    <div className="hero-brief-label">当前门店</div>
                    <div className="hero-brief-value">{storeLabel}</div>
                  </div>
                  <div className="hero-brief-card">
                    <div className="hero-brief-label">查看范围</div>
                    <div className="hero-brief-value">{canSwitchStores ? `共 ${accessibleStoreIds.length} 家门店` : "当前门店"}</div>
                  </div>
                  <div className="hero-brief-card">
                    <div className="hero-brief-label">当前账号</div>
                    <div className="hero-brief-value">{session.staff.displayName}</div>
                  </div>
                </div>
              </div>
              <div className="hero-side">
                <div className="hero-side-label">当前看板</div>
                <div className="hero-stat-grid">
                  {heroStats.map((item) => (
                    <div className="hero-stat-card" key={item.label}>
                      <div className="hero-stat-label">{item.label}</div>
                      <div className="hero-stat-value">{item.value}</div>
                      <div className="hero-stat-copy">{item.copy}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="hero-signal-grid">
              {readinessChecklist.map((item) => (
                <div className="hero-signal-card" key={item.label}>
                  <div className="hero-signal-label">{item.label}</div>
                  <div className={`tag ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {notice ? <div className="notice">{notice}</div> : null}
          {errorMessage ? (
            <div className="error" role="alert">
              {errorMessage}
            </div>
          ) : null}
          {tabLoading[activeTab] ? <div className="notice">当前页加载中</div> : null}

          {activeTab === "overview" ? (
            <div className="section-stack">
              <div className="metric-grid">
                <MetricCard label="会员总数" value={stats.memberCount} footnote="已注册会员" />
                <MetricCard label="今日订单" value={stats.todayOrderCount} footnote="今天下单" />
                <MetricCard label="今日营业额" value={formatCurrencyAmount(stats.todayRevenueAmount)} footnote="未含已取消" />
                <MetricCard label="待确认订单" value={stats.pendingConfirmOrderCount} footnote="优先处理" />
                <MetricCard label="待取餐订单" value={stats.readyOrderCount} footnote="留意出餐" />
                <MetricCard label="今日发放积分" value={stats.todayPointsIssued} footnote="正向入账" />
                <MetricCard label="今日积分兑换" value={stats.todayPointsRedeemed} footnote="已消耗积分" />
                <MetricCard label="今日核销券" value={stats.todayVoucherRedeemedCount} footnote="已用菜品券" />
                <MetricCard label="未参与会员活动订单" value={stats.memberBenefitsSkippedOrderCount} footnote="需关注" />
                <MetricCard label="待处理事项" value={stats.openOpsTaskCount} footnote="待处理异常" />
              </div>

              <div className="split">
                <div className="row-card stack">
                  <div className="card-title-block">
                    <div className="tag tag-navy">今天</div>
                    <h3 className="section-title">今天重点</h3>
                    <p className="subtle">先看这几项。</p>
                  </div>

                  <div className="insight-list">
                    {operationFocus.map((item) => (
                      <div className="insight-item" key={item.title}>
                        <div className="stack">
                          <div className="section-title">{item.title}</div>
                          <p className="subtle tiny">{item.detail}</p>
                        </div>
                        <div className="metric-value metric-value-compact">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="button-row dashboard-quick-actions">
                    <button className="button button-secondary" type="button" onClick={() => setActiveTab("ops")}>
                      去异常处理
                    </button>
                    <button className="button button-secondary" type="button" onClick={() => setActiveTab("orders")}>
                      去订单工作台
                    </button>
                    <button className="button button-secondary" type="button" onClick={() => setActiveTab("members")}>
                      去会员管理
                    </button>
                  </div>
                </div>

                <div className="row-card stack">
                  <div className="card-title-block">
                    <div className="tag">检查</div>
                    <h3 className="section-title">开店检查</h3>
                    <p className="subtle">开店前过一遍。</p>
                  </div>

                  <div className="status-list">
                    {readinessChecklist.map((item) => (
                      <div className="status-line" key={item.label}>
                        <div className="section-title">{item.label}</div>
                        <div className={`tag ${item.tone}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "menu" && tabLoaded.menu ? (
            <MenuPanel categories={menuCategories} items={menuItems} onSave={handleSaveMenu} saving={savingMenu} storeConfig={storeConfig} />
          ) : activeTab === "menu" ? (
            renderDeferredPanel("menu", "菜单加载中", "正在读取菜单配置。")
          ) : null}

          {activeTab === "ops" && tabLoaded.ops ? (
            <OpsTasksPanel
              loading={loadingOpsTasks}
              onResolve={handleResolveOpsTask}
              onRetry={handleRetryOpsTask}
              onStatusChange={(status) => loadOpsTasks(true, status)}
              resolvingTaskId={resolvingOpsTaskId}
              retryingTaskId={retryingOpsTaskId}
              status={opsStatusFilter}
              tasks={opsTasks}
            />
          ) : activeTab === "ops" ? (
            renderDeferredPanel("ops", "异常加载中", "正在读取异常事项。")
          ) : null}

          {activeTab === "orders" && (tabLoaded.orders || hasAttemptedOrdersBootstrap) ? (
            <OrdersPanel
              detailLoading={loadingOrderDetail}
              loading={loadingOrders}
              onSearch={handleOrderSearch}
              onSelectOrder={loadOrderDetail}
              onUpdateStatus={handleOrderStatusUpdate}
              orderLogs={orderLogs}
              pagination={orderPagination}
              query={orderQuery}
              rows={orders}
              selectedOrder={selectedOrder}
              status={orderStatusFilter}
              updatingStatus={updatingOrderStatus}
            />
          ) : activeTab === "orders" ? (
            renderDeferredPanel("orders", "订单加载中", "正在读取订单列表。")
          ) : null}

          {activeTab === "members" ? (
            <MemberSearchPanel
              adjusting={adjustingBinding}
              adjustingPoints={adjustingPoints}
              hasSearched={hasSearchedMembers}
              query={memberQuery}
              rows={rows}
              loading={loadingMembers}
              pagination={memberPagination}
              onSearch={handleSearch}
              onAdjust={handleAdjust}
              onAdjustPoints={handleAdjustPoints}
            />
          ) : null}

          {activeTab === "rules" && tabLoaded.rules ? (
            <RulesEditor
              initialRules={rules}
              initialExchangeItems={exchangeItems}
              saving={savingRules}
              onSave={handleSaveRules}
            />
          ) : activeTab === "rules" ? (
            renderDeferredPanel("rules", "规则加载中", "正在读取活动配置。")
          ) : null}

          {activeTab === "staff" && tabLoaded.staff ? (
            <StaffPanel
              creating={creatingStaff}
              currentStaffId={session.staff._id}
              passwordUpdatingStaffId={passwordUpdatingStaffId}
              staffUsers={staffUsers}
              togglingStaffId={togglingStaffId}
              onCreate={handleCreateStaff}
              onToggle={handleToggleStaff}
              onUpdatePassword={handleUpdatePassword}
            />
          ) : activeTab === "staff" ? (
            renderDeferredPanel("staff", "账号加载中", "正在读取账号列表。")
          ) : null}

          {activeTab === "feedback" && tabLoaded.feedback ? (
            <FeedbackPanel feedbacks={feedbacks} onUpdate={handleUpdateFeedback} updatingFeedbackId={updatingFeedbackId} />
          ) : activeTab === "feedback" ? (
            renderDeferredPanel("feedback", "反馈加载中", "正在读取反馈。")
          ) : null}

          {activeTab === "audit" && tabLoaded.audit ? (
            <AuditPanel logs={logs} />
          ) : activeTab === "audit" ? (
            renderDeferredPanel("audit", "日志加载中", "正在读取操作记录。")
          ) : null}
        </main>
      </div>
    </div>
  );
}

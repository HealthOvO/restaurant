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
  openOpsTaskCount: 0
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

const TABS: Array<{ key: TabKey; label: string; summary: string }> = [
  { key: "overview", label: "数据概览", summary: "会员、激活、待核销和今日核销一屏查看。" },
  { key: "ops", label: "异常处理", summary: "订单完成后没结算成功的事项，在这里统一重试或关闭。" },
  { key: "menu", label: "点餐菜单", summary: "门店信息、分类、菜品和规格统一维护。" },
  { key: "orders", label: "订单工作台", summary: "老板查看订单、筛选状态、追踪处理进度。" },
  { key: "members", label: "会员管理", summary: "分页筛会员，必要时人工改绑和调整积分。" },
  { key: "rules", label: "奖励规则", summary: "配置首单礼、邀请积分和积分兑换菜品。" },
  { key: "staff", label: "员工账号", summary: "网页后台账号和店员账号分开使用。" },
  { key: "feedback", label: "用户反馈", summary: "会员和店员的问题在这里统一查看和处理。" },
  { key: "audit", label: "审计日志", summary: "查看关键操作留痕。" }
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

    if (activeTab === "orders" && !hasSearchedOrders && !loadingOrders) {
      void handleOrderSearch("", "ALL", 1, { silent: true });
      return;
    }

    if (activeTab === "members" && !hasSearchedMembers && !loadingMembers) {
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
  }, [activeTab, hasSearchedMembers, loadingMembers, hasSearchedOrders, loadingOrders]);

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
      setErrorMessage(error instanceof Error ? error.message : "后台数据读取失败，请稍后重试。");
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
      setErrorMessage(error instanceof Error ? error.message : "待处理事项读取失败");
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
      setNotice("点餐菜单已保存。");
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
            ? `订单已更新，当前显示第 ${response.pagination.page} / ${response.pagination.totalPages} 页。`
            : response.pagination.total > 0
              ? `已刷新订单列表，当前显示第 ${response.pagination.page} / ${response.pagination.totalPages} 页。`
              : "当前还没有订单数据。"
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
            ? " 会员首单奖励已同步结算。"
            : response.visitSettlement.state === "MANUAL_REVIEW"
              ? ` 会员奖励未结算，需人工处理：${response.visitSettlement.reason || "请检查会员资料或订单号。"}`
              : ` 会员奖励暂未结算，可稍后重试：${response.visitSettlement.reason || "请稍后再点一次完成或由老板复核。"}`
          : "";

      setNotice(
        response.isIdempotent
          ? "这笔订单已经是当前状态。"
          : `订单状态已更新为${payload.nextStatus === "CANCELLED" ? "已取消" : "最新进度"}。${settlementText}`.trim()
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
            ? `已筛选“${normalizedQuery}”，当前显示第 ${response.pagination.page} / ${response.pagination.totalPages} 页。`
            : response.pagination.total > 0
              ? `已刷新会员列表，当前显示第 ${response.pagination.page} / ${response.pagination.totalPages} 页。`
              : "当前还没有会员数据。"
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
      setNotice("邀请关系已调整并记录审计日志。");
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
      setNotice("会员积分已更新并记录审计日志。");
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
      setNotice(
        `奖励规则已保存：规则新增 ${response.summary.createdCount} 条，兑换菜品新增 ${response.summary.exchangeCreatedCount} 条。`
      );
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
      setNotice("店员账号已创建。");
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
      setNotice("员工状态已更新。");
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
      setNotice(payload._id === session.staff._id ? "登录密码已更新。" : "员工密码已重置。");
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
      setNotice("反馈处理结果已保存。");
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
          ? "后台重试后已完成会员结算。"
          : response.settlement.state === "MANUAL_REVIEW"
            ? `仍需人工处理：${response.settlement.reason || "请检查会员资料或订单号。"}`
            : `本次仍未结算成功：${response.settlement.reason || "请稍后再试。"}`
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
      setNotice(payload.action === "IGNORE" ? "事项已忽略。" : "事项已标记为处理完成。");
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
  const enabledStaffCount = tabLoaded.staff ? staffUsers.filter((item) => item.isEnabled).length : null;
  const boundStaffCount = tabLoaded.staff ? staffUsers.filter((item) => Boolean(item.miniOpenId)).length : null;
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
      title: "今日核销节奏",
      value: `${stats.todayVisitCount} 笔`,
      detail:
        stats.todayVisitCount > 0
          ? "今天已有核销，继续盯首单激活、积分和菜品券到账。"
          : "今天还没有核销，先走一遍门店体验流程。"
    },
    {
      title: "拉新激活",
      value: `${stats.activatedInviteCount} 人`,
      detail:
        stats.activatedInviteCount > 0
          ? "已有邀请链路跑通，主流程正在生效。"
          : "还没有激活邀请，优先验证首位被邀请人的首单。"
    },
    {
      title: "待用菜品券",
      value: `${stats.readyVoucherCount} 张`,
      detail:
        stats.readyVoucherCount > 0
          ? "门店已有待核销券，留意店员端核销是否顺畅。"
          : "当前没有待核销券，回看活动和首单礼是否已开启。"
    },
    {
      title: "待处理事项",
      value: `${stats.openOpsTaskCount} 条`,
      detail:
        stats.openOpsTaskCount > 0
          ? "有订单完成后未正常结算的事项，建议老板尽快处理。"
          : "当前没有待处理事项，主流程运行正常。"
    }
  ];

  const readinessChecklist = [
    {
      label: "新客首单礼",
      value: rulesStatusText,
      tone: welcomeRuleEnabled ? "tag-success" : "tag-navy"
    },
    {
      label: "循环积分规则",
      value: repeatableStatusText,
      tone: repeatableRuleCount && repeatableRuleCount > 0 ? "tag-success" : "tag-navy"
    },
    {
      label: "上架兑换菜品",
      value: tabLoading.rules ? "加载中" : tabLoaded.rules ? `${enabledExchangeCount} 条` : "待查看",
      tone: enabledExchangeCount && enabledExchangeCount > 0 ? "tag-success" : "tag-navy"
    },
    {
      label: "可用员工账号",
      value: staffEnabledText,
      tone: enabledStaffCount && enabledStaffCount > 0 ? "tag-success" : "tag-navy"
    },
    {
      label: "已绑定微信员工",
      value: staffBoundText,
      tone: boundStaffCount && boundStaffCount > 0 ? "tag-success" : "tag-navy"
    }
  ];
  const storeLabel =
    storeConfig.storeName && storeConfig.storeName !== EMPTY_STORE_CONFIG.storeName ? storeConfig.storeName : currentStoreId;
  const heroStats = [
    {
      label: "会员总数",
      value: stats.memberCount,
      copy: "已注册并可参与积分与兑换。"
    },
    {
      label: "待处理事项",
      value: stats.openOpsTaskCount,
      copy: "订单和会员结算异常会在这里挂起。"
    },
    {
      label: "可用员工",
      value: tabLoaded.staff ? `${enabledStaffCount}/${staffUsers.length}` : "--",
      copy: "可登录后台或绑定店员端。"
    }
  ];
  const sidebarSnapshot = [
    {
      label: "今日核销",
      value: `${stats.todayVisitCount} 笔`
    },
    {
      label: "待处理事项",
      value: `${stats.openOpsTaskCount} 条`
    },
    {
      label: "可用员工",
      value: tabLoaded.staff ? `${enabledStaffCount}/${staffUsers.length}` : "--"
    }
  ];

  function renderDeferredPanel(tab: TabKey, title: string, copy: string) {
    return (
      <div className="empty-state deferred-panel">
        <div className="tag tag-navy">{tabLoading[tab] ? "正在读取" : "等待加载"}</div>
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
            <div className="brand-mark">老板总台</div>
            <div className="stack">
              <h1 className="brand-title">老板后台</h1>
              <p className="subtle">拉新、积分、核销，集中在一张经营工作台上。</p>
            </div>
            <div className="sidebar-meta stack">
              <div className="section-eyebrow">当前账号</div>
              <div className="section-title">
                {session.staff.displayName} / {session.staff.username}
              </div>
              <div className="inline-tags">
                <div className="tag tag-navy">网页登录</div>
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
                {tab.label}
              </button>
            ))}
          </div>

          <div className="sidebar-tip">
            <div className="section-eyebrow">本日优先级</div>
            <p className="subtle">
              {canSwitchStores
                ? "先切到目标门店，再看今日核销、邀请激活和员工状态。"
                : "先看今日核销，再看邀请激活，最后确认积分、菜品券和员工状态。"}
            </p>
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
                    {tabLoading[activeTab] ? "正在加载" : tabLoaded[activeTab] ? "CloudBase 在线" : "等待加载"}
                  </div>
                </div>
                <h2 className="headline">{activeTabConfig.label}</h2>
                <p className="subtle hero-summary">{activeTabConfig.summary}</p>
                <div className="hero-chip-row">
                  <div className="hero-chip">{canSwitchStores ? `已接入 ${accessibleStoreIds.length} 家门店` : `门店 ${storeLabel}`}</div>
                  <div className="hero-chip">编号 {currentStoreId}</div>
                  <div className="hero-chip">积分结算</div>
                  <div className="hero-chip">订单留痕</div>
                </div>
              </div>
              <div className="hero-side">
                <div className="hero-side-label">经营快照</div>
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
          {tabLoading[activeTab] ? <div className="notice">正在加载当前页数据，请稍候。</div> : null}

          {activeTab === "overview" ? (
            <div className="section-stack">
              <div className="metric-grid">
                <MetricCard label="会员总数" value={stats.memberCount} footnote="当前门店已注册会员。" />
                <MetricCard label="有效邀请数" value={stats.activatedInviteCount} footnote="已完成首单激活的拉新人数。" />
                <MetricCard label="待使用菜品券" value={stats.readyVoucherCount} footnote="还可继续核销的券。" />
                <MetricCard label="今日核销" value={stats.todayVisitCount} footnote="今天录入的核销量。" />
                <MetricCard label="待处理事项" value={stats.openOpsTaskCount} footnote="订单完成后未顺利结算的任务。" />
              </div>

              <div className="split">
                <div className="row-card stack">
                  <div className="card-title-block">
                    <div className="tag tag-navy">先看这 3 项</div>
                    <h3 className="section-title">今天重点</h3>
                    <p className="subtle">核销、激活、待核销券。</p>
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
                </div>

                <div className="row-card stack">
                  <div className="card-title-block">
                    <div className="tag">营业前检查</div>
                    <h3 className="section-title">规则与账号</h3>
                    <p className="subtle">开店前看这 4 项就够了。</p>
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
            renderDeferredPanel("menu", "菜单配置读取中", "第一次进入会拉取门店信息、分类、菜品和规格配置。")
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
            renderDeferredPanel("ops", "待处理事项读取中", "订单完成后没顺利结算的事项，会在这里统一汇总。")
          ) : null}

          {activeTab === "orders" && tabLoaded.orders ? (
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
            renderDeferredPanel("orders", "订单工作台读取中", "稍候会展示订单列表、详情和状态处理入口。")
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
            renderDeferredPanel("rules", "奖励规则读取中", "第一次进入会拉取当前活动配置，稍候即可编辑。")
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
            renderDeferredPanel("staff", "员工账号读取中", "稍候会展示网页后台账号和店员账号列表。")
          ) : null}

          {activeTab === "feedback" && tabLoaded.feedback ? (
            <FeedbackPanel feedbacks={feedbacks} onUpdate={handleUpdateFeedback} updatingFeedbackId={updatingFeedbackId} />
          ) : activeTab === "feedback" ? (
            renderDeferredPanel("feedback", "用户反馈读取中", "会员和店员提交的问题会在这里汇总。")
          ) : null}

          {activeTab === "audit" && tabLoaded.audit ? (
            <AuditPanel logs={logs} />
          ) : activeTab === "audit" ? (
            renderDeferredPanel("audit", "审计日志读取中", "关键变更和核销记录会在这里按时间汇总。")
          ) : null}
        </main>
      </div>
    </div>
  );
}

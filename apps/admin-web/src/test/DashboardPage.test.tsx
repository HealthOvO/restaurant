import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import {
  fetchAuditLogs,
  fetchDashboard,
  fetchFeedbackTickets,
  fetchMenuConfig,
  fetchOpsTasks,
  fetchOrderWorkbenchDetail,
  fetchOrders,
  searchMembers,
  resolveOpsTask,
  retryOpsTask,
  updateFeedbackTicket,
  updateOrderWorkbenchStatus
} from "../lib/api";

vi.mock("../lib/api", () => ({
  fetchDashboard: vi.fn(),
  fetchFeedbackTickets: vi.fn().mockResolvedValue({ ok: true, tickets: [] }),
  fetchMenuConfig: vi.fn().mockResolvedValue({
    ok: true,
    storeConfig: {
      _id: "store-1",
      storeId: "branch-01",
      storeName: "门店",
      dineInEnabled: true,
      pickupEnabled: true,
      minOrderAmount: 0,
      createdAt: "",
      updatedAt: ""
    },
    categories: [],
    items: []
  }),
  fetchOrders: vi.fn().mockResolvedValue({
    ok: true,
    rows: [],
    pagination: {
      page: 1,
      pageSize: 8,
      total: 0,
      totalPages: 1,
      pageItemCount: 0,
      rangeStart: 0,
      rangeEnd: 0,
      hasPrevPage: false,
      hasNextPage: false
    }
  }),
  fetchOrderWorkbenchDetail: vi.fn().mockResolvedValue({
    ok: true,
    order: null,
    logs: []
  }),
  fetchOpsTasks: vi.fn().mockResolvedValue({
    ok: true,
    tasks: []
  }),
  fetchRules: vi.fn().mockResolvedValue({ rules: [], exchangeItems: [] }),
  listStaff: vi.fn().mockResolvedValue({ staffUsers: [] }),
  fetchAuditLogs: vi.fn().mockResolvedValue({ logs: [] }),
  retryOpsTask: vi.fn().mockResolvedValue({
    ok: true,
    task: {
      _id: "ops-task-1"
    },
    settlement: {
      state: "SETTLED"
    }
  }),
  resolveOpsTask: vi.fn().mockResolvedValue({
    ok: true,
    task: {
      _id: "ops-task-1"
    }
  }),
  adjustBinding: vi.fn(),
  adjustMemberPoints: vi.fn(),
  createStaff: vi.fn(),
  saveRules: vi.fn(),
  searchMembers: vi.fn().mockResolvedValue({
    rows: [],
    pagination: {
      page: 1,
      pageSize: 8,
      total: 0,
      totalPages: 1,
      pageItemCount: 0,
      rangeStart: 0,
      rangeEnd: 0,
      hasPrevPage: false,
      hasNextPage: false
    }
  }),
  updateStaff: vi.fn(),
  updateStaffPassword: vi.fn(),
  updateOrderWorkbenchStatus: vi.fn().mockResolvedValue({
    ok: true,
    order: null,
    logs: []
  }),
  updateFeedbackTicket: vi.fn().mockResolvedValue({
    ok: true,
    ticket: {
      _id: "feedback-1"
    }
  })
}));

vi.mock("../components/AuditPanel", () => ({
  AuditPanel: () => <div>audit-panel</div>
}));

vi.mock("../components/FeedbackPanel", () => ({
  FeedbackPanel: ({
    feedbacks,
    updatingFeedbackId,
    onUpdate
  }: {
    feedbacks: Array<{ _id: string }>;
    updatingFeedbackId?: string | null;
    onUpdate: (payload: {
      feedbackId: string;
      status: "OPEN" | "PROCESSING" | "RESOLVED";
      priority: "NORMAL" | "HIGH" | "URGENT";
      ownerReply: string;
    }) => Promise<void>;
  }) => (
    <div>
      <div>{`feedback-panel:${feedbacks.length}:${updatingFeedbackId ?? ""}`}</div>
      <button
        type="button"
        onClick={() =>
          void onUpdate({
            feedbackId: feedbacks[0]?._id ?? "feedback-1",
            status: "RESOLVED",
            priority: "HIGH",
            ownerReply: "已经处理好了"
          })
        }
      >
        save-feedback
      </button>
    </div>
  )
}));

vi.mock("../components/MemberSearchPanel", () => ({
  MemberSearchPanel: () => <div>member-search-panel</div>
}));

vi.mock("../components/MetricCard", () => ({
  MetricCard: ({ label, value }: { label: string; value: number | string }) => <div>{`${label}:${value}`}</div>
}));

vi.mock("../components/MenuPanel", () => ({
  MenuPanel: () => <div>menu-panel</div>
}));

vi.mock("../components/OpsTasksPanel", () => ({
  OpsTasksPanel: ({
    tasks,
    status,
    retryingTaskId,
    resolvingTaskId,
    onStatusChange,
    onRetry,
    onResolve
  }: {
    tasks: Array<{ _id: string }>;
    status: "OPEN" | "RESOLVED" | "IGNORED";
    retryingTaskId?: string | null;
    resolvingTaskId?: string | null;
    onStatusChange: (status: "OPEN" | "RESOLVED" | "IGNORED") => Promise<void>;
    onRetry: (taskId: string) => Promise<void>;
    onResolve: (payload: { taskId: string; action: "RESOLVE" | "IGNORE"; note?: string }) => Promise<void>;
  }) => (
    <div>
      <div>{`ops-panel:${status}:${tasks.length}:${retryingTaskId ?? ""}:${resolvingTaskId ?? ""}`}</div>
      <button type="button" onClick={() => void onStatusChange("RESOLVED")}>
        ops-filter-resolved
      </button>
      <button type="button" onClick={() => void onRetry(tasks[0]?._id ?? "ops-task-1")}>
        retry-op
      </button>
      <button
        type="button"
        onClick={() =>
          void onResolve({
            taskId: tasks[0]?._id ?? "ops-task-1",
            action: "RESOLVE",
            note: "老板已人工核对"
          })
        }
      >
        resolve-op
      </button>
    </div>
  )
}));

vi.mock("../components/OrdersPanel", () => ({
  OrdersPanel: () => <div>orders-panel</div>
}));

vi.mock("../components/RulesEditor", () => ({
  RulesEditor: () => <div>rules-editor</div>
}));

vi.mock("../components/StaffPanel", () => ({
  StaffPanel: () => <div>staff-panel</div>
}));

const unauthorizedError = Object.assign(new Error("登录已失效，请重新登录"), { code: "UNAUTHORIZED" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return {
    promise,
    resolve
  };
}

function createDashboardPayload(memberCount: number) {
  return {
    ok: true as const,
    stats: {
      memberCount,
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
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchDashboard).mockReset();
  vi.mocked(fetchDashboard).mockRejectedValue(unauthorizedError);
  vi.mocked(fetchFeedbackTickets).mockReset();
  vi.mocked(fetchFeedbackTickets).mockResolvedValue({ ok: true, tickets: [] });
  vi.mocked(fetchMenuConfig).mockReset();
  vi.mocked(fetchMenuConfig).mockResolvedValue({
    ok: true,
    storeConfig: {
      _id: "store-1",
      storeId: "branch-01",
      storeName: "门店",
      dineInEnabled: true,
      pickupEnabled: true,
      minOrderAmount: 0,
      createdAt: "",
      updatedAt: ""
    } as never,
    categories: [],
    items: []
  });
  vi.mocked(fetchOrders).mockReset();
  vi.mocked(fetchOrders).mockResolvedValue({
    ok: true,
    rows: [],
    pagination: {
      page: 1,
      pageSize: 8,
      total: 0,
      totalPages: 1,
      pageItemCount: 0,
      rangeStart: 0,
      rangeEnd: 0,
      hasPrevPage: false,
      hasNextPage: false
    }
  });
  vi.mocked(fetchOrderWorkbenchDetail).mockReset();
  vi.mocked(fetchOrderWorkbenchDetail).mockResolvedValue({
    ok: true,
    order: null as never,
    logs: []
  });
  vi.mocked(fetchOpsTasks).mockReset();
  vi.mocked(fetchOpsTasks).mockResolvedValue({
    ok: true,
    tasks: []
  });
  vi.mocked(retryOpsTask).mockReset();
  vi.mocked(retryOpsTask).mockResolvedValue({
    ok: true,
    task: {
      _id: "ops-task-1"
    } as never,
    settlement: {
      state: "SETTLED"
    }
  });
  vi.mocked(resolveOpsTask).mockReset();
  vi.mocked(resolveOpsTask).mockResolvedValue({
    ok: true,
    task: {
      _id: "ops-task-1"
    } as never
  });
  vi.mocked(updateOrderWorkbenchStatus).mockReset();
  vi.mocked(updateOrderWorkbenchStatus).mockResolvedValue({
    ok: true,
    order: null as never
  });
  vi.mocked(updateFeedbackTicket).mockReset();
  vi.mocked(updateFeedbackTicket).mockResolvedValue({
    ok: true,
    ticket: {
      _id: "feedback-1"
    } as never
  });
  vi.mocked(fetchAuditLogs).mockReset();
  vi.mocked(fetchAuditLogs).mockResolvedValue({ ok: true, logs: [] });
});

afterEach(() => {
  cleanup();
});

describe("DashboardPage session guard", () => {
  it("logs out when the current admin session is no longer valid", async () => {
    const onLogout = vi.fn();

    render(
      <DashboardPage
        session={{
          sessionToken: "expired-token",
          staff: {
            _id: "staff-owner-1",
            displayName: "老板",
            role: "OWNER",
            username: "owner",
            storeId: "branch-01"
          }
        }}
        onLogout={onLogout}
      />
    );

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled();
    });
    expect(fetchDashboard).toHaveBeenCalledWith("expired-token", "branch-01");
  });

  it("keeps the newly selected store data when the previous store request resolves later", async () => {
    const branch01Request = deferred<ReturnType<typeof createDashboardPayload>>();
    const branch02Request = deferred<ReturnType<typeof createDashboardPayload>>();

    vi.mocked(fetchDashboard).mockImplementation((_sessionToken, storeId) => {
      if (storeId === "branch-01") {
        return branch01Request.promise;
      }

      if (storeId === "branch-02") {
        return branch02Request.promise;
      }

      return Promise.resolve(createDashboardPayload(0));
    });

    render(
      <DashboardPage
        session={{
          sessionToken: "valid-token",
          staff: {
            _id: "staff-owner-1",
            displayName: "总店老板",
            role: "OWNER",
            username: "owner-hq",
            storeId: "branch-01",
            accessScope: "ALL_STORES",
            managedStoreIds: ["branch-02"]
          }
        }}
        onLogout={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("门店范围"), {
      target: { value: "branch-02" }
    });

    branch02Request.resolve(createDashboardPayload(20));

    await waitFor(() => {
      expect(screen.getByText("会员总数:20")).toBeTruthy();
    });

    branch01Request.resolve(createDashboardPayload(10));

    await waitFor(() => {
      expect(screen.getByText("会员总数:20")).toBeTruthy();
    });

    expect(screen.queryByText("会员总数:10")).toBeNull();
  });

  it("loads feedback for the current store and saves owner updates through the feedback tab", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(createDashboardPayload(5));
    vi.mocked(fetchFeedbackTickets).mockResolvedValue({
      ok: true,
      tickets: [
        {
          _id: "feedback-1",
          storeId: "branch-01",
          feedbackCode: "F00000001",
          sourceType: "MEMBER",
          sourceChannel: "MINIPROGRAM_MEMBER",
          status: "OPEN",
          priority: "NORMAL",
          category: "POINTS",
          title: "积分没有到账",
          content: "昨天到店后积分没有变化",
          submitterOpenId: "openid-1",
          createdAt: "2026-04-08T08:00:00.000Z",
          updatedAt: "2026-04-08T08:00:00.000Z"
        }
      ]
    });

    render(
      <DashboardPage
        session={{
          sessionToken: "valid-token",
          staff: {
            _id: "staff-owner-1",
            displayName: "老板",
            role: "OWNER",
            username: "owner",
            storeId: "branch-01"
          }
        }}
        onLogout={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /用户反馈/ })[0]);

    await waitFor(() => {
      expect(fetchFeedbackTickets).toHaveBeenCalledWith("valid-token", "branch-01");
    });
    expect(screen.getByText("feedback-panel:1:")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "save-feedback" }));

    await waitFor(() => {
      expect(updateFeedbackTicket).toHaveBeenCalledWith(
        "valid-token",
        {
          feedbackId: "feedback-1",
          status: "RESOLVED",
          priority: "HIGH",
          ownerReply: "已经处理好了"
        },
        "branch-01"
      );
    });

    await waitFor(() => {
      expect(fetchFeedbackTickets).toHaveBeenCalledTimes(2);
    });
    expect(fetchAuditLogs).toHaveBeenCalledWith("valid-token", "branch-01");
  });

  it("loads ops tasks on demand and forwards retry/resolve actions with store scope", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue({
      ...createDashboardPayload(5),
      stats: {
        ...createDashboardPayload(5).stats,
        openOpsTaskCount: 1
      }
    });
    vi.mocked(fetchOpsTasks).mockResolvedValue({
      ok: true,
      tasks: [
        {
          _id: "ops-task-1",
          storeId: "branch-01",
          taskType: "ORDER_VISIT_SETTLEMENT",
          status: "OPEN",
          priority: "HIGH",
          title: "订单完成后会员结算未完成",
          description: "database unavailable",
          dedupeKey: "order-visit-settlement:order-1",
          sourceFunction: "staff.order.update",
          orderId: "order-1",
          orderNo: "OD202604140001",
          memberId: "member-1",
          memberCode: "M0001",
          retryCount: 0,
          lastTriggeredAt: "2026-04-14T09:00:00.000Z",
          createdAt: "2026-04-14T09:00:00.000Z",
          updatedAt: "2026-04-14T09:00:00.000Z"
        }
      ]
    });

    render(
      <DashboardPage
        session={{
          sessionToken: "valid-token",
          staff: {
            _id: "staff-owner-1",
            displayName: "老板",
            role: "OWNER",
            username: "owner",
            storeId: "branch-01"
          }
        }}
        onLogout={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /异常处理/ })[0]);

    await waitFor(() => {
      expect(fetchOpsTasks).toHaveBeenCalledWith("valid-token", "OPEN", 50, "branch-01");
    });
    expect(screen.getByText("ops-panel:OPEN:1::")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ops-filter-resolved" }));

    await waitFor(() => {
      expect(fetchOpsTasks).toHaveBeenCalledWith("valid-token", "RESOLVED", 50, "branch-01");
    });

    fireEvent.click(screen.getByRole("button", { name: "retry-op" }));

    await waitFor(() => {
      expect(retryOpsTask).toHaveBeenCalledWith("valid-token", "ops-task-1", "branch-01");
    });

    fireEvent.click(screen.getByRole("button", { name: "resolve-op" }));

    await waitFor(() => {
      expect(resolveOpsTask).toHaveBeenCalledWith(
        "valid-token",
        {
          taskId: "ops-task-1",
          action: "RESOLVE",
          note: "老板已人工核对"
        },
        "branch-01"
      );
    });
  });

  it("loads menu and order workbench data only after the corresponding tab is opened", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(createDashboardPayload(6));
    vi.mocked(fetchOrders).mockResolvedValue({
      ok: true,
      rows: [
        {
          _id: "order-1",
          storeId: "branch-01",
          orderNo: "OD202604140001",
          memberId: "member-1",
          memberOpenId: "openid-1",
          memberCode: "M0001",
          nickname: "张三",
          status: "PENDING_CONFIRM",
          fulfillmentMode: "DINE_IN",
          sourceChannel: "MINIPROGRAM",
          tableNo: "A08",
          itemCount: 1,
          subtotalAmount: 32,
          payableAmount: 32,
          currency: "CNY",
          lineItems: [],
          submittedAt: "2026-04-14T09:00:00.000Z",
          statusChangedAt: "2026-04-14T09:00:00.000Z",
          createdAt: "2026-04-14T09:00:00.000Z",
          updatedAt: "2026-04-14T09:00:00.000Z"
        }
      ],
      pagination: {
        page: 1,
        pageSize: 8,
        total: 1,
        totalPages: 1,
        pageItemCount: 1,
        rangeStart: 1,
        rangeEnd: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    });
    vi.mocked(fetchOrderWorkbenchDetail).mockResolvedValue({
      ok: true,
      order: {
        _id: "order-1"
      } as never,
      logs: []
    });

    render(
      <DashboardPage
        session={{
          sessionToken: "valid-token",
          staff: {
            _id: "staff-owner-1",
            displayName: "老板",
            role: "OWNER",
            username: "owner",
            storeId: "branch-01"
          }
        }}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetchDashboard).toHaveBeenCalledWith("valid-token", "branch-01");
    });
    expect(fetchMenuConfig).not.toHaveBeenCalled();
    expect(fetchOrders).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /点餐菜单/ })[0]);

    await waitFor(() => {
      expect(fetchMenuConfig).toHaveBeenCalledWith("valid-token", "branch-01");
    });

    fireEvent.click(screen.getAllByRole("button", { name: /订单工作台/ })[0]);

    await waitFor(() => {
      expect(fetchOrders).toHaveBeenCalledWith("valid-token", "", undefined, 1, 8, "branch-01");
    });

    await waitFor(() => {
      expect(fetchOrderWorkbenchDetail).toHaveBeenCalledWith("valid-token", "order-1", "branch-01");
    });
  });

  it("stops auto-retrying the orders bootstrap request after the first failure and keeps the workbench visible", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(createDashboardPayload(6));
    vi.mocked(fetchOrders).mockRejectedValue(new Error("订单接口异常"));

    render(
      <DashboardPage
        session={{
          sessionToken: "valid-token",
          staff: {
            _id: "staff-owner-1",
            displayName: "老板",
            role: "OWNER",
            username: "owner",
            storeId: "branch-01"
          }
        }}
        onLogout={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /订单工作台/ })[0]);

    await waitFor(() => {
      expect(fetchOrders).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("订单接口异常");
    });

    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(fetchOrders).toHaveBeenCalledTimes(1);
    expect(screen.getByText("orders-panel")).toBeInTheDocument();
  });

  it("stops auto-retrying the members bootstrap request after the first failure", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(createDashboardPayload(6));
    vi.mocked(searchMembers).mockRejectedValue(new Error("会员接口异常"));

    render(
      <DashboardPage
        session={{
          sessionToken: "valid-token",
          staff: {
            _id: "staff-owner-1",
            displayName: "老板",
            role: "OWNER",
            username: "owner",
            storeId: "branch-01"
          }
        }}
        onLogout={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /会员管理/ })[0]);

    await waitFor(() => {
      expect(searchMembers).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("会员接口异常");
    });

    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(searchMembers).toHaveBeenCalledTimes(1);
  });
});

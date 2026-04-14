import type {
  AuditLog,
  DishVoucher,
  FeedbackTicket,
  InviteRelation,
  Member,
  MemberPointTransaction,
  MenuCategory,
  MenuItem,
  OpsTask,
  OrderRecord,
  OrderStatus,
  OrderStatusLog,
  PaginationMeta,
  PointExchangeItem,
  RewardRule,
  RewardRuleSaveSummary,
  StaffUser,
  StoreConfig,
  VisitRecord
} from "@restaurant/shared";
import { callFunction } from "./cloudbase";

function withStoreScope<T extends Record<string, unknown>>(payload: T, storeId?: string) {
  if (!storeId) {
    return payload;
  }

  return {
    ...payload,
    storeId
  };
}

export async function login(username: string, password: string, storeId: string) {
  return callFunction<{
    ok: true;
    sessionToken: string;
    staff: {
      _id: string;
      displayName: string;
      role: "OWNER" | "STAFF";
      username: string;
      miniOpenId?: string;
      storeId: string;
      accessScope: "STORE_ONLY" | "ALL_STORES";
      managedStoreIds: string[];
    };
  }>("auth-login", { username, password, storeId });
}

export async function fetchDashboard(sessionToken: string, storeId?: string) {
  return callFunction<{
    ok: true;
    stats: {
      memberCount: number;
      activatedInviteCount: number;
      readyVoucherCount: number;
      todayVisitCount: number;
      openOpsTaskCount: number;
    };
  }>("admin-dashboard", withStoreScope({ sessionToken }, storeId));
}

export async function fetchOpsTasks(
  sessionToken: string,
  status: OpsTask["status"] = "OPEN",
  limit = 50,
  storeId?: string
) {
  return callFunction<{ ok: true; tasks: OpsTask[] }>(
    "admin-ops-tasks-list",
    withStoreScope(
      {
        sessionToken,
        status,
        limit
      },
      storeId
    )
  );
}

export async function retryOpsTask(sessionToken: string, taskId: string, storeId?: string) {
  return callFunction<{
    ok: true;
    task: OpsTask;
    settlement: {
      state: "SETTLED" | "RETRYABLE" | "MANUAL_REVIEW";
      code?: string;
      reason?: string;
      visitRecordId?: string;
    };
  }>("admin-ops-tasks-retry", withStoreScope({ sessionToken, taskId }, storeId));
}

export async function resolveOpsTask(
  sessionToken: string,
  payload: {
    taskId: string;
    action: "RESOLVE" | "IGNORE";
    note?: string;
  },
  storeId?: string
) {
  return callFunction<{ ok: true; task: OpsTask }>(
    "admin-ops-tasks-resolve",
    withStoreScope(
      {
        sessionToken,
        ...payload
      },
      storeId
    )
  );
}

export async function fetchRules(sessionToken: string, storeId?: string) {
  return callFunction<{ ok: true; rules: RewardRule[]; exchangeItems: PointExchangeItem[] }>(
    "admin-rules-list",
    withStoreScope({ sessionToken }, storeId)
  );
}

export async function saveRules(
  sessionToken: string,
  rules: RewardRule[],
  exchangeItems: PointExchangeItem[],
  storeId?: string
) {
  return callFunction<{
    ok: true;
    rules: RewardRule[];
    exchangeItems: PointExchangeItem[];
    summary: RewardRuleSaveSummary & {
      createdCount: number;
      updatedCount: number;
      deletedCount: number;
      exchangeCreatedCount: number;
      exchangeUpdatedCount: number;
      exchangeDeletedCount: number;
    };
  }>("admin-rules-save", withStoreScope({ sessionToken, rules, exchangeItems }, storeId));
}

export interface MemberSearchRow {
  member: Member;
  relation?: InviteRelation | null;
  visits: VisitRecord[];
  vouchers: DishVoucher[];
}

export async function searchMembers(sessionToken: string, query = "", page = 1, pageSize = 8, storeId?: string) {
  return callFunction<{ ok: true; rows: MemberSearchRow[]; pagination: PaginationMeta }>(
    "admin-members-query",
    withStoreScope(
      {
        sessionToken,
        query,
        page,
        pageSize
      },
      storeId
    )
  );
}

export async function adjustBinding(
  sessionToken: string,
  inviteeMemberId: string,
  inviterMemberId: string,
  reason: string,
  storeId?: string
) {
  return callFunction<{ ok: true; relation: InviteRelation }>(
    "admin-binding-adjust",
    withStoreScope(
      {
        sessionToken,
        inviteeMemberId,
        inviterMemberId,
        reason
      },
      storeId
    )
  );
}

export async function adjustMemberPoints(
  sessionToken: string,
  memberId: string,
  delta: number,
  reason: string,
  storeId?: string
) {
  return callFunction<{
    ok: true;
    member: Member;
    pointTransaction: MemberPointTransaction;
  }>("admin-points-adjust", withStoreScope({ sessionToken, memberId, delta, reason }, storeId));
}

export async function listStaff(sessionToken: string, storeId?: string) {
  return callFunction<{ ok: true; staffUsers: Array<Omit<StaffUser, "passwordHash">> }>(
    "admin-staff-manage",
    withStoreScope(
      {
        sessionToken,
        action: "LIST"
      },
      storeId
    )
  );
}

export async function createStaff(
  sessionToken: string,
  user: {
    username: string;
    password: string;
    displayName: string;
    isEnabled: boolean;
  },
  storeId?: string
) {
  return callFunction<{ ok: true; staff: Omit<StaffUser, "passwordHash"> }>(
    "admin-staff-manage",
    withStoreScope(
      {
        sessionToken,
        action: "CREATE",
        user: {
          ...user,
          role: "STAFF"
        }
      },
      storeId
    )
  );
}

export async function updateStaff(
  sessionToken: string,
  user: {
    _id: string;
    displayName: string;
    role: "OWNER" | "STAFF";
    isEnabled: boolean;
    username: string;
  },
  storeId?: string
) {
  return callFunction<{ ok: true; staff: Omit<StaffUser, "passwordHash"> }>(
    "admin-staff-manage",
    withStoreScope(
      {
        sessionToken,
        action: "UPDATE_STATUS",
        user
      },
      storeId
    )
  );
}

export async function updateStaffPassword(
  sessionToken: string,
  user: {
    _id: string;
    username: string;
    password: string;
    displayName: string;
    role: "OWNER" | "STAFF";
  },
  storeId?: string
) {
  return callFunction<{ ok: true; staff: Omit<StaffUser, "passwordHash"> }>(
    "admin-staff-manage",
    withStoreScope(
      {
        sessionToken,
        action: "UPDATE_PASSWORD",
        user
      },
      storeId
    )
  );
}

export async function fetchAuditLogs(sessionToken: string, storeId?: string) {
  return callFunction<{ ok: true; logs: AuditLog[] }>("admin-audit-list", withStoreScope({ sessionToken }, storeId));
}

export async function fetchMenuConfig(sessionToken: string, storeId?: string) {
  return callFunction<{ ok: true; storeConfig: StoreConfig; categories: MenuCategory[]; items: MenuItem[] }>(
    "admin-menu-list",
    withStoreScope({ sessionToken }, storeId)
  );
}

export async function saveMenuConfig(
  sessionToken: string,
  payload: {
    storeConfig: StoreConfig;
    categories: MenuCategory[];
    items: MenuItem[];
  },
  storeId?: string
) {
  return callFunction<{ ok: true; storeConfig: StoreConfig; categories: MenuCategory[]; items: MenuItem[] }>(
    "admin-menu-save",
    withStoreScope(
      {
        sessionToken,
        ...payload
      },
      storeId
    )
  );
}

export async function fetchOrders(
  sessionToken: string,
  query = "",
  status?: OrderStatus,
  page = 1,
  pageSize = 8,
  storeId?: string
) {
  return callFunction<{ ok: true; rows: OrderRecord[]; pagination: PaginationMeta }>(
    "admin-orders-query",
    withStoreScope(
      {
        sessionToken,
        query,
        status,
        page,
        pageSize
      },
      storeId
    )
  );
}

export async function fetchOrderWorkbenchDetail(sessionToken: string, orderId: string, storeId?: string) {
  return callFunction<{ ok: true; order: OrderRecord; logs: OrderStatusLog[] }>(
    "staff-order-detail",
    withStoreScope(
      {
        sessionToken,
        orderId
      },
      storeId
    )
  );
}

export async function updateOrderWorkbenchStatus(
  sessionToken: string,
  payload: {
    orderId: string;
    nextStatus: "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
    note?: string;
  },
  storeId?: string
) {
  return callFunction<{
    ok: true;
    isIdempotent?: boolean;
    order: OrderRecord;
    visitSettlement?: {
      state: "SETTLED" | "RETRYABLE" | "MANUAL_REVIEW";
      code?: string;
      reason?: string;
      visitRecordId?: string;
    };
  }>(
    "staff-order-update",
    withStoreScope(
      {
        sessionToken,
        ...payload
      },
      storeId
    )
  );
}

export async function fetchFeedbackTickets(sessionToken: string, storeId?: string) {
  return callFunction<{ ok: true; tickets: FeedbackTicket[] }>(
    "admin-feedback-list",
    withStoreScope({ sessionToken }, storeId)
  );
}

export async function updateFeedbackTicket(
  sessionToken: string,
  payload: {
    feedbackId: string;
    status: "OPEN" | "PROCESSING" | "RESOLVED";
    priority: "NORMAL" | "HIGH" | "URGENT";
    ownerReply: string;
  },
  storeId?: string
) {
  return callFunction<{ ok: true; ticket: FeedbackTicket }>(
    "admin-feedback-update",
    withStoreScope(
      {
        sessionToken,
        ...payload
      },
      storeId
    )
  );
}

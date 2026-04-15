import { describe, expect, it, vi } from "vitest";
import {
  adjustBinding,
  dashboard,
  listOpsTasks,
  listRules,
  manageStaff,
  queryMembers,
  resolveOpsTask,
  retryOpsTask,
  saveRules
} from "../src/runtime/service.admin";
import { issueSessionToken } from "../src/runtime/auth";

process.env.SESSION_SECRET = "test-session-secret";

const sessionToken = issueSessionToken({
  staffUserId: "staff-owner-1",
  username: "owner",
  role: "OWNER",
  storeId: "default-store"
});
const staffSessionToken = issueSessionToken({
  staffUserId: "staff-1",
  username: "cashier01",
  role: "STAFF",
  storeId: "default-store"
});

describe("admin staff guardrails", () => {
  it("requires an explicit initial password when creating a staff account", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getStaffByUsername: vi.fn().mockResolvedValue(null)
    };

    await expect(
      manageStaff(repository as never, {
        sessionToken,
        action: "CREATE",
        user: {
          username: "waiter03",
          password: "      ",
          displayName: "服务员小周",
          role: "STAFF",
          isEnabled: true
        }
      })
    ).rejects.toMatchObject({
      message: "缺少员工初始密码"
    });
  });

  it("creates a staff account only when an initial password is provided", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getStaffByUsername: vi.fn().mockResolvedValue(null),
      saveStaffUser: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    await expect(
      manageStaff(repository as never, {
        sessionToken,
        action: "CREATE",
        user: {
          username: "waiter03",
          password: "initial-pass-01",
          displayName: "服务员小周",
          role: "STAFF",
          isEnabled: true
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      staff: {
        username: "waiter03",
        role: "STAFF",
        isEnabled: true
      }
    });

    expect(repository.saveStaffUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "waiter03",
        displayName: "服务员小周",
        role: "STAFF",
        isEnabled: true,
        passwordHash: expect.any(String)
      })
    );
  });

  it("rejects creating another owner account from the backend", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getStaffByUsername: vi.fn().mockResolvedValue(null)
    };

    await expect(
      manageStaff(repository as never, {
        sessionToken,
        action: "CREATE",
        user: {
          username: "owner2",
          password: "123456",
          displayName: "老板二号",
          role: "OWNER",
          isEnabled: true
        }
      })
    ).rejects.toMatchObject({
      message: "老板账号不支持在后台新增，请保留初始化老板主账号"
    });
  });

  it("allows the owner to update their own password", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "staff-owner-1",
          storeId: "default-store",
          username: "owner",
          passwordHash: "hash",
          displayName: "老板",
          role: "OWNER",
          isEnabled: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        })
        .mockResolvedValueOnce({
          _id: "staff-owner-1",
          storeId: "default-store",
          username: "owner",
          passwordHash: "hash",
          displayName: "老板",
          role: "OWNER",
          isEnabled: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }),
      saveStaffUser: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    await expect(
      manageStaff(repository as never, {
        sessionToken,
        action: "UPDATE_PASSWORD",
        user: {
          _id: "staff-owner-1",
          username: "owner",
          password: "new-owner-pass",
          displayName: "老板",
          role: "OWNER"
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      staff: {
        _id: "staff-owner-1",
        username: "owner"
      }
    });

    expect(repository.saveStaffUser).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "staff-owner-1",
        passwordHash: expect.any(String)
      })
    );
  });

  it("rejects disabling an existing owner account", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "staff-owner-1",
          storeId: "default-store",
          username: "owner",
          passwordHash: "hash",
          displayName: "老板",
          role: "OWNER",
          isEnabled: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        })
        .mockResolvedValueOnce({
          _id: "staff-owner-1",
          storeId: "default-store",
          username: "owner",
          passwordHash: "hash",
          displayName: "老板",
          role: "OWNER",
          isEnabled: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        })
    };

    await expect(
      manageStaff(repository as never, {
        sessionToken,
        action: "UPDATE_STATUS",
        user: {
          _id: "staff-owner-1",
          username: "owner",
          displayName: "老板",
          role: "OWNER",
          isEnabled: false
        }
      })
    ).rejects.toMatchObject({
      message: "老板主账号不支持在后台停用或改角色"
    });
  });

  it("only allows owners to read reward rules from the web backend", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listRewardRules: vi.fn()
    };

    await expect(listRules(repository as never, staffSessionToken)).rejects.toMatchObject({
      message: "只有老板账号可以查看奖励规则"
    });
  });

  it("returns dashboard stats from the repository without reloading all vouchers", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getDashboardStats: vi.fn().mockResolvedValue({
        memberCount: 12,
        activatedInviteCount: 4,
        readyVoucherCount: 1,
        todayVisitCount: 3,
        openOpsTaskCount: 2,
        todayOrderCount: 6,
        todayRevenueAmount: 288,
        pendingConfirmOrderCount: 1,
        readyOrderCount: 2,
        todayPointsIssued: 30,
        todayPointsRedeemed: 18,
        todayVoucherRedeemedCount: 2,
        memberBenefitsSkippedOrderCount: 1
      })
    };

    const result = await dashboard(repository as never, sessionToken);

    expect(result).toMatchObject({
      ok: true,
      stats: {
        readyVoucherCount: 1,
        openOpsTaskCount: 2
      }
    });
    expect(repository.getDashboardStats).toHaveBeenCalledTimes(1);
  });

  it("lists open ops tasks for the owner", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listOpsTasks: vi.fn().mockResolvedValue([
        {
          _id: "ops-task-1",
          storeId: "default-store",
          taskType: "ORDER_VISIT_SETTLEMENT",
          status: "OPEN",
          priority: "HIGH",
          title: "订单完成后会员结算未完成",
          description: "database unavailable",
          dedupeKey: "order-visit-settlement:order-1",
          sourceFunction: "staff.order.update",
          orderId: "order-1",
          orderNo: "OD202604140001",
          retryCount: 0,
          lastTriggeredAt: "2026-04-14T09:00:00.000Z",
          createdAt: "2026-04-14T09:00:00.000Z",
          updatedAt: "2026-04-14T09:00:00.000Z"
        }
      ])
    };

    const result = await listOpsTasks(repository as never, {
      sessionToken,
      status: "OPEN",
      limit: 20
    });

    expect(repository.listOpsTasks).toHaveBeenCalledWith("OPEN", 20);
    expect(result.tasks).toHaveLength(1);
  });

  it("marks an already settled ops task as resolved when the owner retries it", async () => {
    const saveOpsTask = vi.fn().mockImplementation(async (task) => task);
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getOpsTaskById: vi.fn().mockResolvedValue({
        _id: "ops-task-1",
        storeId: "default-store",
        taskType: "ORDER_VISIT_SETTLEMENT",
        status: "OPEN",
        priority: "HIGH",
        title: "订单完成后会员结算未完成",
        description: "database unavailable",
        dedupeKey: "order-visit-settlement:order-1",
        sourceFunction: "staff.order.update",
        orderId: "order-1",
        orderNo: "OD202604140001",
        retryCount: 0,
        lastTriggeredAt: "2026-04-14T09:00:00.000Z",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z"
      }),
      getOrderById: vi.fn().mockResolvedValue({
        _id: "order-1",
        storeId: "default-store",
        orderNo: "OD202604140001",
        memberId: "member-1",
        memberOpenId: "openid-1",
        memberCode: "M0001",
        visitRecordId: "visit-1",
        status: "COMPLETED",
        fulfillmentMode: "DINE_IN",
        sourceChannel: "MINIPROGRAM",
        itemCount: 1,
        subtotalAmount: 32,
        payableAmount: 32,
        currency: "CNY",
        lineItems: [],
        submittedAt: "2026-04-14T09:00:00.000Z",
        statusChangedAt: "2026-04-14T09:30:00.000Z",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:30:00.000Z"
      }),
      saveOpsTask,
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await retryOpsTask(repository as never, {
      sessionToken,
      taskId: "ops-task-1"
    });

    expect(result).toMatchObject({
      ok: true,
      settlement: {
        state: "SETTLED",
        visitRecordId: "visit-1"
      }
    });
    expect(saveOpsTask).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "ops-task-1",
        status: "RESOLVED",
        resolution: "RETRY_SUCCESS"
      })
    );
  });

  it("keeps an ops task open with a retry count when retry still fails", async () => {
    const saveOpsTask = vi.fn().mockImplementation(async (task) => task);
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getOpsTaskById: vi.fn().mockResolvedValue({
        _id: "ops-task-2",
        storeId: "default-store",
        taskType: "ORDER_VISIT_SETTLEMENT",
        status: "OPEN",
        priority: "HIGH",
        title: "订单完成后会员结算未完成",
        description: "会员不存在",
        dedupeKey: "order-visit-settlement:order-2",
        sourceFunction: "staff.order.update",
        orderId: "order-2",
        orderNo: "OD202604140002",
        retryCount: 0,
        lastTriggeredAt: "2026-04-14T09:00:00.000Z",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z"
      }),
      getOrderById: vi.fn().mockResolvedValue({
        _id: "order-2",
        storeId: "default-store",
        orderNo: "OD202604140002",
        memberId: "member-missing",
        memberOpenId: "openid-2",
        memberCode: "M0002",
        status: "COMPLETED",
        fulfillmentMode: "DINE_IN",
        sourceChannel: "MINIPROGRAM",
        itemCount: 1,
        subtotalAmount: 32,
        payableAmount: 32,
        currency: "CNY",
        lineItems: [],
        submittedAt: "2026-04-14T09:00:00.000Z",
        statusChangedAt: "2026-04-14T09:30:00.000Z",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:30:00.000Z"
      }),
      getMemberById: vi.fn().mockResolvedValue(null),
      getOpsTaskByDedupeKey: vi.fn().mockResolvedValue({
        _id: "ops-task-2",
        storeId: "default-store",
        taskType: "ORDER_VISIT_SETTLEMENT",
        status: "OPEN",
        priority: "HIGH",
        title: "订单完成后会员结算未完成",
        description: "会员不存在",
        dedupeKey: "order-visit-settlement:order-2",
        sourceFunction: "staff.order.update",
        orderId: "order-2",
        orderNo: "OD202604140002",
        retryCount: 0,
        lastTriggeredAt: "2026-04-14T09:00:00.000Z",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z"
      }),
      saveOpsTask,
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await retryOpsTask(repository as never, {
      sessionToken,
      taskId: "ops-task-2"
    });

    expect(result).toMatchObject({
      ok: true,
      settlement: {
        state: "MANUAL_REVIEW",
        code: "MEMBER_NOT_FOUND"
      }
    });
    expect(saveOpsTask).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "ops-task-2",
        status: "OPEN",
        retryCount: 1,
        lastErrorCode: "MEMBER_NOT_FOUND"
      })
    );
  });

  it("lets the owner manually resolve an open ops task", async () => {
    const saveOpsTask = vi.fn().mockImplementation(async (task) => task);
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getOpsTaskById: vi.fn().mockResolvedValue({
        _id: "ops-task-3",
        storeId: "default-store",
        taskType: "ORDER_VISIT_SETTLEMENT",
        status: "OPEN",
        priority: "URGENT",
        title: "订单完成后会员结算未完成",
        description: "会员不存在",
        dedupeKey: "order-visit-settlement:order-3",
        sourceFunction: "staff.order.update",
        orderId: "order-3",
        orderNo: "OD202604140003",
        retryCount: 0,
        lastTriggeredAt: "2026-04-14T09:00:00.000Z",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z"
      }),
      saveOpsTask,
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await resolveOpsTask(repository as never, {
      sessionToken,
      taskId: "ops-task-3",
      action: "RESOLVE",
      note: "已由老板线下核对"
    });

    expect(result).toMatchObject({
      ok: true,
      task: {
        _id: "ops-task-3",
        status: "RESOLVED",
        resolution: "MANUAL_RESOLVED",
        resolutionNote: "已由老板线下核对"
      }
    });
  });

  it("rejects resolving an ops task that is already closed", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getOpsTaskById: vi.fn().mockResolvedValue({
        _id: "ops-task-closed",
        storeId: "default-store",
        taskType: "ORDER_VISIT_SETTLEMENT",
        status: "RESOLVED",
        priority: "NORMAL",
        title: "订单完成后会员结算未完成",
        description: "已处理",
        dedupeKey: "order-visit-settlement:order-closed",
        sourceFunction: "staff.order.update",
        orderId: "order-closed",
        orderNo: "OD202604140099",
        retryCount: 1,
        lastTriggeredAt: "2026-04-14T09:00:00.000Z",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:20:00.000Z"
      }),
      saveOpsTask: vi.fn(),
      addAuditLog: vi.fn()
    };

    await expect(
      resolveOpsTask(repository as never, {
        sessionToken,
        taskId: "ops-task-closed",
        action: "RESOLVE",
        note: "重复提交"
      })
    ).rejects.toMatchObject({
      code: "OPS_TASK_CLOSED"
    });

    expect(repository.saveOpsTask).not.toHaveBeenCalled();
  });

  it("normalizes expired vouchers when owner queries members", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      searchMembers: vi.fn().mockResolvedValue([
        {
          _id: "member-1",
          storeId: "default-store",
          memberCode: "M00000001",
          openId: "openid-1",
          phone: "13812345678",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          hasCompletedFirstVisit: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }
      ]),
      listInviteRelationsByInviteeIds: vi.fn().mockResolvedValue([]),
      listVisitsByMemberIds: vi.fn().mockResolvedValue([]),
      listVouchersByMemberIds: vi.fn().mockResolvedValue([
        {
          _id: "voucher-expired",
          storeId: "default-store",
          memberId: "member-1",
          source: "WELCOME",
          dishId: "dish-1",
          dishName: "酸梅汤",
          status: "READY",
          expiresAt: "2026-04-01T00:00:00.000Z",
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z"
        }
      ]),
      saveVouchers: vi.fn().mockResolvedValue([])
    };

    const result = await queryMembers(repository as never, {
      sessionToken,
      query: "13812345678"
    });

    expect(result.rows[0]?.vouchers[0]?.status).toBe("EXPIRED");
    expect(result.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      pageItemCount: 1
    });
    expect(repository.saveVouchers).toHaveBeenCalledWith([
      expect.objectContaining({
        _id: "voucher-expired",
        status: "EXPIRED"
      })
    ]);
  });

  it("paginates member query results and only loads related data for the current page", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      searchMembers: vi.fn().mockResolvedValue([
        {
          _id: "member-3",
          storeId: "default-store",
          memberCode: "M00000003",
          openId: "openid-3",
          phone: "13800000003",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          hasCompletedFirstVisit: false,
          createdAt: "2026-04-03T08:00:00.000Z",
          updatedAt: "2026-04-05T08:00:00.000Z"
        },
        {
          _id: "member-2",
          storeId: "default-store",
          memberCode: "M00000002",
          openId: "openid-2",
          phone: "13800000002",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          hasCompletedFirstVisit: false,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-04T08:00:00.000Z"
        },
        {
          _id: "member-1",
          storeId: "default-store",
          memberCode: "M00000001",
          openId: "openid-1",
          phone: "13800000001",
          phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
          hasCompletedFirstVisit: false,
          createdAt: "2026-04-01T08:00:00.000Z",
          updatedAt: "2026-04-03T08:00:00.000Z"
        }
      ]),
      listInviteRelationsByInviteeIds: vi.fn().mockResolvedValue([]),
      listVisitsByMemberIds: vi.fn().mockResolvedValue([]),
      listVouchersByMemberIds: vi.fn().mockResolvedValue([]),
      saveVouchers: vi.fn().mockResolvedValue([])
    };

    const result = await queryMembers(repository as never, {
      sessionToken,
      query: "",
      page: 2,
      pageSize: 2
    });

    expect(result.pagination).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      pageItemCount: 1,
      rangeStart: 3,
      rangeEnd: 3,
      hasPrevPage: true,
      hasNextPage: false
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.member._id).toBe("member-1");
    expect(repository.listInviteRelationsByInviteeIds).toHaveBeenCalledWith(["member-1"]);
    expect(repository.listVisitsByMemberIds).toHaveBeenCalledWith(["member-1"]);
    expect(repository.listVouchersByMemberIds).toHaveBeenCalledWith(["member-1"]);
  });

  it("uses repository paging for the default member list when no query keyword is provided", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listMembersPage: vi.fn().mockResolvedValue({
        rows: [
          {
            _id: "member-10",
            storeId: "default-store",
            memberCode: "M00000010",
            openId: "openid-10",
            phone: "13800000010",
            phoneVerifiedAt: "2026-04-10T08:00:00.000Z",
            hasCompletedFirstVisit: true,
            createdAt: "2026-04-10T08:00:00.000Z",
            updatedAt: "2026-04-10T09:00:00.000Z"
          }
        ],
        total: 12
      }),
      searchMembers: vi.fn(),
      listInviteRelationsByInviteeIds: vi.fn().mockResolvedValue([]),
      listVisitsByMemberIds: vi.fn().mockResolvedValue([]),
      listVouchersByMemberIds: vi.fn().mockResolvedValue([]),
      saveVouchers: vi.fn().mockResolvedValue([])
    };

    const result = await queryMembers(repository as never, {
      sessionToken,
      query: "",
      page: 2,
      pageSize: 1
    });

    expect(repository.listMembersPage).toHaveBeenCalledWith(2, 1);
    expect(repository.searchMembers).not.toHaveBeenCalled();
    expect(result.rows).toHaveLength(1);
    expect(result.pagination).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 12,
      totalPages: 12,
      pageItemCount: 1,
      rangeStart: 2,
      rangeEnd: 2
    });
  });

  it("rejects full member query requests from staff accounts", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      searchMembers: vi.fn()
    };

    await expect(
      queryMembers(repository as never, {
        sessionToken: staffSessionToken,
        query: "13812345678"
      })
    ).rejects.toMatchObject({
      message: "只有老板账号可以查看完整会员数据"
    });

    expect(repository.searchMembers).not.toHaveBeenCalled();
  });

  it("returns empty rows without loading related collections when the current page has no members", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listMembersPage: vi.fn().mockResolvedValue({
        rows: [],
        total: 0
      }),
      listInviteRelationsByInviteeIds: vi.fn(),
      listVisitsByMemberIds: vi.fn(),
      listVouchersByMemberIds: vi.fn()
    };

    const result = await queryMembers(repository as never, {
      sessionToken,
      query: "",
      page: 1,
      pageSize: 10
    });

    expect(result).toMatchObject({
      ok: true,
      rows: [],
      pagination: {
        total: 0,
        page: 1,
        pageSize: 10
      }
    });
    expect(repository.listInviteRelationsByInviteeIds).not.toHaveBeenCalled();
    expect(repository.listVisitsByMemberIds).not.toHaveBeenCalled();
    expect(repository.listVouchersByMemberIds).not.toHaveBeenCalled();
  });

  it("rejects manual invite adjustments that point a member to themselves", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getMemberById: vi.fn().mockResolvedValue({
        _id: "member-1",
        storeId: "default-store",
        memberCode: "M00000001",
        openId: "openid-1",
        phone: "13812345678",
        phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
        hasCompletedFirstVisit: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue(null),
      saveInviteRelation: vi.fn(),
      addAuditLog: vi.fn()
    };

    await expect(
      adjustBinding(repository as never, {
        sessionToken,
        inviteeMemberId: "member-1",
        inviterMemberId: "member-1",
        reason: "顾客口头反馈"
      })
    ).rejects.toMatchObject({
      message: "邀请人和被邀请人不能是同一会员"
    });

    expect(repository.saveInviteRelation).not.toHaveBeenCalled();
    expect(repository.addAuditLog).not.toHaveBeenCalled();
  });

  it("reconciles old and new inviters after adjusting an activated invite binding", async () => {
    const membersById = {
      "member-invitee": {
        _id: "member-invitee",
        storeId: "default-store",
        memberCode: "M00000003",
        openId: "openid-invitee",
        phone: "13812345670",
        phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
        pointsBalance: 0,
        hasCompletedFirstVisit: true,
        firstVisitAt: "2026-04-03T09:00:00.000Z",
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z"
      },
      "member-old": {
        _id: "member-old",
        storeId: "default-store",
        memberCode: "M00000001",
        openId: "openid-old",
        phone: "13812345671",
        phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
        pointsBalance: 12,
        activatedInviteCount: 1,
        inviteRewardIssuedCounts: {
          "rule-1": 1
        },
        hasCompletedFirstVisit: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z"
      },
      "member-new": {
        _id: "member-new",
        storeId: "default-store",
        memberCode: "M00000002",
        openId: "openid-new",
        phone: "13812345672",
        phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
        pointsBalance: 0,
        activatedInviteCount: 0,
        inviteRewardIssuedCounts: {},
        hasCompletedFirstVisit: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z"
      }
    };
    const saveMember = vi.fn().mockImplementation(async (member) => member);
    const savePointTransactions = vi.fn().mockResolvedValue(undefined);
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getMemberById: vi.fn().mockImplementation(async (memberId) => membersById[memberId as keyof typeof membersById] ?? null),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue({
        _id: "invite-1",
        storeId: "default-store",
        inviterMemberId: "member-old",
        inviteeMemberId: "member-invitee",
        status: "ACTIVATED",
        activatedAt: "2026-04-03T09:00:00.000Z",
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z"
      }),
      saveInviteRelation: vi.fn().mockImplementation(async (relation) => relation),
      saveMember,
      listRewardRules: vi.fn().mockResolvedValue([
        {
          _id: "rule-1",
          storeId: "default-store",
          name: "邀请 1 人送 12 积分",
          type: "INVITE_MILESTONE",
          threshold: 1,
          rewardMode: "ONCE",
          pointsReward: 12,
          isEnabled: true,
          sortOrder: 0,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }
      ]),
      listInviteRelations: vi.fn().mockResolvedValue([
        {
          _id: "invite-1",
          storeId: "default-store",
          inviterMemberId: "member-new",
          inviteeMemberId: "member-invitee",
          status: "ACTIVATED",
          activatedAt: "2026-04-03T09:00:00.000Z",
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-03T09:00:00.000Z"
        }
      ]),
      listMemberPointTransactions: vi.fn().mockImplementation(async (memberId) => {
        if (memberId === "member-old") {
          return [
            {
              _id: "points-old-1",
              storeId: "default-store",
              memberId: "member-old",
              type: "INVITE_REWARD",
              changeAmount: 12,
              balanceAfter: 12,
              sourceRuleId: "rule-1",
              createdAt: "2026-04-03T09:00:00.000Z",
              updatedAt: "2026-04-03T09:00:00.000Z"
            }
          ];
        }

        return [];
      }),
      savePointTransactions,
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await adjustBinding(repository as never, {
      sessionToken,
      inviteeMemberId: "member-invitee",
      inviterMemberId: "member-new",
      reason: "顾客到店后核对口径"
    });

    expect(result).toMatchObject({
      ok: true,
      relation: {
        inviterMemberId: "member-new",
        inviteeMemberId: "member-invitee",
        status: "ACTIVATED"
      }
    });
    expect(repository.saveInviteRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        inviterMemberId: "member-new",
        status: "ACTIVATED",
        activatedAt: "2026-04-03T09:00:00.000Z"
      })
    );
    expect(saveMember).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "member-old",
        pointsBalance: 0,
        activatedInviteCount: 0
      })
    );
    expect(saveMember).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "member-new",
        pointsBalance: 12,
        activatedInviteCount: 1
      })
    );
    expect(savePointTransactions).toHaveBeenCalledTimes(2);
    expect(savePointTransactions).toHaveBeenCalledWith([
      expect.objectContaining({
        memberId: "member-old",
        changeAmount: -12,
        sourceRuleId: "rule-1"
      })
    ]);
    expect(savePointTransactions).toHaveBeenCalledWith([
      expect.objectContaining({
        memberId: "member-new",
        changeAmount: 12,
        sourceRuleId: "rule-1"
      })
    ]);
  });

  it("rejects the removed backend miniOpenId binding action", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn()
    };

    await expect(
      manageStaff(repository as never, {
        sessionToken,
        action: "BIND_MINI_OPEN_ID",
        user: {
          _id: "staff-2",
          username: "cashier02",
          displayName: "前台小李",
          role: "STAFF"
        }
      })
    ).rejects.toThrow();
    expect(repository.getStaffById).not.toHaveBeenCalled();
  });

  it("returns staff users in a stable owner-first order without password hashes", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listStaffUsers: vi.fn().mockResolvedValue([
        {
          _id: "staff-2",
          storeId: "default-store",
          username: "waiter02",
          passwordHash: "hash-staff-2",
          displayName: "店员二",
          role: "STAFF",
          isEnabled: false,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        },
        {
          _id: "staff-owner-1",
          storeId: "default-store",
          username: "owner",
          passwordHash: "hash-owner",
          displayName: "老板",
          role: "OWNER",
          isEnabled: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        },
        {
          _id: "staff-1",
          storeId: "default-store",
          username: "waiter01",
          passwordHash: "hash-staff-1",
          displayName: "店员一",
          role: "STAFF",
          isEnabled: true,
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }
      ])
    };

    const result = await manageStaff(repository as never, {
      sessionToken,
      action: "LIST"
    });

    expect(result.staffUsers.map((staffUser) => staffUser.username)).toEqual(["owner", "waiter01", "waiter02"]);
    expect(result.staffUsers.every((staffUser) => staffUser.passwordHash === undefined)).toBe(true);
  });

  it("rejects enabling multiple welcome rules in one save", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listRewardRules: vi.fn().mockResolvedValue([]),
      listPointExchangeItems: vi.fn().mockResolvedValue([])
    };

    await expect(
      saveRules(repository as never, {
        sessionToken,
        rules: [
          {
            name: "首单礼 1",
            type: "WELCOME",
            isEnabled: true,
            sortOrder: 0,
            voucherTemplate: {
              dishId: "dish-1",
              dishName: "酸梅汤",
              validDays: 30
            }
          },
          {
            name: "首单礼 2",
            type: "WELCOME",
            isEnabled: true,
            sortOrder: 1,
            voucherTemplate: {
              dishId: "dish-2",
              dishName: "凉菜",
              validDays: 30
            }
          }
        ]
      })
    ).rejects.toMatchObject({
      message: "新客礼最多只能启用 1 条规则"
    });
  });

  it("preserves existing rule createdAt and reports save summary", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listRewardRules: vi.fn().mockResolvedValue([
        {
          _id: "welcome-1",
          storeId: "default-store",
          name: "首单礼",
          type: "WELCOME",
          isEnabled: true,
          sortOrder: 0,
          voucherTemplate: {
            dishId: "dish-1",
            dishName: "酸梅汤",
            validDays: 30
          },
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z"
        }
      ]),
      listPointExchangeItems: vi.fn().mockResolvedValue([]),
      replaceRewardRules: vi.fn().mockResolvedValue(undefined),
      replacePointExchangeItems: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await saveRules(repository as never, {
      sessionToken,
      rules: [
        {
          _id: "welcome-1",
          name: "首单礼",
          type: "WELCOME",
          isEnabled: true,
          sortOrder: 0,
          voucherTemplate: {
            dishId: "dish-1",
            dishName: "酸梅汤",
            validDays: 30
          }
        },
        {
          name: "每满 3 人返凉菜",
          type: "INVITE_MILESTONE",
          threshold: 3,
          rewardMode: "REPEATABLE",
          isEnabled: true,
          sortOrder: 1,
          voucherTemplate: {
            dishId: "dish-3",
            dishName: "招牌凉菜",
            validDays: 30
          }
        }
      ]
    });

    expect(result).toMatchObject({
      ok: true,
      summary: {
        createdCount: 1,
        updatedCount: 1,
        deletedCount: 0,
        enabledWelcomeRuleCount: 1,
        enabledMilestoneRuleCount: 1,
        repeatableMilestoneRuleCount: 1
      }
    });
    expect(repository.replaceRewardRules).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          _id: "welcome-1",
          createdAt: "2026-03-01T00:00:00.000Z"
        })
      ])
    );
  });

  it("allows clearing all rules and reports deleted count", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listRewardRules: vi.fn().mockResolvedValue([
        {
          _id: "welcome-1",
          storeId: "default-store",
          name: "首单礼",
          type: "WELCOME",
          isEnabled: true,
          sortOrder: 0,
          voucherTemplate: {
            dishId: "dish-1",
            dishName: "酸梅汤",
            validDays: 30
          },
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z"
        },
        {
          _id: "invite-1",
          storeId: "default-store",
          name: "邀请 1 人返饮品",
          type: "INVITE_MILESTONE",
          threshold: 1,
          rewardMode: "ONCE",
          isEnabled: true,
          sortOrder: 1,
          voucherTemplate: {
            dishId: "dish-2",
            dishName: "柠檬茶",
            validDays: 30
          },
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z"
        }
      ]),
      listPointExchangeItems: vi.fn().mockResolvedValue([]),
      replaceRewardRules: vi.fn().mockResolvedValue(undefined),
      replacePointExchangeItems: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await saveRules(repository as never, {
      sessionToken,
      rules: []
    });

    expect(result).toMatchObject({
      ok: true,
      rules: [],
      summary: {
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 2,
        enabledWelcomeRuleCount: 0,
        enabledMilestoneRuleCount: 0,
        repeatableMilestoneRuleCount: 0
      }
    });
    expect(repository.replaceRewardRules).toHaveBeenCalledWith([]);
  });
});

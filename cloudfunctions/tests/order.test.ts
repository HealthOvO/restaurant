import { describe, expect, it, vi } from "vitest";
import { issueSessionToken } from "../src/runtime/auth";
import {
  createMemberOrder,
  listStaffOrders,
  queryAdminOrders,
  saveAdminMenu,
  updateStaffOrderStatus
} from "../src/runtime/service.order";

process.env.SESSION_SECRET = "test-session-secret";

const ownerSessionToken = issueSessionToken({
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

describe("order service safety", () => {
  it("rejects requestId collisions across different members", async () => {
    const repository = {
      storeId: "default-store",
      getStoreConfig: vi.fn().mockResolvedValue({
        _id: "store_config_default-store",
        storeId: "default-store",
        storeName: "山野食堂",
        dineInEnabled: true,
        pickupEnabled: true,
        minOrderAmount: 0,
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z"
      }),
      listMenuCategories: vi.fn().mockResolvedValue([
        {
          _id: "category-1",
          storeId: "default-store",
          name: "热菜",
          sortOrder: 0,
          isEnabled: true,
          createdAt: "2026-04-01T08:00:00.000Z",
          updatedAt: "2026-04-01T08:00:00.000Z"
        }
      ]),
      listMenuItems: vi.fn().mockResolvedValue([
        {
          _id: "dish-1",
          storeId: "default-store",
          categoryId: "category-1",
          name: "精品肥牛",
          price: 32,
          isEnabled: true,
          isRecommended: true,
          isSoldOut: false,
          sortOrder: 0,
          createdAt: "2026-04-01T08:00:00.000Z",
          updatedAt: "2026-04-01T08:00:00.000Z"
        }
      ]),
      getMemberByOpenId: vi.fn().mockResolvedValue({
        _id: "member-2",
        storeId: "default-store",
        memberCode: "M00000002",
        openId: "openid-member-2",
        phone: "13812345678",
        phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
        pointsBalance: 0,
        hasCompletedFirstVisit: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-03T08:00:00.000Z"
      }),
      runTransaction: vi.fn(async (callback) =>
        callback({
          getOrderById: vi.fn().mockResolvedValue({
            _id: "order_req-1",
            storeId: "default-store",
            orderNo: "OD202604140001",
            requestId: "req-1",
            memberId: "member-1",
            memberOpenId: "openid-member-1",
            memberCode: "M00000001",
            status: "PENDING_CONFIRM",
            fulfillmentMode: "DINE_IN",
            sourceChannel: "MINIPROGRAM",
            tableNo: "A01",
            itemCount: 1,
            subtotalAmount: 32,
            payableAmount: 32,
            currency: "CNY",
            lineItems: [],
            submittedAt: "2026-04-03T08:00:00.000Z",
            statusChangedAt: "2026-04-03T08:00:00.000Z",
            createdAt: "2026-04-03T08:00:00.000Z",
            updatedAt: "2026-04-03T08:00:00.000Z"
          })
        })
      ),
      addAuditLog: vi.fn()
    };

    await expect(
      createMemberOrder(repository as never, "openid-member-2", {
        requestId: "req-1",
        fulfillmentMode: "DINE_IN",
        tableNo: "A02",
        items: [{ menuItemId: "dish-1", quantity: 1 }]
      })
    ).rejects.toMatchObject({
      code: "ORDER_REQUEST_CONFLICT",
      message: "当前请求号已被其他订单占用，请刷新后重试"
    });

    expect(repository.addAuditLog).not.toHaveBeenCalled();
  });

  it("preserves createdAt when an owner updates menu categories and items", async () => {
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
      getStoreConfig: vi.fn().mockResolvedValue({
        _id: "store_config_default-store",
        storeId: "default-store",
        storeName: "山野食堂",
        dineInEnabled: true,
        pickupEnabled: true,
        minOrderAmount: 0,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      }),
      listMenuCategories: vi.fn().mockResolvedValue([
        {
          _id: "category-1",
          storeId: "default-store",
          name: "招牌热菜",
          sortOrder: 0,
          isEnabled: true,
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z"
        }
      ]),
      listMenuItems: vi.fn().mockResolvedValue([
        {
          _id: "dish-1",
          storeId: "default-store",
          categoryId: "category-1",
          name: "精品肥牛",
          price: 32,
          isEnabled: true,
          isRecommended: true,
          isSoldOut: false,
          sortOrder: 0,
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z"
        }
      ]),
      replaceMenuCategories: vi.fn().mockResolvedValue(undefined),
      replaceMenuItems: vi.fn().mockResolvedValue(undefined),
      saveStoreConfig: vi.fn().mockResolvedValue(undefined),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    await expect(
      saveAdminMenu(repository as never, {
        sessionToken: ownerSessionToken,
        categories: [
          {
            _id: "category-1",
            name: "招牌热菜",
            description: "现点现做",
            sortOrder: 0,
            isEnabled: true,
            heroTone: "ember"
          }
        ],
        items: [
          {
            _id: "dish-1",
            categoryId: "category-1",
            name: "精品肥牛",
            description: "人气热卖",
            price: 36,
            isEnabled: true,
            isRecommended: true,
            isSoldOut: false,
            sortOrder: 0,
            tags: ["热卖"],
            monthlySales: 188,
            optionGroups: []
          }
        ],
        storeConfig: {
          storeName: "山野食堂",
          storeSubtitle: "现点现做",
          announcement: "欢迎到店",
          address: "测试地址",
          contactPhone: "400-000-0000",
          businessHoursText: "10:00 - 22:00",
          dineInEnabled: true,
          pickupEnabled: true,
          minOrderAmount: 0,
          bannerTitle: "今天吃点热乎的",
          bannerSubtitle: "热菜饮品都能直接下单",
          bannerTags: ["堂食", "自提"],
          orderNotice: "下单后请留意状态"
        }
      })
    ).resolves.toMatchObject({
      ok: true
    });

    expect(repository.replaceMenuCategories).toHaveBeenCalledWith([
      expect.objectContaining({
        _id: "category-1",
        createdAt: "2026-03-02T00:00:00.000Z"
      })
    ]);
    expect(repository.replaceMenuItems).toHaveBeenCalledWith([
      expect.objectContaining({
        _id: "dish-1",
        createdAt: "2026-03-03T00:00:00.000Z"
      })
    ]);
    expect(repository.saveStoreConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "store_config_default-store",
        createdAt: "2026-03-01T00:00:00.000Z"
      })
    );
  });

  it("uses repository paging for default admin order queries", async () => {
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
      listOrdersPage: vi.fn().mockResolvedValue({
        rows: [
          {
            _id: "order-2",
            storeId: "default-store",
            orderNo: "OD202604140002",
            memberId: "member-2",
            memberOpenId: "openid-member-2",
            memberCode: "M00000002",
            status: "READY",
            fulfillmentMode: "PICKUP",
            sourceChannel: "MINIPROGRAM",
            itemCount: 1,
            subtotalAmount: 32,
            payableAmount: 32,
            currency: "CNY",
            lineItems: [],
            submittedAt: "2026-04-14T10:00:00.000Z",
            createdAt: "2026-04-14T10:00:00.000Z",
            updatedAt: "2026-04-14T10:00:00.000Z",
            statusChangedAt: "2026-04-14T10:00:00.000Z"
          }
        ],
        total: 6
      }),
      searchOrders: vi.fn()
    };

    const result = await queryAdminOrders(repository as never, {
      sessionToken: ownerSessionToken,
      query: "",
      status: "READY",
      page: 2,
      pageSize: 1
    });

    expect(repository.listOrdersPage).toHaveBeenCalledWith(2, 1, "READY");
    expect(repository.searchOrders).not.toHaveBeenCalled();
    expect(result.rows).toHaveLength(1);
    expect(result.pagination).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 6,
      totalPages: 6,
      rangeStart: 2,
      rangeEnd: 2
    });
  });

  it("uses repository paging for the staff order list when no keyword is provided", async () => {
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
      listOrdersPage: vi.fn().mockResolvedValue({
        rows: [
          {
            _id: "order-1",
            storeId: "default-store",
            orderNo: "OD202604140001",
            memberId: "member-1",
            memberOpenId: "openid-member-1",
            memberCode: "M00000001",
            status: "PENDING_CONFIRM",
            fulfillmentMode: "DINE_IN",
            sourceChannel: "MINIPROGRAM",
            itemCount: 1,
            subtotalAmount: 48,
            payableAmount: 48,
            currency: "CNY",
            lineItems: [],
            submittedAt: "2026-04-14T09:00:00.000Z",
            createdAt: "2026-04-14T09:00:00.000Z",
            updatedAt: "2026-04-14T09:00:00.000Z",
            statusChangedAt: "2026-04-14T09:00:00.000Z"
          }
        ],
        total: 1
      }),
      searchOrders: vi.fn()
    };

    const result = await listStaffOrders(repository as never, {
      sessionToken: staffSessionToken,
      keyword: "",
      limit: 20
    });

    expect(repository.listOrdersPage).toHaveBeenCalledWith(1, 20, undefined);
    expect(repository.searchOrders).not.toHaveBeenCalled();
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?._id).toBe("order-1");
  });

  it("marks settlement failures caused by member data as manual review", async () => {
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
      getMemberById: vi.fn().mockResolvedValue(null),
      getOpsTaskByDedupeKey: vi.fn().mockResolvedValue(null),
      saveOpsTask: vi.fn().mockImplementation(async (task) => task),
      runTransaction: vi.fn(async (callback) =>
        callback({
          getOrderById: vi.fn().mockResolvedValue({
            _id: "order-1",
            storeId: "default-store",
            orderNo: "OD202604140010",
            memberId: "member-missing",
            memberOpenId: "openid-member-1",
            memberCode: "M00000001",
            status: "READY",
            fulfillmentMode: "DINE_IN",
            sourceChannel: "MINIPROGRAM",
            tableNo: "A08",
            itemCount: 1,
            subtotalAmount: 48,
            payableAmount: 48,
            currency: "CNY",
            lineItems: [],
            submittedAt: "2026-04-14T09:00:00.000Z",
            createdAt: "2026-04-14T09:00:00.000Z",
            updatedAt: "2026-04-14T09:00:00.000Z",
            statusChangedAt: "2026-04-14T09:00:00.000Z",
            readyAt: "2026-04-14T09:10:00.000Z"
          }),
          saveOrder: vi.fn().mockResolvedValue(undefined),
          saveOrderStatusLog: vi.fn().mockResolvedValue(undefined)
        })
      ),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await updateStaffOrderStatus(repository as never, {
      sessionToken: staffSessionToken,
      orderId: "order-1",
      nextStatus: "COMPLETED",
      note: "顾客已取餐"
    });

    expect(result.visitSettlement).toMatchObject({
      state: "MANUAL_REVIEW",
      code: "MEMBER_NOT_FOUND",
      reason: "会员不存在"
    });
    expect(repository.saveOpsTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "OPEN",
        priority: "URGENT",
        orderId: "order-1",
        orderNo: "OD202604140010",
        memberId: "member-missing",
        lastErrorCode: "MEMBER_NOT_FOUND"
      })
    );
  });

  it("marks transient settlement failures as retryable", async () => {
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
      getMemberById: vi.fn().mockResolvedValue({
        _id: "member-1",
        storeId: "default-store",
        memberCode: "M00000001",
        openId: "openid-member-1",
        phone: "13812345678",
        phoneVerifiedAt: "2026-04-02T08:00:00.000Z",
        hasCompletedFirstVisit: false,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z"
      }),
      getVisitByExternalOrderNo: vi.fn().mockResolvedValue(null),
      getInviteRelationByInviteeId: vi.fn().mockResolvedValue(null),
      listRewardRules: vi.fn().mockRejectedValue(new Error("database unavailable")),
      listInviteRelations: vi.fn().mockResolvedValue([]),
      getOpsTaskByDedupeKey: vi.fn().mockResolvedValue(null),
      saveOpsTask: vi.fn().mockImplementation(async (task) => task),
      runTransaction: vi.fn(async (callback) =>
        callback({
          getOrderById: vi.fn().mockResolvedValue({
            _id: "order-2",
            storeId: "default-store",
            orderNo: "OD202604140011",
            memberId: "member-1",
            memberOpenId: "openid-member-1",
            memberCode: "M00000001",
            status: "READY",
            fulfillmentMode: "DINE_IN",
            sourceChannel: "MINIPROGRAM",
            tableNo: "A09",
            itemCount: 1,
            subtotalAmount: 52,
            payableAmount: 52,
            currency: "CNY",
            lineItems: [],
            submittedAt: "2026-04-14T10:00:00.000Z",
            createdAt: "2026-04-14T10:00:00.000Z",
            updatedAt: "2026-04-14T10:00:00.000Z",
            statusChangedAt: "2026-04-14T10:00:00.000Z",
            readyAt: "2026-04-14T10:10:00.000Z"
          }),
          saveOrder: vi.fn().mockResolvedValue(undefined),
          saveOrderStatusLog: vi.fn().mockResolvedValue(undefined)
        })
      ),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await updateStaffOrderStatus(repository as never, {
      sessionToken: staffSessionToken,
      orderId: "order-2",
      nextStatus: "COMPLETED",
      note: "顾客已取餐"
    });

    expect(result.visitSettlement).toMatchObject({
      state: "RETRYABLE",
      reason: "database unavailable"
    });
    expect(repository.saveOpsTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "OPEN",
        priority: "HIGH",
        orderId: "order-2",
        orderNo: "OD202604140011",
        memberId: "member-1"
      })
    );
  });
});

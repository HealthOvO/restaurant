import {
  adminMenuListInputSchema,
  adminMenuSaveInputSchema,
  adminOrdersQueryInputSchema,
  assertMenuConfigValid,
  assertOrderSubmissionReady,
  assertOrderStatusTransition,
  buildMenuCatalog,
  DomainError,
  menuCatalogInputSchema,
  orderCreateInputSchema,
  orderDetailInputSchema,
  orderPreviewInputSchema,
  previewOrder,
  staffOrderDetailInputSchema,
  staffOrderListInputSchema,
  staffOrderUpdateInputSchema,
  type AuditLog,
  type Member,
  type MenuCategory,
  type MenuItem,
  type OrderRecord,
  type OrderStatusLog,
  type StoreConfig
} from "@restaurant/shared";
import { createMemberCode } from "@restaurant/shared";
import { createId } from "./ids";
import { RestaurantRepository } from "./repository";
import { settleFirstVisit } from "./service.member";
import { classifyVisitSettlementFailure, upsertOrderVisitSettlementTask } from "./service.ops";
import { requireActiveStaffSession } from "./service.staff";

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeRequestId(value?: string): string {
  const normalized = `${value || ""}`.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized;
}

function buildRequestScopedId(prefix: string, requestId?: string): string {
  const normalized = sanitizeRequestId(requestId);
  if (!normalized) {
    return createId(prefix);
  }

  return `${prefix}_${normalized}`;
}

function buildOrderNo(orderId: string, now: string): string {
  const compactNow = now.replace(/[-:TZ.]/g, "").slice(0, 14);
  const compactId = orderId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-4);
  return `OD${compactNow}${compactId}`;
}

function createDefaultStoreConfig(storeId: string, now: string): StoreConfig {
  return {
    _id: `store_config_${storeId}`,
    storeId,
    storeName: "山野食堂",
    storeSubtitle: "现点现做，热菜和饮品都能直接下单",
    announcement: "高峰期请留意出餐顺序，堂食和自提都会及时更新状态。",
    address: "到店后可直接告诉店员桌号，也可先扫桌码下单。",
    contactPhone: "400-000-0000",
    businessHoursText: "10:30 - 22:00",
    dineInEnabled: true,
    pickupEnabled: true,
    minOrderAmount: 0,
    bannerTitle: "今天吃点热乎的",
    bannerSubtitle: "先下单，再看积分和菜品券到账。",
    bannerTags: ["现点现做", "支持堂食", "支持自提"],
    orderNotice: "下单后店员会在小程序里更新状态，做好后可以直接来取。",
    createdAt: now,
    updatedAt: now
  };
}

function createDefaultCategories(storeId: string, now: string): MenuCategory[] {
  return [
    {
      _id: "category-signature",
      storeId,
      name: "招牌热菜",
      description: "门店主推，适合第一次点",
      sortOrder: 0,
      isEnabled: true,
      heroTone: "ember",
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "category-snack",
      storeId,
      name: "小吃主食",
      description: "补一份主食或者加一盘小吃",
      sortOrder: 1,
      isEnabled: true,
      heroTone: "wheat",
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "category-drink",
      storeId,
      name: "清爽饮品",
      description: "适合搭配热菜和小吃",
      sortOrder: 2,
      isEnabled: true,
      heroTone: "jade",
      createdAt: now,
      updatedAt: now
    }
  ];
}

function createDefaultMenuItems(storeId: string, now: string): MenuItem[] {
  return [
    {
      _id: "dish-fat-beef",
      storeId,
      categoryId: "category-signature",
      name: "精品肥牛",
      description: "门店人气款，口感更嫩，适合搭配清爽蘸料。",
      price: 32,
      isEnabled: true,
      isRecommended: true,
      isSoldOut: false,
      sortOrder: 0,
      tags: ["招牌", "热卖"],
      monthlySales: 186,
      optionGroups: [
        {
          _id: "portion",
          name: "分量",
          required: true,
          multiSelect: false,
          choices: [
            {
              _id: "portion-regular",
              name: "常规份",
              priceDelta: 0,
              isEnabled: true,
              isDefault: true
            },
            {
              _id: "portion-large",
              name: "加大份",
              priceDelta: 10,
              isEnabled: true
            }
          ]
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "dish-spicy-chicken",
      storeId,
      categoryId: "category-signature",
      name: "香辣鸡块",
      description: "下饭型热菜，辣度可以自由选。",
      price: 28,
      isEnabled: true,
      isRecommended: true,
      isSoldOut: false,
      sortOrder: 1,
      tags: ["下饭"],
      monthlySales: 132,
      optionGroups: [
        {
          _id: "spicy-level",
          name: "辣度",
          required: true,
          multiSelect: false,
          choices: [
            {
              _id: "mild",
              name: "微辣",
              priceDelta: 0,
              isEnabled: true,
              isDefault: true
            },
            {
              _id: "medium",
              name: "中辣",
              priceDelta: 0,
              isEnabled: true
            },
            {
              _id: "hot",
              name: "重辣",
              priceDelta: 0,
              isEnabled: true
            }
          ]
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "dish-cucumber",
      storeId,
      categoryId: "category-snack",
      name: "凉拌黄瓜",
      description: "清爽开胃，适合搭配热菜。",
      price: 12,
      isEnabled: true,
      isRecommended: false,
      isSoldOut: false,
      sortOrder: 2,
      tags: ["凉菜"],
      monthlySales: 98,
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "dish-fried-rice",
      storeId,
      categoryId: "category-snack",
      name: "招牌炒饭",
      description: "粒粒分明，适合一人食或拼单补主食。",
      price: 18,
      isEnabled: true,
      isRecommended: true,
      isSoldOut: false,
      sortOrder: 3,
      tags: ["主食"],
      monthlySales: 154,
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "dish-fries",
      storeId,
      categoryId: "category-snack",
      name: "现炸薯条",
      description: "现炸现出，适合加餐或拼单。",
      price: 15,
      isEnabled: true,
      isRecommended: false,
      isSoldOut: false,
      sortOrder: 4,
      tags: ["小吃"],
      monthlySales: 87,
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "drink-lemon-tea",
      storeId,
      categoryId: "category-drink",
      name: "手打柠檬茶",
      description: "酸甜清爽，适合搭配油脂感更强的菜。",
      price: 13,
      isEnabled: true,
      isRecommended: true,
      isSoldOut: false,
      sortOrder: 5,
      tags: ["饮品"],
      monthlySales: 211,
      optionGroups: [
        {
          _id: "ice-level",
          name: "冰量",
          required: true,
          multiSelect: false,
          choices: [
            {
              _id: "ice-normal",
              name: "正常冰",
              priceDelta: 0,
              isEnabled: true,
              isDefault: true
            },
            {
              _id: "ice-less",
              name: "少冰",
              priceDelta: 0,
              isEnabled: true
            },
            {
              _id: "ice-none",
              name: "去冰",
              priceDelta: 0,
              isEnabled: true
            }
          ]
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      _id: "drink-plum",
      storeId,
      categoryId: "category-drink",
      name: "冰镇酸梅汤",
      description: "偏解腻，适合热菜较多时搭配。",
      price: 11,
      isEnabled: true,
      isRecommended: false,
      isSoldOut: false,
      sortOrder: 6,
      tags: ["解腻"],
      monthlySales: 103,
      createdAt: now,
      updatedAt: now
    }
  ];
}

async function writeAuditSafely(
  repository: RestaurantRepository,
  payload: Omit<AuditLog, "_id" | "createdAt" | "updatedAt" | "storeId">
): Promise<void> {
  try {
    const now = nowIso();
    await repository.addAuditLog({
      _id: createId("audit"),
      storeId: repository.storeId,
      createdAt: now,
      updatedAt: now,
      ...payload
    });
  } catch (error) {
    console.error("[audit] failed to persist log", payload.action, error);
  }
}

async function ensureOrderingSeeds(repository: RestaurantRepository): Promise<{
  storeConfig: StoreConfig;
  categories: MenuCategory[];
  items: MenuItem[];
}> {
  const [existingConfig, existingCategories, existingItems] = await Promise.all([
    repository.getStoreConfig(),
    repository.listMenuCategories(),
    repository.listMenuItems()
  ]);

  const now = nowIso();
  const storeConfig = existingConfig ?? createDefaultStoreConfig(repository.storeId, now);
  const categories = existingCategories.length > 0 ? existingCategories : createDefaultCategories(repository.storeId, now);
  const items = existingItems.length > 0 ? existingItems : createDefaultMenuItems(repository.storeId, now);

  if (!existingConfig) {
    await repository.saveStoreConfig(storeConfig);
  }
  if (existingCategories.length === 0) {
    await repository.replaceMenuCategories(categories);
  }
  if (existingItems.length === 0) {
    await repository.replaceMenuItems(items);
  }

  return { storeConfig, categories, items };
}

async function ensureMemberShell(repository: RestaurantRepository, openId: string) {
  const existingMember = await repository.getMemberByOpenId(openId);
  if (existingMember) {
    return existingMember;
  }

  const now = nowIso();
  const memberId = createId("member");
  const member: Member = {
    _id: memberId,
    storeId: repository.storeId,
    memberCode: createMemberCode(memberId),
    openId,
    nickname: undefined,
    pointsBalance: 0,
    hasCompletedFirstVisit: false,
    createdAt: now,
    updatedAt: now
  };
  await repository.saveMember(member);
  return member;
}

function buildPaginationMeta(total: number, requestedPage: number, pageSize: number) {
  if (total === 0) {
    return {
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
      pageItemCount: 0,
      rangeStart: 0,
      rangeEnd: 0,
      hasPrevPage: false,
      hasNextPage: false
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    pageItemCount: rangeEnd - rangeStart + 1,
    rangeStart,
    rangeEnd,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages
  };
}

function compareOrders(
  left: {
    createdAt: string;
    submittedAt?: string;
    orderNo: string;
  },
  right: {
    createdAt: string;
    submittedAt?: string;
    orderNo: string;
  }
) {
  if (right.createdAt !== left.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  if ((right.submittedAt ?? "") !== (left.submittedAt ?? "")) {
    return (right.submittedAt ?? "").localeCompare(left.submittedAt ?? "");
  }
  return right.orderNo.localeCompare(left.orderNo);
}

function assertStoreConfigValid(config: StoreConfig): void {
  if (!config.dineInEnabled && !config.pickupEnabled) {
    throw new DomainError("STORE_MODE_REQUIRED", "堂食和自提至少要开启一个");
  }
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function compareOrderLogs(
  left: {
    createdAt: string;
    updatedAt: string;
    _id: string;
  },
  right: {
    createdAt: string;
    updatedAt: string;
    _id: string;
  }
) {
  if (right.createdAt !== left.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  return right._id.localeCompare(left._id);
}

async function loadOrderPreviewContext(
  repository: RestaurantRepository,
  params: {
    items: Parameters<typeof previewOrder>[0]["items"];
    fulfillmentMode: Parameters<typeof previewOrder>[0]["fulfillmentMode"];
  }
) {
  const { storeConfig, items } = await ensureOrderingSeeds(repository);
  const preview = previewOrder({
    items: params.items,
    menuItems: items,
    storeConfig,
    fulfillmentMode: params.fulfillmentMode
  });

  return {
    storeConfig,
    preview
  };
}

export async function getMenuCatalog(repository: RestaurantRepository, input: unknown = {}) {
  menuCatalogInputSchema.parse(input);
  const { storeConfig, categories, items } = await ensureOrderingSeeds(repository);
  const visibleCatalog = buildMenuCatalog(categories, items);

  return {
    ok: true,
    storeConfig,
    categories: visibleCatalog.categories,
    items: visibleCatalog.items,
    recommendedItems: visibleCatalog.items.filter((item) => item.isRecommended).slice(0, 6)
  };
}

export async function previewMemberOrder(repository: RestaurantRepository, input: unknown) {
  const parsed = orderPreviewInputSchema.parse(input);
  const { preview, storeConfig } = await loadOrderPreviewContext(repository, parsed);

  return {
    ok: true,
    preview,
    storeConfig
  };
}

export async function createMemberOrder(repository: RestaurantRepository, callerOpenId: string, input: unknown) {
  const parsed = orderCreateInputSchema.parse(input);
  const sanitizedRequestId = sanitizeRequestId(parsed.requestId) || undefined;
  const normalizedRemark = normalizeOptionalText(parsed.remark);
  const { preview } = await loadOrderPreviewContext(repository, parsed);
  const member = await ensureMemberShell(repository, callerOpenId);
  assertOrderSubmissionReady({
    fulfillmentMode: parsed.fulfillmentMode,
    tableNo: parsed.tableNo,
    contactName: parsed.contactName
  });
  const normalizedTableNo = parsed.fulfillmentMode === "DINE_IN" ? normalizeOptionalText(parsed.tableNo) : undefined;
  const normalizedContactName =
    parsed.fulfillmentMode === "PICKUP" ? normalizeOptionalText(parsed.contactName) : undefined;
  const normalizedContactPhone =
    parsed.fulfillmentMode === "PICKUP" ? normalizeOptionalText(parsed.contactPhone) : undefined;

  const orderId = buildRequestScopedId("order", parsed.requestId);
  const now = nowIso();

  const result = await repository.runTransaction(async (transaction) => {
    const existingOrder = await transaction.getOrderById(orderId);
    if (existingOrder) {
      if (existingOrder.memberOpenId !== callerOpenId) {
        throw new DomainError("ORDER_REQUEST_CONFLICT", "当前请求号已被其他订单占用，请刷新后重试");
      }

      return {
        isIdempotent: true,
        order: existingOrder
      };
    }

    const orderNo = buildOrderNo(orderId, now);
    const order: OrderRecord = {
      _id: orderId,
      storeId: repository.storeId,
      orderNo,
      requestId: sanitizedRequestId,
      memberId: member._id,
      memberOpenId: callerOpenId,
      memberCode: member.memberCode,
      nickname: member.nickname,
      status: "PENDING_CONFIRM",
      fulfillmentMode: parsed.fulfillmentMode,
      sourceChannel: "MINIPROGRAM",
      tableNo: normalizedTableNo,
      contactName: normalizedContactName,
      contactPhone: normalizedContactPhone,
      remark: normalizedRemark,
      itemCount: preview.itemCount,
      subtotalAmount: preview.subtotalAmount,
      payableAmount: preview.payableAmount,
      currency: "CNY",
      lineItems: preview.lineItems,
      submittedAt: now,
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const statusLog: OrderStatusLog = {
      _id: createId("orderlog"),
      storeId: repository.storeId,
      orderId: order._id,
      orderNo: order.orderNo,
      status: order.status,
      operatorType: "MEMBER",
      operatorId: callerOpenId,
      operatorName: member.nickname || member.memberCode,
      note: normalizedRemark,
      createdAt: now,
      updatedAt: now
    };

    await transaction.saveOrder(order);
    await transaction.saveOrderStatusLog(statusLog);

    return {
      isIdempotent: false,
      order
    };
  });

  if (!result.isIdempotent) {
    await writeAuditSafely(repository, {
      actorId: member._id,
      actorType: "MEMBER",
      action: "CREATE_ORDER",
      targetCollection: "order_records",
      targetId: result.order._id,
      summary: `会员提交订单 ${result.order.orderNo}`,
      payload: {
        fulfillmentMode: result.order.fulfillmentMode,
        payableAmount: result.order.payableAmount,
        itemCount: result.order.itemCount
      }
    });
  }

  return {
    ok: true,
    isIdempotent: result.isIdempotent,
    order: result.order
  };
}

export async function listMemberOrders(repository: RestaurantRepository, callerOpenId: string) {
  const orders = await repository.listOrdersByMemberOpenId(callerOpenId);
  return {
    ok: true,
    orders: [...orders].sort(compareOrders)
  };
}

export async function getMemberOrderDetail(repository: RestaurantRepository, callerOpenId: string, input: unknown) {
  const parsed = orderDetailInputSchema.parse(input);
  const order = await repository.getOrderById(parsed.orderId);
  if (!order || order.memberOpenId !== callerOpenId) {
    throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
  }

  const logs = await repository.listOrderStatusLogsByOrderId(order._id);
  return {
    ok: true,
    order,
    logs: [...logs].sort(compareOrderLogs)
  };
}

export async function listStaffOrders(repository: RestaurantRepository, input: unknown) {
  const parsed = staffOrderListInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER" && staff.role !== "STAFF") {
    throw new DomainError("FORBIDDEN", "当前账号没有订单处理权限");
  }

  const shouldUseRepositoryPaging = !parsed.keyword.trim() && typeof repository.listOrdersPage === "function";
  const orders = shouldUseRepositoryPaging
    ? (await repository.listOrdersPage(1, parsed.limit, parsed.status)).rows
    : (await repository.searchOrders(parsed.keyword, parsed.status)).slice(0, parsed.limit);
  return {
    ok: true,
    orders
  };
}

export async function getStaffOrderDetail(repository: RestaurantRepository, input: unknown) {
  const parsed = staffOrderDetailInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER" && staff.role !== "STAFF") {
    throw new DomainError("FORBIDDEN", "当前账号没有订单处理权限");
  }

  const order = await repository.getOrderById(parsed.orderId);
  if (!order) {
    throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
  }

  const logs = await repository.listOrderStatusLogsByOrderId(order._id);
  return {
    ok: true,
    order,
    logs
  };
}

export async function updateStaffOrderStatus(repository: RestaurantRepository, input: unknown) {
  const parsed = staffOrderUpdateInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER" && staff.role !== "STAFF") {
    throw new DomainError("FORBIDDEN", "当前账号没有订单处理权限");
  }

  const now = nowIso();
  const result = await repository.runTransaction(async (transaction) => {
    const order = await transaction.getOrderById(parsed.orderId);
    if (!order) {
      throw new DomainError("ORDER_NOT_FOUND", "订单不存在");
    }

    assertOrderStatusTransition(order.status, parsed.nextStatus);
    if (order.status === parsed.nextStatus) {
      return {
        isIdempotent: true,
        order
      };
    }

    order.status = parsed.nextStatus;
    order.statusChangedAt = now;
    order.processedByStaffId = staff._id;
    order.updatedAt = now;

    if (parsed.nextStatus === "CONFIRMED") {
      order.confirmedAt = order.confirmedAt ?? now;
    }
    if (parsed.nextStatus === "PREPARING") {
      order.preparingAt = order.preparingAt ?? now;
    }
    if (parsed.nextStatus === "READY") {
      order.readyAt = order.readyAt ?? now;
    }
    if (parsed.nextStatus === "COMPLETED") {
      order.completedAt = order.completedAt ?? now;
    }
    if (parsed.nextStatus === "CANCELLED") {
      order.cancelledAt = order.cancelledAt ?? now;
      order.cancelledReason = parsed.note?.trim() || "门店手动取消";
    }

    const log: OrderStatusLog = {
      _id: createId("orderlog"),
      storeId: repository.storeId,
      orderId: order._id,
      orderNo: order.orderNo,
      status: order.status,
      operatorType: staff.role === "OWNER" ? "OWNER" : "STAFF",
      operatorId: staff._id,
      operatorName: staff.displayName,
      note: parsed.note?.trim(),
      createdAt: now,
      updatedAt: now
    };

    await transaction.saveOrder(order);
    await transaction.saveOrderStatusLog(log);
    return {
      isIdempotent: false,
      order
    };
  });

  let visitSettlement:
    | {
        state: "SETTLED" | "RETRYABLE" | "MANUAL_REVIEW";
        code?: string;
        reason?: string;
        visitRecordId?: string;
      }
    | undefined;

  if (result.order.status === "COMPLETED" && result.order.memberId && !result.order.visitRecordId) {
    try {
      const settlement = await settleFirstVisit(repository, {
        sessionToken: parsed.sessionToken,
        memberId: result.order.memberId,
        externalOrderNo: result.order.orderNo,
        tableNo: result.order.tableNo,
        notes: result.order.remark,
        operatorChannel: "MINIPROGRAM"
      });

      result.order.visitRecordId = settlement.settlement.visitRecord._id;
      result.order.updatedAt = nowIso();
      await repository.saveOrder(result.order);
      visitSettlement = {
        state: "SETTLED",
        visitRecordId: settlement.settlement.visitRecord._id
      };
    } catch (error) {
      const failure = classifyVisitSettlementFailure(error);
      await upsertOrderVisitSettlementTask(repository, {
        orderId: result.order._id,
        orderNo: result.order.orderNo,
        memberId: result.order.memberId,
        memberCode: result.order.memberCode,
        sourceFunction: "staff.order.update",
        failure
      });
      visitSettlement = {
        state: failure.state,
        code: failure.code,
        reason: failure.reason
      };
    }
  }

  if (!result.isIdempotent) {
    await writeAuditSafely(repository, {
      actorId: staff._id,
      actorType: staff.role === "OWNER" ? "OWNER" : "STAFF",
      action: "UPDATE_ORDER_STATUS",
      targetCollection: "order_records",
      targetId: result.order._id,
      summary: `订单 ${result.order.orderNo} 更新为 ${result.order.status}`,
      payload: {
        nextStatus: result.order.status,
        visitSettlement
      }
    });
  }

  return {
    ok: true,
    isIdempotent: result.isIdempotent,
    order: result.order,
    visitSettlement
  };
}

export async function listAdminMenu(repository: RestaurantRepository, token: string) {
  const { staff } = await requireActiveStaffSession(repository, token);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以管理菜单");
  }

  const { storeConfig, categories, items } = await ensureOrderingSeeds(repository);
  return {
    ok: true,
    storeConfig,
    categories,
    items
  };
}

export async function saveAdminMenu(repository: RestaurantRepository, input: unknown) {
  const parsed = adminMenuSaveInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以管理菜单");
  }

  const now = nowIso();
  const [existingConfig, existingCategories, existingItems] = await Promise.all([
    repository.getStoreConfig(),
    repository.listMenuCategories(),
    repository.listMenuItems()
  ]);
  const existingCategoryById = new Map(existingCategories.map((category) => [category._id, category]));
  const existingItemById = new Map(existingItems.map((item) => [item._id, item]));
  const categories: MenuCategory[] = parsed.categories.map((category, index) => ({
    _id: category._id ?? createId("menucat"),
    storeId: repository.storeId,
    name: category.name.trim(),
    description: category.description?.trim(),
    sortOrder: index,
    isEnabled: category.isEnabled,
    heroTone: category.heroTone?.trim(),
    createdAt: (category._id && existingCategoryById.get(category._id)?.createdAt) ?? now,
    updatedAt: now
  }));
  const items: MenuItem[] = parsed.items.map((item, index) => ({
    _id: item._id ?? createId("menuitem"),
    storeId: repository.storeId,
    categoryId: item.categoryId,
    name: item.name.trim(),
    description: item.description?.trim(),
    imageUrl: item.imageUrl,
    price: Number(item.price) || 0,
    isEnabled: item.isEnabled,
    isRecommended: item.isRecommended,
    isSoldOut: item.isSoldOut,
    sortOrder: index,
    tags: item.tags ?? [],
    monthlySales: Number(item.monthlySales) || 0,
    optionGroups: (item.optionGroups ?? []).map((group) => ({
      _id: group._id ?? createId("optgroup"),
      name: group.name.trim(),
      required: group.required,
      multiSelect: group.multiSelect,
      maxSelect: group.maxSelect,
      choices: group.choices.map((choice) => ({
        _id: choice._id ?? createId("optchoice"),
        name: choice.name.trim(),
        priceDelta: Number(choice.priceDelta) || 0,
        isEnabled: choice.isEnabled,
        isDefault: choice.isDefault
      }))
    })),
    createdAt: (item._id && existingItemById.get(item._id)?.createdAt) ?? now,
    updatedAt: now
  }));
  const storeConfig: StoreConfig = {
    _id: existingConfig?._id ?? `store_config_${repository.storeId}`,
    storeId: repository.storeId,
    createdAt: existingConfig?.createdAt ?? now,
    updatedAt: now,
    ...parsed.storeConfig
  };

  assertStoreConfigValid(storeConfig);
  assertMenuConfigValid(categories, items);

  await Promise.all([
    repository.replaceMenuCategories(categories),
    repository.replaceMenuItems(items),
    repository.saveStoreConfig(storeConfig)
  ]);

  await writeAuditSafely(repository, {
    actorId: staff._id,
    actorType: "OWNER",
    action: "SAVE_MENU_CONFIG",
    targetCollection: "menu_items",
    targetId: repository.storeId,
    summary: `更新门店 ${repository.storeId} 的点餐菜单`,
    payload: {
      categoryCount: categories.length,
      itemCount: items.length
    }
  });

  return {
    ok: true,
    storeConfig,
    categories,
    items
  };
}

export async function queryAdminOrders(repository: RestaurantRepository, input: unknown) {
  const parsed = adminOrdersQueryInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以查看订单");
  }

  const shouldUseRepositoryPaging = !parsed.query.trim() && typeof repository.listOrdersPage === "function";
  const pagedOrders = shouldUseRepositoryPaging ? await repository.listOrdersPage(parsed.page, parsed.pageSize, parsed.status) : null;
  const orders = pagedOrders ? pagedOrders.rows : (await repository.searchOrders(parsed.query, parsed.status)).sort(compareOrders);
  const pagination = buildPaginationMeta(pagedOrders ? pagedOrders.total : orders.length, parsed.page, parsed.pageSize);
  const pageOrders = pagedOrders
    ? orders
    : pagination.total === 0
      ? []
      : orders.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);

  return {
    ok: true,
    rows: pageOrders,
    pagination
  };
}

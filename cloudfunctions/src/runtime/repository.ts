import {
  COLLECTIONS,
  DEFAULT_STORE_ID,
  type FeedbackTicket,
  safeIncludes,
  type AuditLog,
  type DishVoucher,
  type InviteRelation,
  type MenuCategory,
  type MenuItem,
  type Member,
  type MemberPointTransaction,
  type OpsTask,
  type OrderRecord,
  type OrderStatusLog,
  type PointExchangeItem,
  type RewardRule,
  type StaffUser,
  type StoreConfig,
  type VisitRecord,
  type VoucherRedemption
} from "@restaurant/shared";
import { cloud } from "./cloud";

type CloudDoc<T> = T & { _id: string };
const PAGE_SIZE = 100;
type CloudTransaction = {
  collection: (name: string) => {
    doc: (id: string) => {
      get: () => Promise<{ data: unknown }>;
      create: (data: Object) => Promise<unknown>;
      set: (data: Object) => Promise<unknown>;
      update: (data: Object) => Promise<unknown>;
      remove: () => Promise<unknown>;
    };
  };
};
type SortDirection = "asc" | "desc";
type PagedListResult<T> = {
  rows: CloudDoc<T>[];
  total: number;
};

function dbCollection(name: string) {
  return cloud.database().collection(name);
}

function dbCommand() {
  return cloud.database().command;
}

function normalizeMember(member: Member | null): Member | null {
  if (!member) {
    return null;
  }

  return {
    ...member,
    pointsBalance: Number(member.pointsBalance) || 0
  };
}

function normalizeRewardRule(rule: RewardRule): RewardRule {
  return {
    ...rule,
    pointsReward: rule.type === "INVITE_MILESTONE" ? Number(rule.pointsReward) || 1 : undefined
  };
}

function normalizePointExchangeItem(item: PointExchangeItem): PointExchangeItem {
  return {
    ...item,
    pointsCost: Number(item.pointsCost) || 0
  };
}

function normalizeMenuItem(item: MenuItem): MenuItem {
  return {
    ...item,
    price: Number(item.price) || 0,
    monthlySales: Number(item.monthlySales) || 0,
    optionGroups: (item.optionGroups ?? []).map((group) => ({
      ...group,
      choices: group.choices.map((choice) => ({
        ...choice,
        priceDelta: Number(choice.priceDelta) || 0
      }))
    }))
  };
}

function normalizeStoreConfig(config: StoreConfig): StoreConfig {
  return {
    ...config,
    minOrderAmount: Number(config.minOrderAmount) || 0,
    bannerTags: config.bannerTags ?? []
  };
}

function normalizeOrderRecord(order: OrderRecord): OrderRecord {
  return {
    ...order,
    itemCount: Number(order.itemCount) || 0,
    subtotalAmount: Number(order.subtotalAmount) || 0,
    payableAmount: Number(order.payableAmount) || 0,
    lineItems: (order.lineItems ?? []).map((item) => ({
      ...item,
      quantity: Number(item.quantity) || 0,
      basePrice: Number(item.basePrice) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      lineTotal: Number(item.lineTotal) || 0,
      selectedOptions: item.selectedOptions ?? []
    }))
  };
}

function txDocument(transaction: CloudTransaction, name: string, id: string) {
  return transaction.collection(name).doc(id);
}

async function getByIdInTransaction<T extends { storeId: string }>(
  transaction: CloudTransaction,
  name: string,
  id: string,
  storeId: string
): Promise<CloudDoc<T> | null> {
  const result = await txDocument(transaction, name, id).get().catch(() => null);
  const document = (result?.data as CloudDoc<T> | undefined) ?? null;
  if (!document || document.storeId !== storeId) {
    return null;
  }

  return document;
}

async function saveDocumentInTransaction<T extends { _id: string; storeId: string }>(
  transaction: CloudTransaction,
  name: string,
  data: T
): Promise<T> {
  const existing = await getByIdInTransaction(transaction, name, data._id, data.storeId);
  if (existing) {
    await txDocument(transaction, name, data._id).set(data);
    return data;
  }

  await txDocument(transaction, name, data._id).create(data);
  return data;
}

async function createDocumentInTransaction<T extends { _id: string }>(
  transaction: CloudTransaction,
  name: string,
  data: T
): Promise<T> {
  await txDocument(transaction, name, data._id).create(data);
  return data;
}

async function getById<T extends { storeId: string }>(name: string, id: string, storeId: string): Promise<CloudDoc<T> | null> {
  const result = await dbCollection(name).doc(id).get().catch(() => null);
  const document = (result?.data as CloudDoc<T> | undefined) ?? null;
  if (!document || document.storeId !== storeId) {
    return null;
  }
  return document;
}

async function listByWhere<T>(name: string, where: Record<string, unknown>): Promise<CloudDoc<T>[]> {
  const rows: CloudDoc<T>[] = [];
  let skip = 0;

  while (true) {
    const result = await dbCollection(name).where(where).skip(skip).limit(PAGE_SIZE).get();
    const batch = (result.data as CloudDoc<T>[]) ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      return rows;
    }

    skip += batch.length;
  }
}

async function listPageByWhere<T>(
  name: string,
  where: Record<string, unknown>,
  page: number,
  pageSize: number,
  orderBy: Array<{ field: string; direction: SortDirection }>
): Promise<PagedListResult<T>> {
  const normalizedPage = Math.max(1, Math.trunc(page || 1));
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize || 1));
  const baseQuery = dbCollection(name).where(where) as any;
  const countResult = await baseQuery.count();
  const total = Number(countResult?.total) || 0;

  if (total === 0) {
    return {
      rows: [],
      total: 0
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const safePage = Math.min(normalizedPage, totalPages);
  let orderedQuery = dbCollection(name).where(where) as any;
  for (const sortRule of orderBy) {
    orderedQuery = orderedQuery.orderBy(sortRule.field, sortRule.direction);
  }

  const result = await orderedQuery
    .skip((safePage - 1) * normalizedPageSize)
    .limit(normalizedPageSize)
    .get();

  return {
    rows: (result?.data as CloudDoc<T>[]) ?? [],
    total
  };
}

async function countByWhere(name: string, where: Record<string, unknown>): Promise<number> {
  const result = await (dbCollection(name).where(where) as any).count();
  return Number(result?.total) || 0;
}

function getShanghaiDayRange() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((item) => item.type === "year")?.value ?? "1970";
  const month = parts.find((item) => item.type === "month")?.value ?? "01";
  const day = parts.find((item) => item.type === "day")?.value ?? "01";
  const dayString = `${year}-${month}-${day}`;
  const todayStart = new Date(`${dayString}T00:00:00+08:00`).toISOString();
  const tomorrow = new Date(`${dayString}T00:00:00+08:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStart = tomorrow.toISOString();

  return {
    todayStart,
    tomorrowStart
  };
}

async function listByFieldIn<T>(
  name: string,
  storeId: string,
  field: string,
  values: string[]
): Promise<CloudDoc<T>[]> {
  if (values.length === 0) {
    return [];
  }

  const _ = dbCommand();
  const batches: Array<Promise<CloudDoc<T>[]>> = [];

  for (let index = 0; index < values.length; index += PAGE_SIZE) {
    const chunk = values.slice(index, index + PAGE_SIZE);
    batches.push(
      listByWhere<T>(name, {
        storeId,
        [field]: _.in(chunk)
      })
    );
  }

  return (await Promise.all(batches)).flat();
}

async function addDocument<T extends { _id: string }>(name: string, data: T): Promise<T> {
  await dbCollection(name).add({ data });
  return data;
}

export function sanitizeUpdateData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  const { _id, ...rest } = data as Record<string, unknown>;
  return rest;
}

async function updateDocument(name: string, id: string, data: unknown): Promise<void> {
  await dbCollection(name).doc(id).update({ data: sanitizeUpdateData(data) });
}

async function removeDocument(name: string, id: string): Promise<void> {
  await dbCollection(name).doc(id).remove();
}

export interface RepositoryTransaction {
  getMemberById(memberId: string): Promise<Member | null>;
  saveMember(member: Member): Promise<Member>;
  getInviteRelationById(relationId: string): Promise<InviteRelation | null>;
  saveInviteRelation(relation: InviteRelation): Promise<InviteRelation>;
  createVisitRecord(record: VisitRecord): Promise<VisitRecord>;
  getOrderById(orderId: string): Promise<OrderRecord | null>;
  saveOrder(order: OrderRecord): Promise<OrderRecord>;
  saveOrderStatusLog(log: OrderStatusLog): Promise<OrderStatusLog>;
  getPointExchangeItemById(itemId: string): Promise<PointExchangeItem | null>;
  getVoucherById(voucherId: string): Promise<DishVoucher | null>;
  saveVoucher(voucher: DishVoucher): Promise<DishVoucher>;
  getPointTransactionById(transactionId: string): Promise<MemberPointTransaction | null>;
  getVoucherRedemptionById(redemptionId: string): Promise<VoucherRedemption | null>;
  saveVoucherRedemption(redemption: VoucherRedemption): Promise<VoucherRedemption>;
  savePointTransaction(transaction: MemberPointTransaction): Promise<MemberPointTransaction>;
  savePointTransactions(transactions: MemberPointTransaction[]): Promise<MemberPointTransaction[]>;
}

export class RestaurantRepository {
  readonly storeId: string;

  constructor(storeId = DEFAULT_STORE_ID) {
    this.storeId = storeId;
  }

  async getMemberById(memberId: string): Promise<Member | null> {
    return normalizeMember(await getById<Member>(COLLECTIONS.members, memberId, this.storeId));
  }

  async getMemberByOpenId(openId: string): Promise<Member | null> {
    const [member] = await listByWhere<Member>(COLLECTIONS.members, {
      storeId: this.storeId,
      openId
    });
    return normalizeMember(member ?? null);
  }

  async getMemberByPhone(phone: string): Promise<Member | null> {
    const [member] = await listByWhere<Member>(COLLECTIONS.members, {
      storeId: this.storeId,
      phone
    });
    return normalizeMember(member ?? null);
  }

  async listMembers(): Promise<Member[]> {
    return (await listByWhere<Member>(COLLECTIONS.members, {
      storeId: this.storeId
    })).map((member) => normalizeMember(member) as Member);
  }

  async listMembersPage(page: number, pageSize: number): Promise<{ rows: Member[]; total: number }> {
    const result = await listPageByWhere<Member>(COLLECTIONS.members, { storeId: this.storeId }, page, pageSize, [
      { field: "updatedAt", direction: "desc" },
      { field: "firstVisitAt", direction: "desc" },
      { field: "createdAt", direction: "desc" },
      { field: "memberCode", direction: "desc" }
    ]);

    return {
      rows: result.rows.map((member) => normalizeMember(member) as Member),
      total: result.total
    };
  }

  async saveMember(member: Member): Promise<Member> {
    const normalizedMember = normalizeMember(member) as Member;
    const existing = await this.getMemberById(member._id);
    if (existing) {
      await updateDocument(COLLECTIONS.members, member._id, normalizedMember);
      return normalizedMember;
    }

    return addDocument(COLLECTIONS.members, normalizedMember);
  }

  async getInviteRelationByInviteeId(inviteeMemberId: string): Promise<InviteRelation | null> {
    const [relation] = await listByWhere<InviteRelation>(COLLECTIONS.inviteRelations, {
      storeId: this.storeId,
      inviteeMemberId
    });
    return relation ?? null;
  }

  async listInviteRelations(): Promise<InviteRelation[]> {
    return listByWhere<InviteRelation>(COLLECTIONS.inviteRelations, {
      storeId: this.storeId
    });
  }

  async saveInviteRelation(relation: InviteRelation): Promise<InviteRelation> {
    const existing = await getById<InviteRelation>(COLLECTIONS.inviteRelations, relation._id, this.storeId);
    if (existing) {
      await updateDocument(COLLECTIONS.inviteRelations, relation._id, relation);
      return relation;
    }

    return addDocument(COLLECTIONS.inviteRelations, relation);
  }

  async listInviteRelationsByInviteeIds(inviteeMemberIds: string[]): Promise<InviteRelation[]> {
    return listByFieldIn<InviteRelation>(COLLECTIONS.inviteRelations, this.storeId, "inviteeMemberId", inviteeMemberIds);
  }

  async getVisitByMemberAndOrder(memberId: string, externalOrderNo: string): Promise<VisitRecord | null> {
    const [record] = await listByWhere<VisitRecord>(COLLECTIONS.visitRecords, {
      storeId: this.storeId,
      memberId,
      externalOrderNo
    });
    return record ?? null;
  }

  async getVisitByExternalOrderNo(externalOrderNo: string): Promise<VisitRecord | null> {
    const [record] = await listByWhere<VisitRecord>(COLLECTIONS.visitRecords, {
      storeId: this.storeId,
      externalOrderNo
    });
    return record ?? null;
  }

  async listVisitsByMember(memberId: string): Promise<VisitRecord[]> {
    return listByWhere<VisitRecord>(COLLECTIONS.visitRecords, {
      storeId: this.storeId,
      memberId
    });
  }

  async listVisitsByMemberIds(memberIds: string[]): Promise<VisitRecord[]> {
    return listByFieldIn<VisitRecord>(COLLECTIONS.visitRecords, this.storeId, "memberId", memberIds);
  }

  async listAllVisits(): Promise<VisitRecord[]> {
    return listByWhere<VisitRecord>(COLLECTIONS.visitRecords, {
      storeId: this.storeId
    });
  }

  async saveVisitRecord(record: VisitRecord): Promise<VisitRecord> {
    return addDocument(COLLECTIONS.visitRecords, record);
  }

  async listRewardRules(): Promise<RewardRule[]> {
    const result = await listByWhere<RewardRule>(COLLECTIONS.rewardRules, {
      storeId: this.storeId
    });
    return result.map(normalizeRewardRule).sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async replaceRewardRules(rules: RewardRule[]): Promise<RewardRule[]> {
    const existing = await this.listRewardRules();
    const existingIds = new Set(existing.map((rule) => rule._id));
    const nextIds = new Set(rules.map((rule) => rule._id));

    await Promise.all(
      existing
        .filter((rule) => !nextIds.has(rule._id))
        .map((rule) => removeDocument(COLLECTIONS.rewardRules, rule._id).catch(() => undefined))
    );

    await Promise.all(
      rules.map((rule) => {
        if (existingIds.has(rule._id)) {
          return updateDocument(COLLECTIONS.rewardRules, rule._id, rule);
        }
        return addDocument(COLLECTIONS.rewardRules, rule);
      })
    );

    return rules;
  }

  async listPointExchangeItems(): Promise<PointExchangeItem[]> {
    const items = await listByWhere<PointExchangeItem>(COLLECTIONS.pointExchangeItems, {
      storeId: this.storeId
    });

    return items.map(normalizePointExchangeItem).sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async getPointExchangeItemById(itemId: string): Promise<PointExchangeItem | null> {
    const item = await getById<PointExchangeItem>(COLLECTIONS.pointExchangeItems, itemId, this.storeId);
    return item ? normalizePointExchangeItem(item) : null;
  }

  async replacePointExchangeItems(items: PointExchangeItem[]): Promise<PointExchangeItem[]> {
    const existing = await this.listPointExchangeItems();
    const existingIds = new Set(existing.map((item) => item._id));
    const nextIds = new Set(items.map((item) => item._id));

    await Promise.all(
      existing
        .filter((item) => !nextIds.has(item._id))
        .map((item) => removeDocument(COLLECTIONS.pointExchangeItems, item._id).catch(() => undefined))
    );

    await Promise.all(
      items.map((item) => {
        if (existingIds.has(item._id)) {
          return updateDocument(COLLECTIONS.pointExchangeItems, item._id, item);
        }

        return addDocument(COLLECTIONS.pointExchangeItems, item);
      })
    );

    return items;
  }

  async listMemberVouchers(memberId: string): Promise<DishVoucher[]> {
    return listByWhere<DishVoucher>(COLLECTIONS.dishVouchers, {
      storeId: this.storeId,
      memberId
    });
  }

  async listVouchersByMemberIds(memberIds: string[]): Promise<DishVoucher[]> {
    return listByFieldIn<DishVoucher>(COLLECTIONS.dishVouchers, this.storeId, "memberId", memberIds);
  }

  async listAllVouchers(): Promise<DishVoucher[]> {
    return listByWhere<DishVoucher>(COLLECTIONS.dishVouchers, {
      storeId: this.storeId
    });
  }

  async getVoucherById(voucherId: string): Promise<DishVoucher | null> {
    return getById<DishVoucher>(COLLECTIONS.dishVouchers, voucherId, this.storeId);
  }

  async saveVoucher(voucher: DishVoucher): Promise<DishVoucher> {
    const existing = await this.getVoucherById(voucher._id);
    if (existing) {
      await updateDocument(COLLECTIONS.dishVouchers, voucher._id, voucher);
      return voucher;
    }

    return addDocument(COLLECTIONS.dishVouchers, voucher);
  }

  async saveVouchers(vouchers: DishVoucher[]): Promise<DishVoucher[]> {
    await Promise.all(vouchers.map((voucher) => this.saveVoucher(voucher)));
    return vouchers;
  }

  async saveVoucherRedemption(redemption: VoucherRedemption): Promise<VoucherRedemption> {
    return addDocument(COLLECTIONS.voucherRedemptions, redemption);
  }

  async listMenuCategories(): Promise<MenuCategory[]> {
    return (await listByWhere<MenuCategory>(COLLECTIONS.menuCategories, {
      storeId: this.storeId
    })).sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async replaceMenuCategories(categories: MenuCategory[]): Promise<MenuCategory[]> {
    const existing = await this.listMenuCategories();
    const existingIds = new Set(existing.map((category) => category._id));
    const nextIds = new Set(categories.map((category) => category._id));

    await Promise.all(
      existing
        .filter((category) => !nextIds.has(category._id))
        .map((category) => removeDocument(COLLECTIONS.menuCategories, category._id).catch(() => undefined))
    );

    await Promise.all(
      categories.map((category) => {
        if (existingIds.has(category._id)) {
          return updateDocument(COLLECTIONS.menuCategories, category._id, category);
        }

        return addDocument(COLLECTIONS.menuCategories, category);
      })
    );

    return categories;
  }

  async listMenuItems(): Promise<MenuItem[]> {
    return (await listByWhere<MenuItem>(COLLECTIONS.menuItems, {
      storeId: this.storeId
    }))
      .map(normalizeMenuItem)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async getMenuItemById(itemId: string): Promise<MenuItem | null> {
    const item = await getById<MenuItem>(COLLECTIONS.menuItems, itemId, this.storeId);
    return item ? normalizeMenuItem(item) : null;
  }

  async replaceMenuItems(items: MenuItem[]): Promise<MenuItem[]> {
    const existing = await this.listMenuItems();
    const existingIds = new Set(existing.map((item) => item._id));
    const nextIds = new Set(items.map((item) => item._id));

    await Promise.all(
      existing
        .filter((item) => !nextIds.has(item._id))
        .map((item) => removeDocument(COLLECTIONS.menuItems, item._id).catch(() => undefined))
    );

    await Promise.all(
      items.map((item) => {
        const normalizedItem = normalizeMenuItem(item);
        if (existingIds.has(item._id)) {
          return updateDocument(COLLECTIONS.menuItems, item._id, normalizedItem);
        }

        return addDocument(COLLECTIONS.menuItems, normalizedItem);
      })
    );

    return items.map(normalizeMenuItem);
  }

  async getStoreConfig(): Promise<StoreConfig | null> {
    const [config] = await listByWhere<StoreConfig>(COLLECTIONS.storeConfigs, {
      storeId: this.storeId
    });
    return config ? normalizeStoreConfig(config) : null;
  }

  async saveStoreConfig(config: StoreConfig): Promise<StoreConfig> {
    const normalizedConfig = normalizeStoreConfig(config);
    const existing = await this.getStoreConfig();
    if (existing) {
      await updateDocument(COLLECTIONS.storeConfigs, normalizedConfig._id, normalizedConfig);
      return normalizedConfig;
    }

    return addDocument(COLLECTIONS.storeConfigs, normalizedConfig);
  }

  async getOrderById(orderId: string): Promise<OrderRecord | null> {
    const order = await getById<OrderRecord>(COLLECTIONS.orderRecords, orderId, this.storeId);
    return order ? normalizeOrderRecord(order) : null;
  }

  async listOrdersByMemberOpenId(memberOpenId: string): Promise<OrderRecord[]> {
    return (await listByWhere<OrderRecord>(COLLECTIONS.orderRecords, {
      storeId: this.storeId,
      memberOpenId
    }))
      .map(normalizeOrderRecord)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listOrders(): Promise<OrderRecord[]> {
    return (await listByWhere<OrderRecord>(COLLECTIONS.orderRecords, {
      storeId: this.storeId
    }))
      .map(normalizeOrderRecord)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listOrdersPage(page: number, pageSize: number, status?: OrderRecord["status"]): Promise<{ rows: OrderRecord[]; total: number }> {
    const where: Record<string, unknown> = {
      storeId: this.storeId
    };
    if (status) {
      where.status = status;
    }

    const result = await listPageByWhere<OrderRecord>(COLLECTIONS.orderRecords, where, page, pageSize, [
      { field: "createdAt", direction: "desc" },
      { field: "submittedAt", direction: "desc" },
      { field: "orderNo", direction: "desc" }
    ]);

    return {
      rows: result.rows.map(normalizeOrderRecord),
      total: result.total
    };
  }

  async saveOrder(order: OrderRecord): Promise<OrderRecord> {
    const normalizedOrder = normalizeOrderRecord(order);
    const existing = await this.getOrderById(order._id);
    if (existing) {
      await updateDocument(COLLECTIONS.orderRecords, order._id, normalizedOrder);
      return normalizedOrder;
    }

    return addDocument(COLLECTIONS.orderRecords, normalizedOrder);
  }

  async listOrderStatusLogsByOrderId(orderId: string): Promise<OrderStatusLog[]> {
    return (await listByWhere<OrderStatusLog>(COLLECTIONS.orderStatusLogs, {
      storeId: this.storeId,
      orderId
    })).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async saveOrderStatusLog(log: OrderStatusLog): Promise<OrderStatusLog> {
    return addDocument(COLLECTIONS.orderStatusLogs, log);
  }

  async listFeedbackTickets(): Promise<FeedbackTicket[]> {
    return listByWhere<FeedbackTicket>(COLLECTIONS.feedbackTickets, {
      storeId: this.storeId
    });
  }

  async listOpsTasks(status?: OpsTask["status"], limit = 50): Promise<OpsTask[]> {
    const where: Record<string, unknown> = {
      storeId: this.storeId
    };
    if (status) {
      where.status = status;
    }

    const result = await listPageByWhere<OpsTask>(COLLECTIONS.opsTasks, where, 1, limit, [
      { field: "updatedAt", direction: "desc" },
      { field: "createdAt", direction: "desc" }
    ]);

    return result.rows;
  }

  async getOpsTaskById(taskId: string): Promise<OpsTask | null> {
    return getById<OpsTask>(COLLECTIONS.opsTasks, taskId, this.storeId);
  }

  async getOpsTaskByDedupeKey(dedupeKey: string): Promise<OpsTask | null> {
    const [task] = await listByWhere<OpsTask>(COLLECTIONS.opsTasks, {
      storeId: this.storeId,
      dedupeKey
    });
    return task ?? null;
  }

  async saveOpsTask(task: OpsTask): Promise<OpsTask> {
    const existing = await this.getOpsTaskById(task._id);
    if (existing) {
      await updateDocument(COLLECTIONS.opsTasks, task._id, task);
      return task;
    }

    return addDocument(COLLECTIONS.opsTasks, task);
  }

  async listFeedbackTicketsBySubmitterOpenId(submitterOpenId: string): Promise<FeedbackTicket[]> {
    return listByWhere<FeedbackTicket>(COLLECTIONS.feedbackTickets, {
      storeId: this.storeId,
      submitterOpenId
    });
  }

  async listFeedbackTicketsByStaffUserId(staffUserId: string): Promise<FeedbackTicket[]> {
    return listByWhere<FeedbackTicket>(COLLECTIONS.feedbackTickets, {
      storeId: this.storeId,
      staffUserId
    });
  }

  async getFeedbackTicketById(feedbackId: string): Promise<FeedbackTicket | null> {
    return getById<FeedbackTicket>(COLLECTIONS.feedbackTickets, feedbackId, this.storeId);
  }

  async saveFeedbackTicket(ticket: FeedbackTicket): Promise<FeedbackTicket> {
    const existing = await this.getFeedbackTicketById(ticket._id);
    if (existing) {
      await updateDocument(COLLECTIONS.feedbackTickets, ticket._id, ticket);
      return ticket;
    }

    return addDocument(COLLECTIONS.feedbackTickets, ticket);
  }

  async listMemberPointTransactions(memberId: string): Promise<MemberPointTransaction[]> {
    return listByWhere<MemberPointTransaction>(COLLECTIONS.memberPointTransactions, {
      storeId: this.storeId,
      memberId
    });
  }

  async listPointTransactionsByMemberIds(memberIds: string[]): Promise<MemberPointTransaction[]> {
    return listByFieldIn<MemberPointTransaction>(COLLECTIONS.memberPointTransactions, this.storeId, "memberId", memberIds);
  }

  async savePointTransaction(transaction: MemberPointTransaction): Promise<MemberPointTransaction> {
    return addDocument(COLLECTIONS.memberPointTransactions, transaction);
  }

  async savePointTransactions(transactions: MemberPointTransaction[]): Promise<MemberPointTransaction[]> {
    await Promise.all(transactions.map((transaction) => this.savePointTransaction(transaction)));
    return transactions;
  }

  async runTransaction<TResult>(callback: (transaction: RepositoryTransaction) => Promise<TResult>): Promise<TResult> {
    const db = cloud.database();

    return db.runTransaction(async (transaction: CloudTransaction) =>
      callback({
        getMemberById: async (memberId) => normalizeMember(await getByIdInTransaction<Member>(transaction, COLLECTIONS.members, memberId, this.storeId)),
        saveMember: async (member) =>
          saveDocumentInTransaction(transaction, COLLECTIONS.members, normalizeMember(member) as Member),
        getInviteRelationById: async (relationId) =>
          getByIdInTransaction<InviteRelation>(transaction, COLLECTIONS.inviteRelations, relationId, this.storeId),
        saveInviteRelation: async (relation) =>
          saveDocumentInTransaction(transaction, COLLECTIONS.inviteRelations, relation),
        createVisitRecord: async (record) => createDocumentInTransaction(transaction, COLLECTIONS.visitRecords, record),
        getOrderById: async (orderId) => {
          const order = await getByIdInTransaction<OrderRecord>(transaction, COLLECTIONS.orderRecords, orderId, this.storeId);
          return order ? normalizeOrderRecord(order) : null;
        },
        saveOrder: async (order) =>
          saveDocumentInTransaction(transaction, COLLECTIONS.orderRecords, normalizeOrderRecord(order)),
        saveOrderStatusLog: async (log) => saveDocumentInTransaction(transaction, COLLECTIONS.orderStatusLogs, log),
        getPointExchangeItemById: async (itemId) => {
          const item = await getByIdInTransaction<PointExchangeItem>(transaction, COLLECTIONS.pointExchangeItems, itemId, this.storeId);
          return item ? normalizePointExchangeItem(item) : null;
        },
        getVoucherById: async (voucherId) =>
          getByIdInTransaction<DishVoucher>(transaction, COLLECTIONS.dishVouchers, voucherId, this.storeId),
        saveVoucher: async (voucher) => saveDocumentInTransaction(transaction, COLLECTIONS.dishVouchers, voucher),
        getPointTransactionById: async (transactionId) =>
          getByIdInTransaction<MemberPointTransaction>(
            transaction,
            COLLECTIONS.memberPointTransactions,
            transactionId,
            this.storeId
          ),
        getVoucherRedemptionById: async (redemptionId) =>
          getByIdInTransaction<VoucherRedemption>(
            transaction,
            COLLECTIONS.voucherRedemptions,
            redemptionId,
            this.storeId
          ),
        saveVoucherRedemption: async (redemption) =>
          saveDocumentInTransaction(transaction, COLLECTIONS.voucherRedemptions, redemption),
        savePointTransaction: async (pointTransaction) =>
          saveDocumentInTransaction(transaction, COLLECTIONS.memberPointTransactions, pointTransaction),
        savePointTransactions: async (transactions) => {
          for (const pointTransaction of transactions) {
            await saveDocumentInTransaction(transaction, COLLECTIONS.memberPointTransactions, pointTransaction);
          }
          return transactions;
        }
      })
    );
  }

  async listStaffUsers(): Promise<StaffUser[]> {
    return listByWhere<StaffUser>(COLLECTIONS.staffUsers, {
      storeId: this.storeId
    });
  }

  async getStaffById(id: string): Promise<StaffUser | null> {
    return getById<StaffUser>(COLLECTIONS.staffUsers, id, this.storeId);
  }

  async getStaffByIdFromStore(storeId: string, id: string): Promise<StaffUser | null> {
    return getById<StaffUser>(COLLECTIONS.staffUsers, id, storeId);
  }

  async getStaffByUsername(username: string): Promise<StaffUser | null> {
    const [staff] = await listByWhere<StaffUser>(COLLECTIONS.staffUsers, {
      storeId: this.storeId,
      username
    });
    return staff ?? null;
  }

  async getStaffByMiniOpenId(miniOpenId: string): Promise<StaffUser | null> {
    const [staff] = await listByWhere<StaffUser>(COLLECTIONS.staffUsers, {
      storeId: this.storeId,
      miniOpenId
    });
    return staff ?? null;
  }

  async saveStaffUser(user: StaffUser): Promise<StaffUser> {
    const existing = await this.getStaffById(user._id);
    if (existing) {
      await updateDocument(COLLECTIONS.staffUsers, user._id, user);
      return user;
    }

    return addDocument(COLLECTIONS.staffUsers, user);
  }

  async addAuditLog(log: AuditLog): Promise<AuditLog> {
    return addDocument(COLLECTIONS.auditLogs, log);
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    return listByWhere<AuditLog>(COLLECTIONS.auditLogs, {
      storeId: this.storeId
    });
  }

  async searchMembers(query: string): Promise<Member[]> {
    const members = await this.listMembers();
    return members.filter(
      (member) =>
        safeIncludes(member.phone, query) ||
        safeIncludes(member.memberCode, query) ||
        safeIncludes(member.nickname, query)
    );
  }

  async searchOrders(query: string, status?: OrderRecord["status"]): Promise<OrderRecord[]> {
    const orders = await this.listOrders();
    return orders.filter((order) => {
      const matchesStatus = status ? order.status === status : true;
      const matchesQuery =
        !query ||
        safeIncludes(order.orderNo, query) ||
        safeIncludes(order.memberCode, query) ||
        safeIncludes(order.contactName, query) ||
        safeIncludes(order.contactPhone, query) ||
        safeIncludes(order.tableNo, query);

      return matchesStatus && matchesQuery;
    });
  }

  async getDashboardStats(): Promise<{
    memberCount: number;
    activatedInviteCount: number;
    readyVoucherCount: number;
    todayVisitCount: number;
    openOpsTaskCount: number;
    todayOrderCount: number;
    todayRevenueAmount: number;
    pendingConfirmOrderCount: number;
    readyOrderCount: number;
    todayPointsIssued: number;
    todayPointsRedeemed: number;
    todayVoucherRedeemedCount: number;
    memberBenefitsSkippedOrderCount: number;
  }> {
    const now = new Date().toISOString();
    const { todayStart, tomorrowStart } = getShanghaiDayRange();
    const _ = dbCommand();
    const todayRange = _.gte(todayStart).and(_.lt(tomorrowStart));

    const [
      memberCount,
      activatedInviteCount,
      adjustedActivatedInviteCount,
      readyVoucherCount,
      todayVisitCount,
      openOpsTaskCount,
      todayOrderCount,
      pendingConfirmOrderCount,
      readyOrderCount,
      memberBenefitsSkippedOrderCount,
      todayOrders,
      todayPointTransactions,
      todayVoucherRedemptions
    ] =
      await Promise.all([
        countByWhere(COLLECTIONS.members, {
          storeId: this.storeId
        }),
        countByWhere(COLLECTIONS.inviteRelations, {
          storeId: this.storeId,
          status: "ACTIVATED"
        }),
        countByWhere(COLLECTIONS.inviteRelations, {
          storeId: this.storeId,
          status: "ADJUSTED",
          activatedAt: _.gt("")
        }),
        countByWhere(COLLECTIONS.dishVouchers, {
          storeId: this.storeId,
          status: "READY",
          expiresAt: _.gt(now)
        }),
        countByWhere(COLLECTIONS.visitRecords, {
          storeId: this.storeId,
          verifiedAt: todayRange
        }),
        countByWhere(COLLECTIONS.opsTasks, {
          storeId: this.storeId,
          status: "OPEN"
        }),
        countByWhere(COLLECTIONS.orderRecords, {
          storeId: this.storeId,
          submittedAt: todayRange
        }),
        countByWhere(COLLECTIONS.orderRecords, {
          storeId: this.storeId,
          status: "PENDING_CONFIRM"
        }),
        countByWhere(COLLECTIONS.orderRecords, {
          storeId: this.storeId,
          status: "READY"
        }),
        countByWhere(COLLECTIONS.orderRecords, {
          storeId: this.storeId,
          memberBenefitsStatus: "SKIPPED_UNVERIFIED"
        }),
        listByWhere<OrderRecord>(COLLECTIONS.orderRecords, {
          storeId: this.storeId,
          submittedAt: todayRange
        }),
        listByWhere<MemberPointTransaction>(COLLECTIONS.memberPointTransactions, {
          storeId: this.storeId,
          createdAt: todayRange
        }),
        listByWhere<VoucherRedemption>(COLLECTIONS.voucherRedemptions, {
          storeId: this.storeId,
          redeemedAt: todayRange
        })
      ]);

    const todayRevenueAmount = todayOrders.reduce((total, order) => {
      if (order.status === "CANCELLED") {
        return total;
      }

      return total + (Number(order.payableAmount) || 0);
    }, 0);
    const todayPointsIssued = todayPointTransactions.reduce((total, transaction) => {
      const delta = Number(transaction.changeAmount) || 0;
      return delta > 0 ? total + delta : total;
    }, 0);
    const todayPointsRedeemed = todayPointTransactions.reduce((total, transaction) => {
      if (transaction.type !== "POINT_EXCHANGE") {
        return total;
      }

      const delta = Number(transaction.changeAmount) || 0;
      return delta < 0 ? total + Math.abs(delta) : total;
    }, 0);

    return {
      memberCount,
      activatedInviteCount: activatedInviteCount + adjustedActivatedInviteCount,
      readyVoucherCount,
      todayVisitCount,
      openOpsTaskCount,
      todayOrderCount,
      todayRevenueAmount,
      pendingConfirmOrderCount,
      readyOrderCount,
      todayPointsIssued,
      todayPointsRedeemed,
      todayVoucherRedeemedCount: todayVoucherRedemptions.length,
      memberBenefitsSkippedOrderCount
    };
  }
}

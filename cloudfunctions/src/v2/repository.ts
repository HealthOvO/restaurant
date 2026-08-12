import {
  businessDateAt,
  type V2Category,
  type V2Coupon,
  type V2DashboardStats,
  type V2ExchangeItem,
  type V2InviteRelation,
  type V2Member,
  type V2Order,
  type V2OwnerAccount,
  type V2Payment,
  type V2PointLedger,
  type V2Product,
  type V2Refund,
  type V2StoreConfig
} from "@restaurant/shared";
import { DomainError } from "@restaurant/shared";
import { cloud } from "../runtime/cloud";

export const V2_COLLECTIONS = {
  members: "v2_members",
  inviteRelations: "v2_invite_relations",
  products: "v2_products",
  categories: "v2_categories",
  exchangeItems: "v2_exchange_items",
  coupons: "v2_coupons",
  orders: "v2_orders",
  payments: "v2_payments",
  refunds: "v2_refunds",
  pointLedger: "v2_point_ledger",
  pickupCounters: "v2_pickup_counters",
  storeConfig: "v2_store_config",
  ownerAccounts: "v2_owner_accounts",
  ownerLoginAttempts: "v2_owner_login_attempts",
  locks: "v2_locks"
} as const;

export interface V2OwnerLoginAttempt {
  _id: string;
  storeId: string;
  usernameKey: string;
  reservationGeneration?: number;
  attemptCount: number;
  windowStartedAt: string;
  lastAttemptAt: string;
  lockedUntil?: string;
  createdAt: string;
  updatedAt: string;
}

interface V2PickupCounter {
  _id: string;
  storeId: string;
  businessDate: string;
  sequence: number;
  createdAt: string;
  updatedAt: string;
}

interface V2LockRecord {
  _id: string;
  storeId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface V2Transaction {
  getStoreConfig(): Promise<V2StoreConfig | null>;
  saveStoreConfig(config: V2StoreConfig): Promise<void>;
  getCategory(id: string): Promise<V2Category | null>;
  saveCategory(category: V2Category): Promise<void>;
  getMember(id: string): Promise<V2Member | null>;
  saveMember(member: V2Member): Promise<void>;
  getInviteRelation(inviteeMemberId: string): Promise<V2InviteRelation | null>;
  saveInviteRelation(relation: V2InviteRelation): Promise<void>;
  getProduct(id: string): Promise<V2Product | null>;
  saveProduct(product: V2Product): Promise<void>;
  getExchangeItem(id: string): Promise<V2ExchangeItem | null>;
  saveExchangeItem(item: V2ExchangeItem): Promise<void>;
  getOrder(id: string): Promise<V2Order | null>;
  saveOrder(order: V2Order): Promise<void>;
  getPayment(id: string): Promise<V2Payment | null>;
  savePayment(payment: V2Payment): Promise<void>;
  getRefund(id: string): Promise<V2Refund | null>;
  saveRefund(refund: V2Refund): Promise<void>;
  getCoupon(id: string): Promise<V2Coupon | null>;
  saveCoupon(coupon: V2Coupon): Promise<void>;
  getPointLedger(id: string): Promise<V2PointLedger | null>;
  savePointLedger(ledger: V2PointLedger): Promise<void>;
  getOwner(id: string): Promise<V2OwnerAccount | null>;
  saveOwner(owner: V2OwnerAccount): Promise<void>;
  getOwnerLoginAttempt(id: string): Promise<V2OwnerLoginAttempt | null>;
  saveOwnerLoginAttempt(attempt: V2OwnerLoginAttempt): Promise<void>;
  nextPickupNumber(businessDate: string, now: string): Promise<number>;
}

export interface V2OwnerOrderPageQuery {
  status?: V2Order["status"];
  cursor?: string;
  limit?: number;
  direction?: "QUEUE" | "RECENT";
}

export interface V2OwnerOrderPage {
  rows: V2Order[];
  nextCursor?: string;
}

export interface V2CouponListQuery {
  statuses?: V2Coupon["status"][];
  limit?: number;
}

export interface V2MemberRecordPageQuery {
  cursor?: string;
  limit?: number;
}

export interface V2MemberRecordPage<T> {
  rows: T[];
  nextCursor?: string;
}

export interface V2Repository {
  readonly storeId: string;
  getStoreConfig(): Promise<V2StoreConfig | null>;
  saveStoreConfig(config: V2StoreConfig): Promise<void>;
  listCategories(includeDisabled?: boolean): Promise<V2Category[]>;
  getCategory(id: string): Promise<V2Category | null>;
  saveCategory(category: V2Category): Promise<void>;
  listProducts(includeDisabled?: boolean): Promise<V2Product[]>;
  getProduct(id: string): Promise<V2Product | null>;
  saveProduct(product: V2Product): Promise<void>;
  listExchangeItems(includeDisabled?: boolean): Promise<V2ExchangeItem[]>;
  getExchangeItem(id: string): Promise<V2ExchangeItem | null>;
  saveExchangeItem(item: V2ExchangeItem): Promise<void>;
  getMemberById(id: string): Promise<V2Member | null>;
  getMemberByOpenId(openId: string): Promise<V2Member | null>;
  getMemberByInviteCode(inviteCode: string): Promise<V2Member | null>;
  saveMember(member: V2Member): Promise<void>;
  getInviteRelation(inviteeMemberId: string): Promise<V2InviteRelation | null>;
  listInviteRelationsByInviter(inviterMemberId: string): Promise<V2InviteRelation[]>;
  getOrder(id: string): Promise<V2Order | null>;
  getPayment(id: string): Promise<V2Payment | null>;
  getPaymentByOutTradeNo(outTradeNo: string): Promise<V2Payment | null>;
  getRefund(id: string): Promise<V2Refund | null>;
  getRefundByOutRefundNo(outRefundNo: string): Promise<V2Refund | null>;
  getCoupon(id: string): Promise<V2Coupon | null>;
  listOrdersByMember(memberId: string, query?: V2MemberRecordPageQuery): Promise<V2MemberRecordPage<V2Order>>;
  listOwnerOrders(query?: V2OwnerOrderPageQuery): Promise<V2OwnerOrderPage>;
  listCouponsByMember(memberId: string, query?: V2CouponListQuery): Promise<V2Coupon[]>;
  listPointLedgerByMember(memberId: string, query?: V2MemberRecordPageQuery): Promise<V2MemberRecordPage<V2PointLedger>>;
  inviteContributionTotals(memberId: string): Promise<Record<string, number>>;
  searchMembers(query: string): Promise<V2Member[]>;
  getOwnerByUsername(username: string): Promise<V2OwnerAccount | null>;
  getOwnerById(id: string): Promise<V2OwnerAccount | null>;
  saveOwner(owner: V2OwnerAccount): Promise<void>;
  getOwnerLoginAttempt(id: string): Promise<V2OwnerLoginAttempt | null>;
  saveOwnerLoginAttempt(attempt: V2OwnerLoginAttempt): Promise<void>;
  dashboard(now: Date, dayBoundaryTime: string): Promise<V2DashboardStats>;
  listPaymentsDue(nowIso: string, limit: number): Promise<V2Payment[]>;
  listRefundsDue(nowIso: string, limit: number): Promise<V2Refund[]>;
  runTransaction<T>(callback: (transaction: V2Transaction) => Promise<T>): Promise<T>;
  withInviteLock<T>(token: string, callback: () => Promise<T>): Promise<T>;
  withCategoryLock<T>(token: string, callback: () => Promise<T>): Promise<T>;
}

type RecordMap<T extends { _id: string }> = Map<string, T>;

interface InMemoryData {
  storeConfig: RecordMap<V2StoreConfig>;
  categories: RecordMap<V2Category>;
  products: RecordMap<V2Product>;
  exchangeItems: RecordMap<V2ExchangeItem>;
  members: RecordMap<V2Member>;
  inviteRelations: RecordMap<V2InviteRelation>;
  orders: RecordMap<V2Order>;
  payments: RecordMap<V2Payment>;
  refunds: RecordMap<V2Refund>;
  coupons: RecordMap<V2Coupon>;
  pointLedger: RecordMap<V2PointLedger>;
  ownerAccounts: RecordMap<V2OwnerAccount>;
  ownerLoginAttempts: RecordMap<V2OwnerLoginAttempt>;
  pickupCounters: RecordMap<V2PickupCounter>;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function cloneMap<T extends { _id: string }>(source: RecordMap<T>): RecordMap<T> {
  return new Map(Array.from(source.entries(), ([id, value]) => [id, cloneValue(value)]));
}

function emptyInMemoryData(): InMemoryData {
  return {
    storeConfig: new Map(),
    categories: new Map(),
    products: new Map(),
    exchangeItems: new Map(),
    members: new Map(),
    inviteRelations: new Map(),
    orders: new Map(),
    payments: new Map(),
    refunds: new Map(),
    coupons: new Map(),
    pointLedger: new Map(),
    ownerAccounts: new Map(),
    ownerLoginAttempts: new Map(),
    pickupCounters: new Map()
  };
}

function cloneData(source: InMemoryData): InMemoryData {
  return {
    storeConfig: cloneMap(source.storeConfig),
    categories: cloneMap(source.categories),
    products: cloneMap(source.products),
    exchangeItems: cloneMap(source.exchangeItems),
    members: cloneMap(source.members),
    inviteRelations: cloneMap(source.inviteRelations),
    orders: cloneMap(source.orders),
    payments: cloneMap(source.payments),
    refunds: cloneMap(source.refunds),
    coupons: cloneMap(source.coupons),
    pointLedger: cloneMap(source.pointLedger),
    ownerAccounts: cloneMap(source.ownerAccounts),
    ownerLoginAttempts: cloneMap(source.ownerLoginAttempts),
    pickupCounters: cloneMap(source.pickupCounters)
  };
}

function mapGet<T extends { _id: string }>(map: RecordMap<T>, id: string): T | null {
  const value = map.get(id);
  return value ? cloneValue(value) : null;
}

function mapSet<T extends { _id: string }>(map: RecordMap<T>, value: T): void {
  map.set(value._id, cloneValue(value));
}

function values<T extends { _id: string }>(map: RecordMap<T>): T[] {
  return Array.from(map.values(), cloneValue);
}

type V2OwnerOrderSortField = "createdAt" | "settledAt";
type V2OwnerOrderSortDirection = "asc" | "desc";

interface V2OwnerOrderSort {
  field: V2OwnerOrderSortField;
  direction: V2OwnerOrderSortDirection;
}

function ownerOrderSort(query: V2OwnerOrderPageQuery = {}): V2OwnerOrderSort {
  if (query.status === "WAITING_FULFILLMENT") {
    return query.direction === "RECENT"
      ? { field: "settledAt", direction: "desc" }
      : { field: "createdAt", direction: "asc" };
  }
  return { field: "createdAt", direction: "desc" };
}

function ownerOrderSortAt(order: V2Order, field: V2OwnerOrderSortField): string {
  const value = order[field];
  if (typeof value !== "string" || !value) {
    throw new DomainError("ORDER_SORT_FIELD_MISSING", "订单排序信息不完整");
  }
  return value;
}

function sortOwnerOrders(rows: V2Order[], query: V2OwnerOrderPageQuery = {}): V2Order[] {
  const sort = ownerOrderSort(query);
  const multiplier = sort.direction === "asc" ? 1 : -1;
  return rows.sort((left, right) => {
    const byTime = ownerOrderSortAt(left, sort.field).localeCompare(ownerOrderSortAt(right, sort.field));
    if (byTime !== 0) return byTime * multiplier;
    const byNumber = left.orderNo.localeCompare(right.orderNo);
    return byNumber * multiplier;
  });
}

interface V2OwnerOrderCursor {
  sortField: V2OwnerOrderSortField;
  sortAt: string;
  direction: V2OwnerOrderSortDirection;
  orderNo: string;
}

function encodeOwnerOrderCursor(order: V2Order, sort: V2OwnerOrderSort): string {
  return Buffer.from(JSON.stringify({
    sortField: sort.field,
    sortAt: ownerOrderSortAt(order, sort.field),
    direction: sort.direction,
    orderNo: order.orderNo
  }), "utf8").toString("base64url");
}

function decodeOwnerOrderCursor(cursor: string | undefined, expected: V2OwnerOrderSort): V2OwnerOrderCursor | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<V2OwnerOrderCursor>;
    if (
      value.sortField !== expected.field
      || value.direction !== expected.direction
      || typeof value.sortAt !== "string"
      || !value.sortAt
      || typeof value.orderNo !== "string"
      || !value.orderNo
    ) throw new Error("invalid cursor");
    return {
      sortField: value.sortField,
      sortAt: value.sortAt,
      direction: value.direction,
      orderNo: value.orderNo
    };
  } catch {
    throw new DomainError("INVALID_CURSOR", "分页位置无效，请刷新后重试");
  }
}

function isAfterOwnerOrderCursor(order: V2Order, cursor: V2OwnerOrderCursor): boolean {
  const timeComparison = ownerOrderSortAt(order, cursor.sortField).localeCompare(cursor.sortAt);
  if (timeComparison !== 0) return cursor.direction === "asc" ? timeComparison > 0 : timeComparison < 0;
  const numberComparison = order.orderNo.localeCompare(cursor.orderNo);
  return cursor.direction === "asc" ? numberComparison > 0 : numberComparison < 0;
}

function ownerOrderPage(rows: V2Order[], query: V2OwnerOrderPageQuery = {}): V2OwnerOrderPage {
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const sort = ownerOrderSort(query);
  const cursor = decodeOwnerOrderCursor(query.cursor, sort);
  const sorted = sortOwnerOrders(rows, query).filter((order) => !cursor || isAfterOwnerOrderCursor(order, cursor));
  const pageRows = sorted.slice(0, limit);
  return {
    rows: pageRows,
    nextCursor: pageRows.length < sorted.length ? encodeOwnerOrderCursor(pageRows[pageRows.length - 1], sort) : undefined
  };
}

interface V2MemberRecordCursor {
  createdAt: string;
  id: string;
}

function encodeMemberRecordCursor(row: { _id: string; createdAt: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt, id: row._id }), "utf8").toString("base64url");
}

function decodeMemberRecordCursor(cursor?: string): V2MemberRecordCursor | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<V2MemberRecordCursor>;
    if (typeof value.createdAt !== "string" || !value.createdAt || typeof value.id !== "string" || !value.id) throw new Error("invalid cursor");
    return { createdAt: value.createdAt, id: value.id };
  } catch {
    throw new DomainError("INVALID_CURSOR", "分页位置无效，请刷新后重试");
  }
}

function memberRecordPage<T extends { _id: string; createdAt: string }>(rows: T[], query: V2MemberRecordPageQuery = {}): V2MemberRecordPage<T> {
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const cursor = decodeMemberRecordCursor(query.cursor);
  const sorted = rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right._id.localeCompare(left._id));
  const remaining = cursor ? sorted.filter((row) => row.createdAt < cursor.createdAt || (row.createdAt === cursor.createdAt && row._id < cursor.id)) : sorted;
  const pageRows = remaining.slice(0, limit);
  return {
    rows: pageRows,
    nextCursor: pageRows.length < remaining.length ? encodeMemberRecordCursor(pageRows[pageRows.length - 1]) : undefined
  };
}

function createMemoryTransaction(data: InMemoryData, storeId: string): V2Transaction {
  return {
    getStoreConfig: async () => values(data.storeConfig).find((item) => item.storeId === storeId) ?? null,
    saveStoreConfig: async (config) => mapSet(data.storeConfig, config),
    getCategory: async (id) => mapGet(data.categories, id),
    saveCategory: async (category) => mapSet(data.categories, category),
    getMember: async (id) => mapGet(data.members, id),
    saveMember: async (member) => mapSet(data.members, member),
    getInviteRelation: async (id) => mapGet(data.inviteRelations, id),
    saveInviteRelation: async (relation) => mapSet(data.inviteRelations, relation),
    getProduct: async (id) => mapGet(data.products, id),
    saveProduct: async (product) => mapSet(data.products, product),
    getExchangeItem: async (id) => mapGet(data.exchangeItems, id),
    saveExchangeItem: async (item) => mapSet(data.exchangeItems, item),
    getOrder: async (id) => mapGet(data.orders, id),
    saveOrder: async (order) => mapSet(data.orders, order),
    getPayment: async (id) => mapGet(data.payments, id),
    savePayment: async (payment) => mapSet(data.payments, payment),
    getRefund: async (id) => mapGet(data.refunds, id),
    saveRefund: async (refund) => mapSet(data.refunds, refund),
    getCoupon: async (id) => mapGet(data.coupons, id),
    saveCoupon: async (coupon) => mapSet(data.coupons, coupon),
    getPointLedger: async (id) => mapGet(data.pointLedger, id),
    savePointLedger: async (ledger) => mapSet(data.pointLedger, ledger),
    getOwner: async (id) => mapGet(data.ownerAccounts, id),
    saveOwner: async (owner) => mapSet(data.ownerAccounts, owner),
    getOwnerLoginAttempt: async (id) => mapGet(data.ownerLoginAttempts, id),
    saveOwnerLoginAttempt: async (attempt) => mapSet(data.ownerLoginAttempts, attempt),
    nextPickupNumber: async (businessDate, now) => {
      const id = `${storeId}:${businessDate}`;
      const current = data.pickupCounters.get(id);
      const sequence = (current?.sequence ?? 0) + 1;
      mapSet(data.pickupCounters, {
        _id: id,
        storeId,
        businessDate,
        sequence,
        createdAt: current?.createdAt ?? now,
        updatedAt: now
      });
      return sequence;
    }
  };
}

export class InMemoryV2Repository implements V2Repository {
  private data: InMemoryData;
  private transactionTail: Promise<void> = Promise.resolve();
  private inviteTail: Promise<void> = Promise.resolve();
  private categoryTail: Promise<void> = Promise.resolve();

  constructor(readonly storeId: string, seed?: Partial<{ [K in keyof InMemoryData]: Array<InMemoryData[K] extends Map<string, infer V> ? V : never> }>) {
    this.data = emptyInMemoryData();
    if (seed) {
      for (const [key, rows] of Object.entries(seed) as Array<[keyof InMemoryData, Array<{ _id: string }> | undefined]>) {
        const target = this.data[key] as Map<string, { _id: string }>;
        for (const row of rows ?? []) {
          target.set(row._id, cloneValue(row));
        }
      }
    }
  }

  async getStoreConfig() { return values(this.data.storeConfig).find((item) => item.storeId === this.storeId) ?? null; }
  async saveStoreConfig(config: V2StoreConfig) { mapSet(this.data.storeConfig, config); }
  async listCategories(includeDisabled = false) {
    return values(this.data.categories).filter((item) => item.storeId === this.storeId && (includeDisabled || item.enabled)).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async getCategory(id: string) { return mapGet(this.data.categories, id); }
  async saveCategory(category: V2Category) { mapSet(this.data.categories, category); }
  async listProducts(includeDisabled = false) {
    return values(this.data.products).filter((item) => item.storeId === this.storeId && (includeDisabled || item.enabled)).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async getProduct(id: string) { return mapGet(this.data.products, id); }
  async saveProduct(product: V2Product) { mapSet(this.data.products, product); }
  async listExchangeItems(includeDisabled = false) {
    return values(this.data.exchangeItems).filter((item) => item.storeId === this.storeId && (includeDisabled || item.enabled)).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async getExchangeItem(id: string) { return mapGet(this.data.exchangeItems, id); }
  async saveExchangeItem(item: V2ExchangeItem) { mapSet(this.data.exchangeItems, item); }
  async getMemberById(id: string) { return mapGet(this.data.members, id); }
  async getMemberByOpenId(openId: string) { return values(this.data.members).find((item) => item.storeId === this.storeId && item.openId === openId) ?? null; }
  async getMemberByInviteCode(inviteCode: string) { return values(this.data.members).find((item) => item.storeId === this.storeId && item.inviteCode === inviteCode) ?? null; }
  async saveMember(member: V2Member) { mapSet(this.data.members, member); }
  async getInviteRelation(inviteeMemberId: string) { return mapGet(this.data.inviteRelations, inviteeMemberId); }
  async listInviteRelationsByInviter(inviterMemberId: string) { return values(this.data.inviteRelations).filter((item) => item.inviterMemberId === inviterMemberId); }
  async getOrder(id: string) { return mapGet(this.data.orders, id); }
  async getPayment(id: string) { return mapGet(this.data.payments, id); }
  async getPaymentByOutTradeNo(outTradeNo: string) { return values(this.data.payments).find((item) => item.outTradeNo === outTradeNo) ?? null; }
  async getRefund(id: string) { return mapGet(this.data.refunds, id); }
  async getRefundByOutRefundNo(outRefundNo: string) { return values(this.data.refunds).find((item) => item.outRefundNo === outRefundNo) ?? null; }
  async getCoupon(id: string) { return mapGet(this.data.coupons, id); }
  async listOrdersByMember(memberId: string, query: V2MemberRecordPageQuery = {}) { return memberRecordPage(values(this.data.orders).filter((item) => item.memberId === memberId), query); }
  async listOwnerOrders(query: V2OwnerOrderPageQuery = {}) {
    const visibleStatuses: V2Order["status"][] = ["WAITING_FULFILLMENT", "COMPLETED", "CANCELLED", "REFUNDING", "REFUNDED"];
    return ownerOrderPage(values(this.data.orders).filter((item) => query.status ? item.status === query.status : visibleStatuses.includes(item.status)), query);
  }
  async listCouponsByMember(memberId: string, query: V2CouponListQuery = {}) {
    const statuses = query.statuses ? new Set(query.statuses) : null;
    if (statuses?.size === 0) return [];
    const rows = values(this.data.coupons)
      .filter((item) => item.memberId === memberId && (!statuses || statuses.has(item.status)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = query.limit ?? (statuses ? undefined : 50);
    return limit === undefined ? rows : rows.slice(0, Math.max(0, limit));
  }
  async listPointLedgerByMember(memberId: string, query: V2MemberRecordPageQuery = {}) { return memberRecordPage(values(this.data.pointLedger).filter((item) => item.memberId === memberId), query); }
  async inviteContributionTotals(memberId: string) {
    return values(this.data.pointLedger)
      .filter((item) => item.memberId === memberId && item.relatedMemberId && (item.type === "INVITE_REWARD" || item.type === "INVITE_REWARD_REFUND"))
      .reduce<Record<string, number>>((totals, item) => {
        totals[item.relatedMemberId!] = (totals[item.relatedMemberId!] ?? 0) + item.amount;
        return totals;
      }, {});
  }
  async searchMembers(query: string) {
    const normalized = query.trim().toLowerCase();
    const recent = values(this.data.members).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!normalized) return recent.slice(0, 50);
    return recent.filter((item) => item.memberCode.toLowerCase() === normalized || item.inviteCode.toLowerCase() === normalized || item.nickname?.toLowerCase().includes(normalized)).slice(0, 50);
  }
  async getOwnerByUsername(username: string) { return values(this.data.ownerAccounts).find((item) => item.username === username) ?? null; }
  async getOwnerById(id: string) { return mapGet(this.data.ownerAccounts, id); }
  async saveOwner(owner: V2OwnerAccount) { mapSet(this.data.ownerAccounts, owner); }
  async getOwnerLoginAttempt(id: string) { return mapGet(this.data.ownerLoginAttempts, id); }
  async saveOwnerLoginAttempt(attempt: V2OwnerLoginAttempt) { mapSet(this.data.ownerLoginAttempts, attempt); }
  async listPaymentsDue(nowIso: string, limit: number) { return values(this.data.payments).filter((item) => ["INIT", "NOTPAY"].includes(item.status) && item.nextQueryAt <= nowIso).slice(0, limit); }
  async listRefundsDue(nowIso: string, limit: number) { return values(this.data.refunds).filter((item) => ["PROCESSING", "ABNORMAL"].includes(item.status) && item.nextQueryAt <= nowIso).slice(0, limit); }

  async dashboard(now: Date, dayBoundaryTime: string): Promise<V2DashboardStats> {
    const date = businessDateAt(now, dayBoundaryTime);
    const orders = values(this.data.orders).filter((item) => item.businessDate === date);
    const ledger = values(this.data.pointLedger).filter((item) => item.businessDate === date);
    const members = values(this.data.members).filter((item) => businessDateAt(new Date(item.createdAt), dayBoundaryTime) === date);
    const refundCount = values(this.data.orders).filter((item) => item.status === "REFUNDED" && item.refundedAt && businessDateAt(new Date(item.refundedAt), dayBoundaryTime) === date).length;
    return dashboardFromRows(date, orders, ledger, members.length, refundCount);
  }

  async runTransaction<T>(callback: (transaction: V2Transaction) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const working = cloneData(this.data);
    try {
      const result = await callback(createMemoryTransaction(working, this.storeId));
      this.data = working;
      return result;
    } finally {
      release();
    }
  }

  async withInviteLock<T>(_token: string, callback: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.inviteTail;
    this.inviteTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await callback(); } finally { release(); }
  }

  async withCategoryLock<T>(_token: string, callback: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.categoryTail;
    this.categoryTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await callback(); } finally { release(); }
  }

  snapshot(): Readonly<InMemoryData> { return cloneData(this.data); }
}

function dashboardFromRows(date: string, orders: V2Order[], ledger: V2PointLedger[], newMemberCount: number, refundCount: number): V2DashboardStats {
  const paymentOrders = orders.filter((order) => order.paidAmount > 0 && Boolean(order.settledAt) && order.status !== "CANCELLED");
  return {
    businessDate: date,
    paymentOrderCount: paymentOrders.length,
    couponOrderCount: orders.filter((order) => (order.source === "COUPON" || order.source === "MIXED" || (order.couponApplications?.length ?? 0) > 0) && order.status !== "CANCELLED").length,
    paymentAmount: paymentOrders.reduce((total, order) => total + order.paidAmount, 0),
    completedOrderCount: orders.filter((order) => order.status === "COMPLETED").length,
    refundCount,
    newMemberCount,
    buyerPointsIssued: ledger.filter((row) => row.type === "PURCHASE" || row.type === "PURCHASE_REFUND").reduce((total, row) => total + row.amount, 0),
    inviterPointsIssued: ledger.filter((row) => row.type === "INVITE_REWARD" || row.type === "INVITE_REWARD_REFUND").reduce((total, row) => total + row.amount, 0),
    exchangePointsSpent: Math.abs(ledger.filter((row) => row.type === "COUPON_EXCHANGE").reduce((total, row) => total + row.amount, 0))
  };
}

type CloudTransaction = {
  collection(name: string): { doc(id: string): { get(): Promise<{ data?: unknown }>; set(options: { data: unknown }): Promise<unknown>; update(data: unknown): Promise<unknown> } };
};

function collection(name: string) { return cloud.database().collection(name); }
function command() { return cloud.database().command; }

export function isV2DocumentNotFoundError(error: unknown): boolean {
  const value = error as { errCode?: unknown; message?: unknown; errMsg?: unknown } | null;
  const message = String(value?.message ?? value?.errMsg ?? "");
  return value?.errCode === -1 && /^document\.get:fail document with _id .+ does not exist$/.test(message);
}

async function readDocument(get: () => Promise<{ data?: unknown }>): Promise<{ data?: unknown } | null> {
  try {
    return await get();
  } catch (error) {
    if (isV2DocumentNotFoundError(error)) return null;
    throw error;
  }
}

async function cloudGet<T extends { storeId: string }>(name: string, id: string, storeId: string): Promise<T | null> {
  const result = await readDocument(() => collection(name).doc(id).get());
  const row = result?.data as T | undefined;
  return row?.storeId === storeId ? row : null;
}

async function cloudList<T>(name: string, where: Record<string, unknown>): Promise<T[]> {
  const rows: T[] = [];
  let skip = 0;
  while (true) {
    const result = await collection(name).where(where).skip(skip).limit(100).get();
    const batch = (result.data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 100) return rows;
    skip += batch.length;
  }
}

async function cloudOrderedList<T>(
  name: string,
  where: Record<string, unknown> | unknown,
  field: string,
  direction: "asc" | "desc",
  limit: number,
  skip = 0
): Promise<T[]> {
  const result = await collection(name).where(where).orderBy(field, direction).skip(skip).limit(limit).get();
  return (result.data ?? []) as T[];
}

async function cloudMemberRecordPage<T extends { _id: string; createdAt: string }>(
  name: string,
  storeId: string,
  memberId: string,
  query: V2MemberRecordPageQuery = {}
): Promise<V2MemberRecordPage<T>> {
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const cursor = decodeMemberRecordCursor(query.cursor);
  const _ = command();
  const baseWhere = { storeId, memberId };
  const where = cursor
    ? _.or([
        { ...baseWhere, createdAt: _.lt(cursor.createdAt) },
        { ...baseWhere, createdAt: _.eq(cursor.createdAt), _id: _.lt(cursor.id) }
      ])
    : baseWhere;
  const result = await collection(name)
    .where(where)
    .orderBy("createdAt", "desc")
    .orderBy("_id", "desc")
    .limit(limit + 1)
    .get();
  const rows = (result.data ?? []) as T[];
  const pageRows = rows.slice(0, limit);
  return {
    rows: pageRows,
    nextCursor: rows.length > limit ? encodeMemberRecordCursor(pageRows[pageRows.length - 1]) : undefined
  };
}

export function withoutV2DocumentId<T extends { _id: string }>(row: T): Omit<T, "_id"> {
  const { _id: _documentId, ...data } = row;
  return data;
}

export function v2DocumentSetOptions<T extends { _id: string }>(row: T): { data: Omit<T, "_id"> } {
  return { data: withoutV2DocumentId(row) };
}

async function cloudSave<T extends { _id: string }>(name: string, row: T): Promise<void> {
  await collection(name).doc(row._id).set(v2DocumentSetOptions(row));
}

async function txGet<T extends { storeId: string }>(tx: CloudTransaction, name: string, id: string, storeId: string): Promise<T | null> {
  const result = await readDocument(() => tx.collection(name).doc(id).get());
  const row = result?.data as T | undefined;
  return row?.storeId === storeId ? row : null;
}

async function txSave<T extends { _id: string; storeId: string }>(tx: CloudTransaction, name: string, row: T, storeId: string): Promise<void> {
  const document = tx.collection(name).doc(row._id);
  const result = await readDocument(() => document.get());
  const existing = result?.data as { storeId?: string } | undefined;
  if (existing && existing.storeId !== storeId) {
    throw new DomainError("STORE_SCOPE_VIOLATION", "数据不属于当前门店");
  }
  await document.set(v2DocumentSetOptions(row));
}

export class CloudV2Repository implements V2Repository {
  constructor(readonly storeId: string) {}

  async getStoreConfig() { return (await cloudList<V2StoreConfig>(V2_COLLECTIONS.storeConfig, { storeId: this.storeId }))[0] ?? null; }
  async saveStoreConfig(config: V2StoreConfig) { await cloudSave(V2_COLLECTIONS.storeConfig, config); }
  async listCategories(includeDisabled = false) {
    const where: Record<string, unknown> = { storeId: this.storeId };
    if (!includeDisabled) where.enabled = true;
    return (await cloudList<V2Category>(V2_COLLECTIONS.categories, where)).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async getCategory(id: string) { return cloudGet<V2Category>(V2_COLLECTIONS.categories, id, this.storeId); }
  async saveCategory(category: V2Category) { await cloudSave(V2_COLLECTIONS.categories, category); }
  async listProducts(includeDisabled = false) {
    const where: Record<string, unknown> = { storeId: this.storeId };
    if (!includeDisabled) where.enabled = true;
    return (await cloudList<V2Product>(V2_COLLECTIONS.products, where)).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async getProduct(id: string) { return cloudGet<V2Product>(V2_COLLECTIONS.products, id, this.storeId); }
  async saveProduct(product: V2Product) { await cloudSave(V2_COLLECTIONS.products, product); }
  async listExchangeItems(includeDisabled = false) {
    const where: Record<string, unknown> = { storeId: this.storeId };
    if (!includeDisabled) where.enabled = true;
    return (await cloudList<V2ExchangeItem>(V2_COLLECTIONS.exchangeItems, where)).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async getExchangeItem(id: string) { return cloudGet<V2ExchangeItem>(V2_COLLECTIONS.exchangeItems, id, this.storeId); }
  async saveExchangeItem(item: V2ExchangeItem) { await cloudSave(V2_COLLECTIONS.exchangeItems, item); }
  async getMemberById(id: string) { return cloudGet<V2Member>(V2_COLLECTIONS.members, id, this.storeId); }
  async getMemberByOpenId(openId: string) { return (await cloudList<V2Member>(V2_COLLECTIONS.members, { storeId: this.storeId, openId }))[0] ?? null; }
  async getMemberByInviteCode(inviteCode: string) { return (await cloudList<V2Member>(V2_COLLECTIONS.members, { storeId: this.storeId, inviteCode }))[0] ?? null; }
  async saveMember(member: V2Member) { await cloudSave(V2_COLLECTIONS.members, member); }
  async getInviteRelation(inviteeMemberId: string) { return cloudGet<V2InviteRelation>(V2_COLLECTIONS.inviteRelations, inviteeMemberId, this.storeId); }
  async listInviteRelationsByInviter(inviterMemberId: string) { return cloudList<V2InviteRelation>(V2_COLLECTIONS.inviteRelations, { storeId: this.storeId, inviterMemberId }); }
  async getOrder(id: string) { return cloudGet<V2Order>(V2_COLLECTIONS.orders, id, this.storeId); }
  async getPayment(id: string) { return cloudGet<V2Payment>(V2_COLLECTIONS.payments, id, this.storeId); }
  async getPaymentByOutTradeNo(outTradeNo: string) { return (await cloudList<V2Payment>(V2_COLLECTIONS.payments, { storeId: this.storeId, outTradeNo }))[0] ?? null; }
  async getRefund(id: string) { return cloudGet<V2Refund>(V2_COLLECTIONS.refunds, id, this.storeId); }
  async getRefundByOutRefundNo(outRefundNo: string) { return (await cloudList<V2Refund>(V2_COLLECTIONS.refunds, { storeId: this.storeId, outRefundNo }))[0] ?? null; }
  async getCoupon(id: string) { return cloudGet<V2Coupon>(V2_COLLECTIONS.coupons, id, this.storeId); }
  async listOrdersByMember(memberId: string, query: V2MemberRecordPageQuery = {}) { return cloudMemberRecordPage<V2Order>(V2_COLLECTIONS.orders, this.storeId, memberId, query); }
  async listOwnerOrders(query: V2OwnerOrderPageQuery = {}) {
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const sort = ownerOrderSort(query);
    const cursor = decodeOwnerOrderCursor(query.cursor, sort);
    const _ = command();
    const visibleStatuses: V2Order["status"][] = ["WAITING_FULFILLMENT", "COMPLETED", "CANCELLED", "REFUNDING", "REFUNDED"];
    const comparison = (value: string) => sort.direction === "asc" ? _.gt(value) : _.lt(value);
    const fetchStatus = async (status: V2Order["status"]) => {
      const baseWhere = { storeId: this.storeId, status };
      const where = cursor
        ? _.or([
            { ...baseWhere, [sort.field]: comparison(cursor.sortAt) },
            { ...baseWhere, [sort.field]: _.eq(cursor.sortAt), orderNo: comparison(cursor.orderNo) }
          ])
        : baseWhere;
      const result = await collection(V2_COLLECTIONS.orders)
        .where(where)
        .orderBy(sort.field, sort.direction)
        .orderBy("orderNo", sort.direction)
        .limit(limit + 1)
        .get();
      return (result.data ?? []) as V2Order[];
    };
    const batches = await Promise.all((query.status ? [query.status] : visibleStatuses).map(fetchStatus));
    const rows = sortOwnerOrders(batches.flat(), query).slice(0, limit + 1);
    const pageRows = rows.slice(0, limit);
    return {
      rows: pageRows,
      nextCursor: rows.length > limit ? encodeOwnerOrderCursor(pageRows[pageRows.length - 1], sort) : undefined
    };
  }
  async listCouponsByMember(memberId: string, query: V2CouponListQuery = {}) {
    if (query.statuses) {
      const statuses = Array.from(new Set(query.statuses));
      if (statuses.length === 0) return [];
      const batches = await Promise.all(statuses.map((status) => cloudList<V2Coupon>(
        V2_COLLECTIONS.coupons,
        { storeId: this.storeId, memberId, status }
      )));
      const rows = batches.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return query.limit === undefined ? rows : rows.slice(0, Math.max(0, query.limit));
    }
    return cloudOrderedList<V2Coupon>(
      V2_COLLECTIONS.coupons,
      { storeId: this.storeId, memberId },
      "createdAt",
      "desc",
      Math.max(0, query.limit ?? 50)
    );
  }
  async listPointLedgerByMember(memberId: string, query: V2MemberRecordPageQuery = {}) { return cloudMemberRecordPage<V2PointLedger>(V2_COLLECTIONS.pointLedger, this.storeId, memberId, query); }
  async inviteContributionTotals(memberId: string) {
    const _ = command();
    const $ = _.aggregate;
    const result = await collection(V2_COLLECTIONS.pointLedger)
      .aggregate()
      .match({ storeId: this.storeId, memberId, type: _.in(["INVITE_REWARD", "INVITE_REWARD_REFUND"]) })
      .group({ _id: "$relatedMemberId", total: $.sum("$amount") })
      .end();
    return ((result.list ?? []) as Array<{ _id?: string; total?: number }>).reduce<Record<string, number>>((totals, item) => {
      if (item._id) totals[item._id] = item.total ?? 0;
      return totals;
    }, {});
  }
  async searchMembers(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return cloudOrderedList<V2Member>(V2_COLLECTIONS.members, { storeId: this.storeId }, "createdAt", "desc", 50);
    const [memberCodeMatches, inviteCodeMatches, recent] = await Promise.all([
      collection(V2_COLLECTIONS.members).where({ storeId: this.storeId, memberCode: query.trim().toUpperCase() }).limit(50).get(),
      collection(V2_COLLECTIONS.members).where({ storeId: this.storeId, inviteCode: query.trim().toUpperCase() }).limit(50).get(),
      cloudOrderedList<V2Member>(V2_COLLECTIONS.members, { storeId: this.storeId }, "createdAt", "desc", 200)
    ]);
    const exact = [...(memberCodeMatches.data ?? []), ...(inviteCodeMatches.data ?? [])] as V2Member[];
    const nicknameMatches = recent.filter((item) => item.nickname?.toLowerCase().includes(normalized));
    return Array.from(new Map([...exact, ...nicknameMatches].map((item) => [item._id, item])).values()).slice(0, 50);
  }
  async getOwnerByUsername(username: string) { return (await cloudList<V2OwnerAccount>(V2_COLLECTIONS.ownerAccounts, { storeId: this.storeId, username }))[0] ?? null; }
  async getOwnerById(id: string) { return cloudGet<V2OwnerAccount>(V2_COLLECTIONS.ownerAccounts, id, this.storeId); }
  async saveOwner(owner: V2OwnerAccount) { await cloudSave(V2_COLLECTIONS.ownerAccounts, owner); }
  async getOwnerLoginAttempt(id: string) { return cloudGet<V2OwnerLoginAttempt>(V2_COLLECTIONS.ownerLoginAttempts, id, this.storeId); }
  async saveOwnerLoginAttempt(attempt: V2OwnerLoginAttempt) { await cloudSave(V2_COLLECTIONS.ownerLoginAttempts, attempt); }
  async listPaymentsDue(nowIso: string, limit: number) {
    const _ = command();
    const result = await collection(V2_COLLECTIONS.payments).where({ storeId: this.storeId, status: _.in(["INIT", "NOTPAY"]), nextQueryAt: _.lte(nowIso) }).limit(limit).get();
    return (result.data ?? []) as V2Payment[];
  }
  async listRefundsDue(nowIso: string, limit: number) {
    const _ = command();
    const result = await collection(V2_COLLECTIONS.refunds).where({ storeId: this.storeId, status: _.in(["PROCESSING", "ABNORMAL"]), nextQueryAt: _.lte(nowIso) }).limit(limit).get();
    return (result.data ?? []) as V2Refund[];
  }
  async dashboard(now: Date, dayBoundaryTime: string) {
    const date = businessDateAt(now, dayBoundaryTime);
    const start = new Date(`${date}T${dayBoundaryTime}:00+08:00`);
    const end = new Date(start.getTime() + 86_400_000);
    const _ = command();
    const createdAtRange = _.gte(start.toISOString()).and(_.lt(end.toISOString()));
    const [orders, ledger, memberCount, refundedOrders] = await Promise.all([
      cloudList<V2Order>(V2_COLLECTIONS.orders, { storeId: this.storeId, businessDate: date }),
      cloudList<V2PointLedger>(V2_COLLECTIONS.pointLedger, { storeId: this.storeId, businessDate: date }),
      collection(V2_COLLECTIONS.members).where({ storeId: this.storeId, createdAt: createdAtRange }).count(),
      cloudList<V2Order>(V2_COLLECTIONS.orders, { storeId: this.storeId, status: "REFUNDED", refundedAt: _.gte(start.toISOString()).and(_.lt(end.toISOString())) })
    ]);
    return dashboardFromRows(
      date,
      orders,
      ledger,
      memberCount.total ?? 0,
      refundedOrders.length
    );
  }

  async runTransaction<T>(callback: (transaction: V2Transaction) => Promise<T>): Promise<T> {
    return cloud.database().runTransaction(async (tx: CloudTransaction) => callback({
      getStoreConfig: () => txGet<V2StoreConfig>(tx, V2_COLLECTIONS.storeConfig, `${this.storeId}:config`, this.storeId),
      saveStoreConfig: (row) => txSave(tx, V2_COLLECTIONS.storeConfig, row, this.storeId),
      getCategory: (id) => txGet<V2Category>(tx, V2_COLLECTIONS.categories, id, this.storeId),
      saveCategory: (row) => txSave(tx, V2_COLLECTIONS.categories, row, this.storeId),
      getMember: (id) => txGet<V2Member>(tx, V2_COLLECTIONS.members, id, this.storeId),
      saveMember: (row) => txSave(tx, V2_COLLECTIONS.members, row, this.storeId),
      getInviteRelation: (id) => txGet<V2InviteRelation>(tx, V2_COLLECTIONS.inviteRelations, id, this.storeId),
      saveInviteRelation: (row) => txSave(tx, V2_COLLECTIONS.inviteRelations, row, this.storeId),
      getProduct: (id) => txGet<V2Product>(tx, V2_COLLECTIONS.products, id, this.storeId),
      saveProduct: (row) => txSave(tx, V2_COLLECTIONS.products, row, this.storeId),
      getExchangeItem: (id) => txGet<V2ExchangeItem>(tx, V2_COLLECTIONS.exchangeItems, id, this.storeId),
      saveExchangeItem: (row) => txSave(tx, V2_COLLECTIONS.exchangeItems, row, this.storeId),
      getOrder: (id) => txGet<V2Order>(tx, V2_COLLECTIONS.orders, id, this.storeId),
      saveOrder: (row) => txSave(tx, V2_COLLECTIONS.orders, row, this.storeId),
      getPayment: (id) => txGet<V2Payment>(tx, V2_COLLECTIONS.payments, id, this.storeId),
      savePayment: (row) => txSave(tx, V2_COLLECTIONS.payments, row, this.storeId),
      getRefund: (id) => txGet<V2Refund>(tx, V2_COLLECTIONS.refunds, id, this.storeId),
      saveRefund: (row) => txSave(tx, V2_COLLECTIONS.refunds, row, this.storeId),
      getCoupon: (id) => txGet<V2Coupon>(tx, V2_COLLECTIONS.coupons, id, this.storeId),
      saveCoupon: (row) => txSave(tx, V2_COLLECTIONS.coupons, row, this.storeId),
      getPointLedger: (id) => txGet<V2PointLedger>(tx, V2_COLLECTIONS.pointLedger, id, this.storeId),
      savePointLedger: (row) => txSave(tx, V2_COLLECTIONS.pointLedger, row, this.storeId),
      getOwner: (id) => txGet<V2OwnerAccount>(tx, V2_COLLECTIONS.ownerAccounts, id, this.storeId),
      saveOwner: (row) => txSave(tx, V2_COLLECTIONS.ownerAccounts, row, this.storeId),
      getOwnerLoginAttempt: (id) => txGet<V2OwnerLoginAttempt>(tx, V2_COLLECTIONS.ownerLoginAttempts, id, this.storeId),
      saveOwnerLoginAttempt: (row) => txSave(tx, V2_COLLECTIONS.ownerLoginAttempts, row, this.storeId),
      nextPickupNumber: async (businessDate, now) => {
        const id = `${this.storeId}:${businessDate}`;
        const current = await txGet<V2PickupCounter>(tx, V2_COLLECTIONS.pickupCounters, id, this.storeId);
        const sequence = (current?.sequence ?? 0) + 1;
        await txSave(tx, V2_COLLECTIONS.pickupCounters, {
          _id: id, storeId: this.storeId, businessDate, sequence,
          createdAt: current?.createdAt ?? now, updatedAt: now
        }, this.storeId);
        return sequence;
      }
    }));
  }

  async withInviteLock<T>(token: string, callback: () => Promise<T>): Promise<T> {
    const lockId = `${this.storeId}:invite-binding`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15_000).toISOString();
    await cloud.database().runTransaction(async (tx: CloudTransaction) => {
      const current = await txGet<V2LockRecord>(tx, V2_COLLECTIONS.locks, lockId, this.storeId);
      if (current && current.expiresAt > now.toISOString()) {
        throw new DomainError("INVITE_BINDING_BUSY", "绑定请求较多，请稍后重试");
      }
      await txSave(tx, V2_COLLECTIONS.locks, {
        _id: lockId, storeId: this.storeId, token, expiresAt,
        createdAt: current?.createdAt ?? now.toISOString(), updatedAt: now.toISOString()
      }, this.storeId);
    });
    try {
      return await callback();
    } finally {
      await cloud.database().runTransaction(async (tx: CloudTransaction) => {
        const current = await txGet<V2LockRecord>(tx, V2_COLLECTIONS.locks, lockId, this.storeId);
        if (current?.token === token) {
          await txSave(tx, V2_COLLECTIONS.locks, { ...current, expiresAt: new Date(0).toISOString(), updatedAt: new Date().toISOString() }, this.storeId);
        }
      }).catch(() => undefined);
    }
  }

  async withCategoryLock<T>(token: string, callback: () => Promise<T>): Promise<T> {
    const lockId = `${this.storeId}:category-management`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15_000).toISOString();
    await cloud.database().runTransaction(async (tx: CloudTransaction) => {
      const current = await txGet<V2LockRecord>(tx, V2_COLLECTIONS.locks, lockId, this.storeId);
      if (current && current.expiresAt > now.toISOString()) {
        throw new DomainError("CATEGORY_SAVE_BUSY", "分类正在保存，请稍后重试");
      }
      await txSave(tx, V2_COLLECTIONS.locks, {
        _id: lockId, storeId: this.storeId, token, expiresAt,
        createdAt: current?.createdAt ?? now.toISOString(), updatedAt: now.toISOString()
      }, this.storeId);
    });
    try {
      return await callback();
    } finally {
      await cloud.database().runTransaction(async (tx: CloudTransaction) => {
        const current = await txGet<V2LockRecord>(tx, V2_COLLECTIONS.locks, lockId, this.storeId);
        if (current?.token === token) {
          await txSave(tx, V2_COLLECTIONS.locks, { ...current, expiresAt: new Date(0).toISOString(), updatedAt: new Date().toISOString() }, this.storeId);
        }
      }).catch(() => undefined);
    }
  }
}

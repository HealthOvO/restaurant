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
  getMember(id: string): Promise<V2Member | null>;
  saveMember(member: V2Member): Promise<void>;
  getInviteRelation(inviteeMemberId: string): Promise<V2InviteRelation | null>;
  saveInviteRelation(relation: V2InviteRelation): Promise<void>;
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
  getOwnerLoginAttempt(id: string): Promise<V2OwnerLoginAttempt | null>;
  saveOwnerLoginAttempt(attempt: V2OwnerLoginAttempt): Promise<void>;
  nextPickupNumber(businessDate: string, now: string): Promise<number>;
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
  listOrdersByMember(memberId: string): Promise<V2Order[]>;
  listOwnerOrders(status?: V2Order["status"]): Promise<V2Order[]>;
  listCouponsByMember(memberId: string): Promise<V2Coupon[]>;
  listPointLedgerByMember(memberId: string): Promise<V2PointLedger[]>;
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

function sortOwnerOrders(rows: V2Order[], status?: V2Order["status"]): V2Order[] {
  const oldestFirst = status === "WAITING_FULFILLMENT";
  return rows.sort((left, right) => {
    const byTime = left.createdAt.localeCompare(right.createdAt);
    if (byTime !== 0) return oldestFirst ? byTime : -byTime;
    const byNumber = left.orderNo.localeCompare(right.orderNo);
    return oldestFirst ? byNumber : -byNumber;
  });
}

function createMemoryTransaction(data: InMemoryData, storeId: string): V2Transaction {
  return {
    getMember: async (id) => mapGet(data.members, id),
    saveMember: async (member) => mapSet(data.members, member),
    getInviteRelation: async (id) => mapGet(data.inviteRelations, id),
    saveInviteRelation: async (relation) => mapSet(data.inviteRelations, relation),
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
  async listOrdersByMember(memberId: string) { return values(this.data.orders).filter((item) => item.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async listOwnerOrders(status?: V2Order["status"]) { return sortOwnerOrders(values(this.data.orders).filter((item) => !status || item.status === status), status); }
  async listCouponsByMember(memberId: string) { return values(this.data.coupons).filter((item) => item.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async listPointLedgerByMember(memberId: string) { return values(this.data.pointLedger).filter((item) => item.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async searchMembers(query: string) {
    const normalized = query.trim().toLowerCase();
    return values(this.data.members).filter((item) => !normalized || [item.memberCode, item.inviteCode, item.nickname].some((value) => value?.toLowerCase().includes(normalized)));
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
    return dashboardFromRows(date, orders, ledger, members.length);
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

  snapshot(): Readonly<InMemoryData> { return cloneData(this.data); }
}

function dashboardFromRows(date: string, orders: V2Order[], ledger: V2PointLedger[], newMemberCount: number): V2DashboardStats {
  const paymentOrders = orders.filter((order) => order.paidAmount > 0 && Boolean(order.settledAt) && order.status !== "CANCELLED");
  return {
    businessDate: date,
    paymentOrderCount: paymentOrders.length,
    couponOrderCount: orders.filter((order) => (order.source === "COUPON" || order.source === "MIXED" || (order.couponApplications?.length ?? 0) > 0) && order.status !== "CANCELLED").length,
    paymentAmount: paymentOrders.reduce((total, order) => total + order.paidAmount, 0),
    completedOrderCount: orders.filter((order) => order.status === "COMPLETED").length,
    refundCount: orders.filter((order) => order.status === "REFUNDED").length,
    newMemberCount,
    buyerPointsIssued: ledger.filter((row) => row.type === "PURCHASE").reduce((total, row) => total + row.amount, 0),
    inviterPointsIssued: ledger.filter((row) => row.type === "INVITE_REWARD").reduce((total, row) => total + row.amount, 0),
    exchangePointsSpent: Math.abs(ledger.filter((row) => row.type === "COUPON_EXCHANGE").reduce((total, row) => total + row.amount, 0))
  };
}

type CloudTransaction = {
  collection(name: string): { doc(id: string): { get(): Promise<{ data?: unknown }>; set(options: { data: unknown }): Promise<unknown>; update(data: unknown): Promise<unknown> } };
};

function collection(name: string) { return cloud.database().collection(name); }
function command() { return cloud.database().command; }

async function cloudGet<T extends { storeId: string }>(name: string, id: string, storeId: string): Promise<T | null> {
  const result = await collection(name).doc(id).get().catch(() => null);
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
  const result = await tx.collection(name).doc(id).get().catch(() => null);
  const row = result?.data as T | undefined;
  return row?.storeId === storeId ? row : null;
}

async function txSave<T extends { _id: string; storeId: string }>(tx: CloudTransaction, name: string, row: T, storeId: string): Promise<void> {
  const document = tx.collection(name).doc(row._id);
  const result = await document.get().catch(() => null);
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
  async listOrdersByMember(memberId: string) { return (await cloudList<V2Order>(V2_COLLECTIONS.orders, { storeId: this.storeId, memberId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async listOwnerOrders(status?: V2Order["status"]) { return sortOwnerOrders(await cloudList<V2Order>(V2_COLLECTIONS.orders, { storeId: this.storeId, ...(status ? { status } : {}) }), status); }
  async listCouponsByMember(memberId: string) { return (await cloudList<V2Coupon>(V2_COLLECTIONS.coupons, { storeId: this.storeId, memberId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async listPointLedgerByMember(memberId: string) { return (await cloudList<V2PointLedger>(V2_COLLECTIONS.pointLedger, { storeId: this.storeId, memberId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async searchMembers(query: string) {
    const rows = await cloudList<V2Member>(V2_COLLECTIONS.members, { storeId: this.storeId });
    const normalized = query.toLowerCase();
    return rows.filter((item) => !normalized || [item.memberCode, item.inviteCode, item.nickname].some((value) => value?.toLowerCase().includes(normalized)));
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
    const [orders, ledger, members] = await Promise.all([
      cloudList<V2Order>(V2_COLLECTIONS.orders, { storeId: this.storeId, businessDate: date }),
      cloudList<V2PointLedger>(V2_COLLECTIONS.pointLedger, { storeId: this.storeId, businessDate: date }),
      cloudList<V2Member>(V2_COLLECTIONS.members, { storeId: this.storeId })
    ]);
    return dashboardFromRows(date, orders, ledger, members.filter((member) => businessDateAt(new Date(member.createdAt), dayBoundaryTime) === date).length);
  }

  async runTransaction<T>(callback: (transaction: V2Transaction) => Promise<T>): Promise<T> {
    return cloud.database().runTransaction(async (tx: CloudTransaction) => callback({
      getMember: (id) => txGet<V2Member>(tx, V2_COLLECTIONS.members, id, this.storeId),
      saveMember: (row) => txSave(tx, V2_COLLECTIONS.members, row, this.storeId),
      getInviteRelation: (id) => txGet<V2InviteRelation>(tx, V2_COLLECTIONS.inviteRelations, id, this.storeId),
      saveInviteRelation: (row) => txSave(tx, V2_COLLECTIONS.inviteRelations, row, this.storeId),
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
}

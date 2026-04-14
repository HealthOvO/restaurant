export type Role = "OWNER" | "STAFF";
export type AccessScope = "STORE_ONLY" | "ALL_STORES";

export type InviteRelationStatus = "PENDING" | "ACTIVATED" | "ADJUSTED";
export type RewardRuleType = "WELCOME" | "INVITE_MILESTONE";
export type InviteRewardMode = "ONCE" | "REPEATABLE";
export type VoucherStatus = "READY" | "USED" | "EXPIRED" | "VOID";
export type VoucherSource = "WELCOME" | "INVITE_MILESTONE" | "POINT_EXCHANGE" | "MANUAL_COMPENSATION";
export type AuditActorType = "SYSTEM" | "OWNER" | "STAFF" | "MEMBER";
export type PointTransactionType = "INVITE_REWARD" | "MANUAL_ADJUST" | "POINT_EXCHANGE";
export type FeedbackSourceType = "MEMBER" | "STAFF";
export type FeedbackChannel = "MINIPROGRAM_MEMBER" | "MINIPROGRAM_STAFF";
export type FeedbackStatus = "OPEN" | "PROCESSING" | "RESOLVED";
export type FeedbackPriority = "NORMAL" | "HIGH" | "URGENT";
export type OpsTaskType = "ORDER_VISIT_SETTLEMENT";
export type OpsTaskStatus = "OPEN" | "RESOLVED" | "IGNORED";
export type OpsTaskPriority = "NORMAL" | "HIGH" | "URGENT";
export type OpsTaskResolution = "RETRY_SUCCESS" | "MANUAL_RESOLVED" | "IGNORED";
export type MenuFulfillmentMode = "DINE_IN" | "PICKUP";
export type OrderStatus = "PENDING_CONFIRM" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type OrderSourceChannel = "MINIPROGRAM";
export type FeedbackCategory =
  | "BUG"
  | "POINTS"
  | "VOUCHER"
  | "VISIT"
  | "INVITE"
  | "STAFF_TOOL"
  | "SUGGESTION"
  | "OTHER";

export interface BaseRecord {
  _id: string;
  storeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DishRewardTemplate {
  dishId: string;
  dishName: string;
  dishImageUrl?: string;
  validDays: number;
}

export interface Member extends BaseRecord {
  memberCode: string;
  openId: string;
  phone?: string;
  phoneVerifiedAt?: string;
  nickname?: string;
  avatarUrl?: string;
  pendingInviterMemberId?: string | null;
  pendingInviteCode?: string | null;
  pointsBalance: number;
  activatedInviteCount?: number;
  inviteRewardIssuedCounts?: Record<string, number>;
  hasCompletedFirstVisit: boolean;
  firstVisitAt?: string;
}

export interface InviteRelation extends BaseRecord {
  inviterMemberId: string;
  inviteeMemberId: string;
  status: InviteRelationStatus;
  activatedAt?: string;
  adjustedReason?: string;
}

export interface RewardRule extends BaseRecord {
  name: string;
  type: RewardRuleType;
  threshold?: number;
  rewardMode?: InviteRewardMode;
  isEnabled: boolean;
  sortOrder: number;
  voucherTemplate?: DishRewardTemplate;
  pointsReward?: number;
}

export interface VisitRecord extends BaseRecord {
  memberId: string;
  externalOrderNo: string;
  verifiedByStaffId: string;
  operatorChannel: "MINIPROGRAM" | "WEB";
  tableNo?: string;
  notes?: string;
  isFirstValidVisit: boolean;
  verifiedAt: string;
}

export interface DishVoucher extends BaseRecord {
  memberId: string;
  source: VoucherSource;
  sourceRuleId?: string;
  sourceVisitRecordId?: string;
  dishId: string;
  dishName: string;
  status: VoucherStatus;
  expiresAt: string;
  usedAt?: string;
  usedByStaffId?: string;
}

export interface VoucherRedemption extends BaseRecord {
  voucherId: string;
  memberId: string;
  redeemedByStaffId: string;
  redeemedAt: string;
}

export interface PointExchangeItem extends BaseRecord {
  name: string;
  pointsCost: number;
  isEnabled: boolean;
  sortOrder: number;
  voucherTemplate: DishRewardTemplate;
}

export interface MenuItemOptionChoice {
  _id: string;
  name: string;
  priceDelta: number;
  isEnabled: boolean;
  isDefault?: boolean;
}

export interface MenuItemOptionGroup {
  _id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  maxSelect?: number;
  choices: MenuItemOptionChoice[];
}

export interface MenuCategory extends BaseRecord {
  name: string;
  description?: string;
  sortOrder: number;
  isEnabled: boolean;
  heroTone?: string;
}

export interface MenuItem extends BaseRecord {
  categoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  isEnabled: boolean;
  isRecommended: boolean;
  isSoldOut: boolean;
  sortOrder: number;
  tags?: string[];
  monthlySales?: number;
  optionGroups?: MenuItemOptionGroup[];
}

export interface OrderSelectedOption {
  groupId: string;
  groupName: string;
  choiceId: string;
  choiceName: string;
  priceDelta: number;
}

export interface OrderLineItem {
  lineId: string;
  menuItemId: string;
  categoryId: string;
  name: string;
  imageUrl?: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  selectedOptions: OrderSelectedOption[];
  lineTotal: number;
  note?: string;
}

export interface StoreConfig extends BaseRecord {
  storeName: string;
  storeSubtitle?: string;
  announcement?: string;
  address?: string;
  contactPhone?: string;
  businessHoursText?: string;
  dineInEnabled: boolean;
  pickupEnabled: boolean;
  minOrderAmount: number;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerTags?: string[];
  orderNotice?: string;
}

export interface OrderRecord extends BaseRecord {
  orderNo: string;
  requestId?: string;
  memberId?: string;
  memberOpenId: string;
  memberCode?: string;
  nickname?: string;
  status: OrderStatus;
  fulfillmentMode: MenuFulfillmentMode;
  sourceChannel: OrderSourceChannel;
  tableNo?: string;
  contactName?: string;
  contactPhone?: string;
  remark?: string;
  itemCount: number;
  subtotalAmount: number;
  payableAmount: number;
  currency: "CNY";
  lineItems: OrderLineItem[];
  submittedAt: string;
  statusChangedAt: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  processedByStaffId?: string;
  visitRecordId?: string;
}

export interface OrderStatusLog extends BaseRecord {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  operatorType: AuditActorType;
  operatorId: string;
  operatorName?: string;
  note?: string;
}

export interface MemberPointTransaction extends BaseRecord {
  memberId: string;
  type: PointTransactionType;
  changeAmount: number;
  balanceAfter: number;
  sourceRuleId?: string;
  sourceVisitRecordId?: string;
  sourceExchangeItemId?: string;
  sourceVoucherId?: string;
  note?: string;
}

export interface StaffUser extends BaseRecord {
  username: string;
  passwordHash: string;
  displayName: string;
  role: Role;
  isEnabled: boolean;
  miniOpenId?: string;
  accessScope?: AccessScope;
  managedStoreIds?: string[];
}

export interface FeedbackTicket extends BaseRecord {
  feedbackCode: string;
  sourceType: FeedbackSourceType;
  sourceChannel: FeedbackChannel;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  category: FeedbackCategory;
  title: string;
  content: string;
  submitterOpenId?: string;
  memberId?: string;
  memberCode?: string;
  staffUserId?: string;
  staffUsername?: string;
  contactName?: string;
  contactInfo?: string;
  sourcePage?: string;
  ownerReply?: string;
  handledByStaffId?: string;
  handledAt?: string;
}

export interface OpsTask extends BaseRecord {
  taskType: OpsTaskType;
  status: OpsTaskStatus;
  priority: OpsTaskPriority;
  title: string;
  description: string;
  dedupeKey: string;
  sourceFunction: string;
  orderId?: string;
  orderNo?: string;
  memberId?: string;
  memberCode?: string;
  lastErrorCode?: string;
  retryCount: number;
  lastTriggeredAt: string;
  lastRetriedAt?: string;
  resolvedAt?: string;
  resolvedByStaffId?: string;
  resolution?: OpsTaskResolution;
  resolutionNote?: string;
}

export interface AuditLog extends BaseRecord {
  actorId: string;
  actorType: AuditActorType;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface InviteOverviewMilestone {
  ruleId: string;
  title: string;
  threshold: number;
  pointsReward: number;
  rewardMode: InviteRewardMode;
  rewardedCount: number;
  pendingRewardCount: number;
  nextRewardThreshold: number;
  isReached: boolean;
  isRewarded: boolean;
}

export interface InviteOverview {
  inviterMemberId: string;
  activatedCount: number;
  pendingCount: number;
  milestones: InviteOverviewMilestone[];
}

export interface MenuCatalogPayload {
  storeConfig: StoreConfig;
  categories: MenuCategory[];
  items: MenuItem[];
}

export interface MemberState {
  member: Member | null;
  relation: InviteRelation | null;
}

export interface StaffMemberLookupRow {
  member: Pick<
    Member,
    | "_id"
    | "memberCode"
    | "phone"
    | "phoneVerifiedAt"
    | "nickname"
    | "pointsBalance"
    | "hasCompletedFirstVisit"
    | "firstVisitAt"
  >;
  relationStatus: InviteRelationStatus | null;
  latestVisitAt?: string;
  readyVoucherCount: number;
  totalVoucherCount: number;
  totalVisitCount: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  pageItemCount: number;
  rangeStart: number;
  rangeEnd: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

export interface AuthSessionClaims {
  staffUserId: string;
  username: string;
  role: Role;
  storeId: string;
  accessScope?: AccessScope;
  managedStoreIds?: string[];
}

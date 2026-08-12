export type V2OrderSource = "WECHAT_PAY" | "COUPON" | "MIXED";
export type V2OrderStatus =
  | "PENDING_PAYMENT"
  | "WAITING_FULFILLMENT"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDING"
  | "REFUNDED";
export type V2PaymentStatus = "INIT" | "NOTPAY" | "SUCCESS" | "CLOSED" | "REFUND";
export type V2RefundStatus = "PROCESSING" | "SUCCESS" | "CLOSED" | "ABNORMAL";
export type V2CouponStatus = "AVAILABLE" | "RESERVED" | "USED" | "EXPIRED" | "VOID";
export type V2PointLedgerType =
  | "PURCHASE"
  | "INVITE_REWARD"
  | "COUPON_EXCHANGE"
  | "COUPON_VOID_REFUND"
  | "PURCHASE_REFUND"
  | "INVITE_REWARD_REFUND";

export interface V2BaseRecord {
  _id: string;
  storeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface V2SpecChoice {
  id: string;
  name: string;
  priceDelta: number;
  enabled: boolean;
  isDefault?: boolean;
}

export interface V2SpecGroup {
  id: string;
  name: string;
  mode: "SINGLE" | "MULTIPLE";
  required: boolean;
  maxSelect?: number;
  choices: V2SpecChoice[];
}

export interface V2Category extends V2BaseRecord {
  name: string;
  enabled: boolean;
  sortOrder: number;
  version: number;
}

export interface V2Product extends V2BaseRecord {
  /** Optional for records created before categories were introduced. */
  categoryId?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  basePrice: number;
  enabled: boolean;
  soldOut: boolean;
  sortOrder: number;
  pointsEnabled: boolean;
  buyerPointsPerUnit: number;
  inviterPointsPerUnit: number;
  specGroups: V2SpecGroup[];
  version: number;
}

export interface V2StoreConfig extends V2BaseRecord {
  storeName: string;
  announcement?: string;
  businessOpen: boolean;
  dayBoundaryTime: string;
  version: number;
}

export interface V2Member extends V2BaseRecord {
  openId: string;
  memberCode: string;
  inviteCode: string;
  nickname?: string;
  avatarUrl?: string;
  pointsBalance: number;
  inviterMemberId?: string;
}

export interface V2InviteRelation extends V2BaseRecord {
  inviterMemberId: string;
  inviteeMemberId: string;
  boundAt: string;
}

export interface V2CartSelection {
  groupId: string;
  choiceIds: string[];
}

export interface V2CartLineInput {
  productId: string;
  quantity: number;
  selections: V2CartSelection[];
  note?: string;
}

export interface V2CouponCartInput {
  couponId: string;
  selections: V2CartSelection[];
}

export interface V2SelectedChoiceSnapshot {
  groupId: string;
  groupName: string;
  choiceId: string;
  choiceName: string;
  priceDelta: number;
}

export interface V2OrderLineSnapshot {
  lineId: string;
  productId: string;
  productVersion: number;
  productName: string;
  imageUrl?: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  lineTotal: number;
  buyerPointsPerUnit: number;
  inviterPointsPerUnit: number;
  buyerPointsTotal: number;
  inviterPointsTotal: number;
  selectedChoices: V2SelectedChoiceSnapshot[];
  note?: string;
  pricingSource?: "PAID" | "COUPON";
  couponId?: string;
  originalUnitPrice?: number;
}

export interface V2CouponApplication {
  couponId: string;
  couponName: string;
  productId: string;
  productName: string;
  pointsCost: number;
  lineId: string;
}

export interface V2OrderQuote {
  lineItems: V2OrderLineSnapshot[];
  itemCount: number;
  payableAmount: number;
  buyerPoints: number;
  inviterPoints: number;
}

export interface V2Order extends V2BaseRecord {
  orderNo: string;
  requestKey: string;
  memberId: string;
  memberOpenId: string;
  inviterMemberId?: string;
  source: V2OrderSource;
  status: V2OrderStatus;
  paymentStatus?: V2PaymentStatus;
  refundStatus?: V2RefundStatus;
  activeRefundId?: string;
  refundAttempt?: number;
  payableAmount: number;
  paidAmount: number;
  itemCount: number;
  buyerPoints: number;
  inviterPoints: number;
  lineItems: V2OrderLineSnapshot[];
  couponApplications?: V2CouponApplication[];
  /** Legacy single-coupon fields retained for existing orders. */
  couponId?: string;
  couponName?: string;
  couponPointsCost?: number;
  businessDate?: string;
  pickupSequence?: number;
  pickupNumber?: string;
  settledAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  refundedAt?: string;
}

export interface V2CursorPage<T> {
  rows: T[];
  nextCursor?: string;
}

export interface V2Payment extends V2BaseRecord {
  orderId: string;
  outTradeNo: string;
  wechatTransactionId?: string;
  amount: number;
  status: V2PaymentStatus;
  expiresAt: string;
  nextQueryAt: string;
  queryCount: number;
  confirmedBy?: "CALLBACK" | "CUSTOMER_QUERY" | "JOB" | "MOCK";
}

export interface V2Refund extends V2BaseRecord {
  orderId: string;
  outRefundNo: string;
  wechatRefundId?: string;
  amount: number;
  status: V2RefundStatus;
  nextQueryAt: string;
  queryCount: number;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  recoveryAction?: "QUERY" | "RESUBMIT" | "MANUAL";
  confirmedBy?: "CALLBACK" | "OWNER_QUERY" | "JOB" | "MOCK";
}

export interface V2ExchangeItem extends V2BaseRecord {
  name: string;
  productId: string;
  productName: string;
  pointsCost: number;
  validDays: number;
  enabled: boolean;
  sortOrder: number;
  version: number;
}

export interface V2Coupon extends V2BaseRecord {
  memberId: string;
  exchangeItemId: string;
  exchangeItemVersion: number;
  name: string;
  productId: string;
  productName: string;
  productSnapshot?: V2Product;
  pointsCost: number;
  status: V2CouponStatus;
  expiresAt: string;
  reservedOrderId?: string;
  reservedAt?: string;
  usedOrderId?: string;
  usedAt?: string;
  voidedAt?: string;
}

export interface V2PointLedger extends V2BaseRecord {
  memberId: string;
  type: V2PointLedgerType;
  amount: number;
  balanceAfter: number;
  orderId?: string;
  couponId?: string;
  relatedMemberId?: string;
  businessDate: string;
  note: string;
}

export interface V2OwnerAccount extends V2BaseRecord {
  username: string;
  displayName: string;
  passwordHash: string;
  enabled: boolean;
  sessionVersion: number;
  lastLoginAt?: string;
}

export interface V2DashboardStats {
  businessDate: string;
  paymentOrderCount: number;
  couponOrderCount: number;
  paymentAmount: number;
  completedOrderCount: number;
  refundCount: number;
  newMemberCount: number;
  buyerPointsIssued: number;
  inviterPointsIssued: number;
  exchangePointsSpent: number;
}

export interface V2MemberDetail extends V2Member {
  inviter?: Pick<V2Member, "_id" | "memberCode" | "nickname">;
  invitees: Array<Pick<V2Member, "_id" | "memberCode" | "nickname" | "createdAt"> & { contributedPoints: number }>;
  coupons: V2Coupon[];
  pointLedger: V2PointLedger[];
  recentOrders: V2Order[];
}

export interface V2OwnerSession {
  token: string;
  owner: Pick<V2OwnerAccount, "_id" | "username" | "displayName">;
  expiresAt: string;
}

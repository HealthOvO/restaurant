import { z } from "zod";

const ruleSchema = z.object({
  _id: z.string().min(1).optional(),
  name: z.string().trim().min(2),
  type: z.enum(["WELCOME", "INVITE_MILESTONE"]),
  threshold: z.number().int().positive().optional(),
  rewardMode: z.enum(["ONCE", "REPEATABLE"]).optional(),
  isEnabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  voucherTemplate: z
    .object({
      dishId: z.string().trim().min(1),
      dishName: z.string().trim().min(1),
      dishImageUrl: z.string().url().optional(),
      validDays: z.number().int().positive().max(365)
    })
    .optional(),
  pointsReward: z.number().int().positive().optional()
});

const exchangeItemSchema = z.object({
  _id: z.string().min(1).optional(),
  name: z.string().trim().min(2),
  pointsCost: z.number().int().positive(),
  isEnabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  voucherTemplate: z.object({
    dishId: z.string().trim().min(1),
    dishName: z.string().trim().min(1),
    dishImageUrl: z.string().url().optional(),
    validDays: z.number().int().positive().max(365)
  })
});

const menuItemOptionChoiceSchema = z.object({
  _id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  priceDelta: z.number().nonnegative(),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().optional()
});

const menuItemOptionGroupSchema = z.object({
  _id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  required: z.boolean(),
  multiSelect: z.boolean(),
  maxSelect: z.number().int().positive().max(8).optional(),
  choices: z.array(menuItemOptionChoiceSchema).min(1)
});

const menuCategorySchema = z.object({
  _id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().max(60).optional(),
  sortOrder: z.number().int().nonnegative(),
  isEnabled: z.boolean(),
  heroTone: z.string().trim().max(20).optional()
});

const menuItemSchema = z.object({
  _id: z.string().min(1).optional(),
  categoryId: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().max(120).optional(),
  imageUrl: z.string().url().optional(),
  price: z.number().nonnegative(),
  isEnabled: z.boolean(),
  isRecommended: z.boolean(),
  isSoldOut: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  tags: z.array(z.string().trim().min(1).max(12)).max(6).optional(),
  monthlySales: z.number().int().nonnegative().max(999999).optional(),
  optionGroups: z.array(menuItemOptionGroupSchema).max(10).optional()
});

const storeConfigSchema = z.object({
  storeName: z.string().trim().min(2).max(30),
  storeSubtitle: z.string().trim().max(40).optional(),
  announcement: z.string().trim().max(120).optional(),
  address: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  businessHoursText: z.string().trim().max(60).optional(),
  dineInEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  minOrderAmount: z.number().nonnegative().max(99999),
  bannerTitle: z.string().trim().max(30).optional(),
  bannerSubtitle: z.string().trim().max(60).optional(),
  bannerTags: z.array(z.string().trim().min(1).max(12)).max(6).optional(),
  orderNotice: z.string().trim().max(120).optional()
});

const orderLineOptionSchema = z.object({
  groupId: z.string().min(1),
  choiceId: z.string().min(1)
});

const orderLineInputSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive().max(99),
  note: z.string().trim().max(40).optional(),
  selectedOptions: z.array(orderLineOptionSchema).max(20).optional().default([])
});

const orderMemberBenefitsChoiceSchema = z.enum(["VERIFY_AND_PARTICIPATE", "SKIP_THIS_ORDER"]);

const feedbackCategorySchema = z.enum([
  "BUG",
  "POINTS",
  "VOUCHER",
  "VISIT",
  "INVITE",
  "STAFF_TOOL",
  "SUGGESTION",
  "OTHER"
]);

const feedbackStatusSchema = z.enum(["OPEN", "PROCESSING", "RESOLVED"]);
const feedbackPrioritySchema = z.enum(["NORMAL", "HIGH", "URGENT"]);
const opsTaskStatusSchema = z.enum(["OPEN", "RESOLVED", "IGNORED"]);
const opsTaskResolveActionSchema = z.enum(["RESOLVE", "IGNORE"]);

export const loginInputSchema = z.object({
  storeId: z.string().trim().min(1).optional(),
  username: z.string().min(3),
  password: z.string().min(6),
  miniOpenId: z.string().optional()
});

export const sessionTokenInputSchema = z.object({
  sessionToken: z.string().min(1)
});

export const bootstrapInputSchema = z.object({
  phoneCode: z.string().min(1).optional(),
  nickname: z.string().trim().max(30).optional(),
  avatarUrl: z.string().url().optional(),
  inviteCode: z.string().trim().optional()
});

export const bindInviteInputSchema = z.object({
  inviterMemberId: z.string().min(1).optional(),
  inviteCode: z.string().trim().min(1).optional(),
  inviteeMemberId: z.string().min(1)
}).refine((input) => !!(input.inviterMemberId || input.inviteCode), {
  message: "邀请人 ID 或邀请码至少提供一个",
  path: ["inviterMemberId"]
});

export const settleVisitInputSchema = z.object({
  sessionToken: z.string().min(1),
  memberId: z.string().min(1),
  externalOrderNo: z.string().min(1),
  tableNo: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(120).optional(),
  operatorChannel: z.enum(["MINIPROGRAM", "WEB"]).default("MINIPROGRAM")
});

export const redeemVoucherInputSchema = z.object({
  sessionToken: z.string().min(1),
  voucherId: z.string().min(1)
});

export const previewVoucherInputSchema = z.object({
  sessionToken: z.string().min(1),
  voucherId: z.string().min(1)
});

export const memberQueryInputSchema = z.object({
  sessionToken: z.string().min(1),
  query: z.string().trim().max(50).optional().default(""),
  page: z.number().int().positive().max(999).optional().default(1),
  pageSize: z.number().int().positive().max(50).optional().default(10)
});

export const staffMemberLookupInputSchema = z.object({
  sessionToken: z.string().min(1),
  query: z.string().trim().min(1).max(50),
  limit: z.number().int().positive().max(20).optional().default(10)
});

export const ruleSaveInputSchema = z.object({
  sessionToken: z.string().min(1),
  rules: z.array(ruleSchema),
  exchangeItems: z.array(exchangeItemSchema).optional().default([])
});

export const adjustBindingInputSchema = z.object({
  sessionToken: z.string().min(1),
  inviteeMemberId: z.string().min(1),
  inviterMemberId: z.string().min(1),
  reason: z.string().trim().min(4).max(120)
});

export const adjustMemberPointsInputSchema = z.object({
  sessionToken: z.string().min(1),
  memberId: z.string().min(1),
  delta: z.number().int().refine((value) => value !== 0, {
    message: "积分变动不能为 0"
  }),
  reason: z.string().trim().min(2).max(120)
});

export const pointRedeemInputSchema = z.object({
  exchangeItemId: z.string().min(1),
  requestId: z.string().trim().min(1).max(80).optional()
});

export const menuCatalogInputSchema = z.object({
  includeDisabled: z.boolean().optional().default(false)
});

export const orderPreviewInputSchema = z.object({
  fulfillmentMode: z.enum(["DINE_IN", "PICKUP"]),
  tableNo: z.string().trim().max(20).optional(),
  contactName: z.string().trim().max(30).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  remark: z.string().trim().max(120).optional(),
  memberBenefitsChoice: orderMemberBenefitsChoiceSchema.optional(),
  items: z.array(orderLineInputSchema).min(1).max(60)
});

export const orderCreateInputSchema = orderPreviewInputSchema.extend({
  requestId: z.string().trim().min(1).max(80).optional()
});

export const orderDetailInputSchema = z.object({
  orderId: z.string().min(1)
});

export const staffOrderListInputSchema = z.object({
  sessionToken: z.string().min(1),
  status: z.enum(["PENDING_CONFIRM", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]).optional(),
  keyword: z.string().trim().max(50).optional().default(""),
  limit: z.number().int().positive().max(50).optional().default(20)
});

export const staffOrderDetailInputSchema = z.object({
  sessionToken: z.string().min(1),
  orderId: z.string().min(1)
});

export const staffOrderUpdateInputSchema = z.object({
  sessionToken: z.string().min(1),
  orderId: z.string().min(1),
  nextStatus: z.enum(["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]),
  note: z.string().trim().max(120).optional().default("")
});

export const adminMenuListInputSchema = z.object({
  sessionToken: z.string().min(1)
});

export const adminMenuSaveInputSchema = z.object({
  sessionToken: z.string().min(1),
  categories: z.array(menuCategorySchema),
  items: z.array(menuItemSchema),
  storeConfig: storeConfigSchema
});

export const adminOrdersQueryInputSchema = z.object({
  sessionToken: z.string().min(1),
  query: z.string().trim().max(50).optional().default(""),
  status: z.enum(["PENDING_CONFIRM", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]).optional(),
  page: z.number().int().positive().max(999).optional().default(1),
  pageSize: z.number().int().positive().max(50).optional().default(10)
});

export const memberFeedbackSubmitInputSchema = z.object({
  title: z.string().trim().min(4).max(40),
  content: z.string().trim().min(8).max(300),
  category: feedbackCategorySchema,
  contactName: z.string().trim().max(30).optional(),
  contactInfo: z.string().trim().max(40).optional(),
  sourcePage: z.string().trim().max(120).optional()
});

export const staffFeedbackSubmitInputSchema = memberFeedbackSubmitInputSchema.extend({
  sessionToken: z.string().min(1)
});

export const staffFeedbackMineInputSchema = z.object({
  sessionToken: z.string().min(1)
});

export const adminFeedbackListInputSchema = z.object({
  sessionToken: z.string().min(1)
});

export const adminFeedbackUpdateInputSchema = z.object({
  sessionToken: z.string().min(1),
  feedbackId: z.string().min(1),
  status: feedbackStatusSchema,
  priority: feedbackPrioritySchema,
  ownerReply: z.string().trim().max(300).optional().default("")
});

export const adminOpsTaskListInputSchema = z.object({
  sessionToken: z.string().min(1),
  status: opsTaskStatusSchema.optional().default("OPEN"),
  limit: z.number().int().positive().max(100).optional().default(50)
});

export const adminOpsTaskRetryInputSchema = z.object({
  sessionToken: z.string().min(1),
  taskId: z.string().min(1)
});

export const adminOpsTaskResolveInputSchema = z.object({
  sessionToken: z.string().min(1),
  taskId: z.string().min(1),
  action: opsTaskResolveActionSchema,
  note: z.string().trim().max(200).optional().default("")
});

export const bootstrapStoreOwnerInputSchema = z.object({
  secret: z.string().trim().min(8),
  ownerUsername: z.string().trim().min(3),
  ownerPassword: z.string().min(6),
  ownerDisplayName: z.string().trim().min(2).max(30).optional(),
  accessScope: z.enum(["STORE_ONLY", "ALL_STORES"]).optional().default("STORE_ONLY"),
  managedStoreIds: z.array(z.string().trim().min(1)).optional().default([])
});

export const staffManageInputSchema = z.object({
  sessionToken: z.string().min(1).optional(),
  action: z.enum(["LIST", "CREATE", "UPDATE_STATUS", "UPDATE_PASSWORD"]),
  user: z
    .object({
      _id: z.string().optional(),
      username: z.string().trim().min(3),
      password: z.string().min(6).optional(),
      displayName: z.string().trim().min(2),
      role: z.enum(["OWNER", "STAFF"]),
      isEnabled: z.boolean().optional(),
      miniOpenId: z.string().optional()
    })
    .optional()
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type SessionTokenInput = z.infer<typeof sessionTokenInputSchema>;
export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;
export type BindInviteInput = z.infer<typeof bindInviteInputSchema>;
export type SettleVisitInput = z.infer<typeof settleVisitInputSchema>;
export type RedeemVoucherInput = z.infer<typeof redeemVoucherInputSchema>;
export type PreviewVoucherInput = z.infer<typeof previewVoucherInputSchema>;
export type MemberQueryInput = z.infer<typeof memberQueryInputSchema>;
export type StaffMemberLookupInput = z.infer<typeof staffMemberLookupInputSchema>;
export type RuleSaveInput = z.infer<typeof ruleSaveInputSchema>;
export type AdjustBindingInput = z.infer<typeof adjustBindingInputSchema>;
export type AdjustMemberPointsInput = z.infer<typeof adjustMemberPointsInputSchema>;
export type PointRedeemInput = z.infer<typeof pointRedeemInputSchema>;
export type MenuCatalogInput = z.infer<typeof menuCatalogInputSchema>;
export type OrderPreviewInput = z.infer<typeof orderPreviewInputSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;
export type OrderDetailInput = z.infer<typeof orderDetailInputSchema>;
export type StaffOrderListInput = z.infer<typeof staffOrderListInputSchema>;
export type StaffOrderDetailInput = z.infer<typeof staffOrderDetailInputSchema>;
export type StaffOrderUpdateInput = z.infer<typeof staffOrderUpdateInputSchema>;
export type AdminMenuListInput = z.infer<typeof adminMenuListInputSchema>;
export type AdminMenuSaveInput = z.infer<typeof adminMenuSaveInputSchema>;
export type AdminOrdersQueryInput = z.infer<typeof adminOrdersQueryInputSchema>;
export type MemberFeedbackSubmitInput = z.infer<typeof memberFeedbackSubmitInputSchema>;
export type StaffFeedbackSubmitInput = z.infer<typeof staffFeedbackSubmitInputSchema>;
export type StaffFeedbackMineInput = z.infer<typeof staffFeedbackMineInputSchema>;
export type AdminFeedbackListInput = z.infer<typeof adminFeedbackListInputSchema>;
export type AdminFeedbackUpdateInput = z.infer<typeof adminFeedbackUpdateInputSchema>;
export type AdminOpsTaskListInput = z.infer<typeof adminOpsTaskListInputSchema>;
export type AdminOpsTaskRetryInput = z.infer<typeof adminOpsTaskRetryInputSchema>;
export type AdminOpsTaskResolveInput = z.infer<typeof adminOpsTaskResolveInputSchema>;
export type BootstrapStoreOwnerInput = z.infer<typeof bootstrapStoreOwnerInputSchema>;
export type StaffManageInput = z.infer<typeof staffManageInputSchema>;

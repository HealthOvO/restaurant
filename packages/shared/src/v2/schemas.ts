import { z } from "zod";

const idSchema = z.string().trim().min(1).max(80);
const requestIdSchema = z.string().trim().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/);
const nonNegativeInteger = z.number().int().min(0).max(1_000_000);
const priceSchema = z.number().int().min(0).max(10_000_000);

export const v2SpecChoiceSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(24),
  priceDelta: priceSchema,
  enabled: z.boolean(),
  isDefault: z.boolean().optional()
});

export const v2SpecGroupSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(24),
    mode: z.enum(["SINGLE", "MULTIPLE"]),
    required: z.boolean(),
    maxSelect: z.number().int().min(1).max(20).optional(),
    choices: z.array(v2SpecChoiceSchema).min(1).max(30)
  })
  .superRefine((group, context) => {
    const ids = group.choices.map((choice) => choice.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "同一规格组的选项 ID 不能重复", path: ["choices"] });
    }
    const defaultCount = group.choices.filter((choice) => choice.isDefault).length;
    if (group.mode === "SINGLE" && defaultCount > 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "单选规格最多一个默认项", path: ["choices"] });
    }
    if (group.mode === "SINGLE" && group.maxSelect && group.maxSelect !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "单选规格最多选择 1 项", path: ["maxSelect"] });
    }
  });

export const v2ProductSaveSchema = z
  .object({
    id: idSchema.optional(),
    categoryId: idSchema.optional(),
    name: z.string().trim().min(1).max(40),
    description: z.string().trim().max(160).optional(),
    imageUrl: z.string().trim().max(1000).optional(),
    basePrice: priceSchema,
    enabled: z.boolean(),
    soldOut: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999),
    pointsEnabled: z.boolean(),
    buyerPointsPerUnit: nonNegativeInteger,
    inviterPointsPerUnit: nonNegativeInteger,
    specGroups: z.array(v2SpecGroupSchema).max(12)
  })
  .superRefine((product, context) => {
    const groupIds = product.specGroups.map((group) => group.id);
    if (new Set(groupIds).size !== groupIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "规格组 ID 不能重复", path: ["specGroups"] });
    }
    product.specGroups.forEach((group, index) => {
      if (group.required && !group.choices.some((choice) => choice.enabled)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${group.name}至少需要一个可选项`, path: ["specGroups", index, "choices"] });
      }
    });
  });

export const v2StoreConfigSaveSchema = z.object({
  storeName: z.string().trim().min(1).max(40),
  announcement: z.string().trim().max(200).optional(),
  businessOpen: z.boolean(),
  dayBoundaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});

export const v2CartSelectionSchema = z.object({
  groupId: idSchema,
  choiceIds: z.array(idSchema).max(20)
});

export const v2CartLineInputSchema = z.object({
  productId: idSchema,
  quantity: z.number().int().min(1).max(99),
  selections: z.array(v2CartSelectionSchema).max(12),
  note: z.string().trim().max(80).optional()
});

export const v2OrderCreateSchema = z
  .object({
    requestId: requestIdSchema,
    expectedPayableAmount: priceSchema,
    expectedBuyerPoints: nonNegativeInteger,
    lineItems: z.array(v2CartLineInputSchema).max(30).default([]),
    couponItems: z.array(z.object({
      couponId: idSchema,
      selections: z.array(v2CartSelectionSchema).max(12)
    })).max(20).default([])
  })
  .superRefine((order, context) => {
    if (order.lineItems.length === 0 && order.couponItems.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "请先选择商品", path: ["lineItems"] });
    }
    const totalQuantity = order.lineItems.reduce((sum, line) => sum + line.quantity, 0);
    if (totalQuantity + order.couponItems.length > 99) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "单笔订单最多 99 份", path: ["lineItems"] });
    }
    const couponIds = order.couponItems.map((item) => item.couponId);
    if (new Set(couponIds).size !== couponIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "同一张商品券不能重复使用", path: ["couponItems"] });
    }
  });

export const v2CouponExchangeSchema = z.object({
  requestId: requestIdSchema,
  exchangeItemId: idSchema,
  expectedVersion: z.number().int().min(1).max(1_000_000),
  expectedPointsCost: z.number().int().min(1).max(1_000_000)
});

export const v2CouponUseSchema = z.object({
  requestId: requestIdSchema,
  couponId: idSchema,
  selections: z.array(v2CartSelectionSchema).max(12)
});

export const v2InviteBindSchema = z.object({ inviteCode: z.string().trim().min(4).max(16).toUpperCase() });

export const v2OwnerLoginSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(1).max(128)
});

export const v2SessionSchema = z.object({ sessionToken: z.string().min(20).max(4096) });

export const v2ExchangeItemSaveSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(40),
  productId: idSchema,
  pointsCost: z.number().int().min(1).max(1_000_000),
  validDays: z.number().int().min(1).max(3650),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999)
});

export const v2CategorySaveSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(20),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999)
});

export const v2OwnerOrderListSchema = v2SessionSchema.extend({
  status: z.enum(["ALL", "WAITING_FULFILLMENT", "COMPLETED", "CANCELLED", "REFUNDING", "REFUNDED"]).default("ALL"),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50)
});

export const v2OwnerOrderActionSchema = v2SessionSchema.extend({ orderId: idSchema });
export const v2OwnerMemberQuerySchema = v2SessionSchema.extend({ query: z.string().trim().max(60) });

export type V2ProductSaveInput = z.infer<typeof v2ProductSaveSchema>;
export type V2CategorySaveInput = z.infer<typeof v2CategorySaveSchema>;
export type V2StoreConfigSaveInput = z.infer<typeof v2StoreConfigSaveSchema>;
export type V2OrderCreateInput = z.infer<typeof v2OrderCreateSchema>;
export type V2CouponExchangeInput = z.infer<typeof v2CouponExchangeSchema>;
export type V2CouponUseInput = z.infer<typeof v2CouponUseSchema>;
export type V2ExchangeItemSaveInput = z.infer<typeof v2ExchangeItemSaveSchema>;

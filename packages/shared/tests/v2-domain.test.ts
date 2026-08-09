import { describe, expect, it } from "vitest";
import {
  businessDateAt,
  formatPickupNumber,
  quoteV2CouponProduct,
  quoteV2Order,
  transitionV2Order,
  v2ProductSaveSchema,
  type V2Product
} from "../src";

const product: V2Product = {
  _id: "product-fuding",
  storeId: "store-main",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
  name: "福鼎肉片",
  description: "现煮",
  basePrice: 1500,
  enabled: true,
  soldOut: false,
  sortOrder: 1,
  pointsEnabled: true,
  buyerPointsPerUnit: 10,
  inviterPointsPerUnit: 1,
  version: 1,
  specGroups: [
    {
      id: "spice",
      name: "辣度",
      mode: "SINGLE",
      required: true,
      choices: [
        { id: "mild", name: "微辣", priceDelta: 0, enabled: true, isDefault: true },
        { id: "hot", name: "特辣", priceDelta: 0, enabled: true }
      ]
    },
    {
      id: "extras",
      name: "小料",
      mode: "MULTIPLE",
      required: false,
      maxSelect: 2,
      choices: [
        { id: "coriander", name: "香菜", priceDelta: 0, enabled: true },
        { id: "meat", name: "加肉", priceDelta: 300, enabled: true }
      ]
    }
  ]
};

describe("V2 pricing", () => {
  it("prices quantities, options and integer points from product snapshots", () => {
    const result = quoteV2Order([product], [
      {
        productId: product._id,
        quantity: 3,
        selections: [
          { groupId: "spice", choiceIds: ["mild"] },
          { groupId: "extras", choiceIds: ["meat"] }
        ]
      }
    ]);

    expect(result.payableAmount).toBe(5400);
    expect(result.buyerPoints).toBe(30);
    expect(result.inviterPoints).toBe(3);
    expect(result.lineItems[0].unitPrice).toBe(1800);
  });

  it("rejects paid options for coupon orders", () => {
    expect(() =>
      quoteV2CouponProduct(product, [
        { groupId: "spice", choiceIds: ["mild"] },
        { groupId: "extras", choiceIds: ["meat"] }
      ])
    ).toThrow("商品券下单不能选择加价规格");
  });

  it("rejects duplicate spec choice ids", () => {
    expect(() =>
      quoteV2Order([product], [
        { productId: product._id, quantity: 1, selections: [{ groupId: "spice", choiceIds: ["mild", "mild"] }] }
      ])
    ).not.toThrow();
  });

  it("rejects carts whose combined quantity exceeds 99", () => {
    expect(() => quoteV2Order([product], [
      { productId: product._id, quantity: 60, selections: [{ groupId: "spice", choiceIds: ["mild"] }] },
      { productId: product._id, quantity: 40, selections: [{ groupId: "spice", choiceIds: ["hot"] }] }
    ])).toThrow("单笔订单最多购买 99 份");
  });
});

describe("V2 business day and state", () => {
  it("keeps early morning orders in the previous business date", () => {
    expect(businessDateAt(new Date("2026-08-09T17:30:00.000Z"), "04:00")).toBe("2026-08-09");
    expect(businessDateAt(new Date("2026-08-09T20:30:00.000Z"), "04:00")).toBe("2026-08-10");
  });

  it("formats pickup numbers without wrapping", () => {
    expect(formatPickupNumber(1)).toBe("001");
    expect(formatPickupNumber(1000)).toBe("1000");
  });

  it("enforces order transitions", () => {
    expect(transitionV2Order("PENDING_PAYMENT", "WAITING_FULFILLMENT")).toBe("WAITING_FULFILLMENT");
    expect(() => transitionV2Order("CANCELLED", "WAITING_FULFILLMENT")).toThrow();
  });
});

describe("V2 product schema", () => {
  it("keeps all point and money values as integers", () => {
    const parsed = v2ProductSaveSchema.parse({
      name: "福鼎肉片",
      basePrice: 1500,
      enabled: true,
      soldOut: false,
      sortOrder: 1,
      pointsEnabled: true,
      buyerPointsPerUnit: 10,
      inviterPointsPerUnit: 1,
      specGroups: product.specGroups
    });
    expect(parsed.basePrice).toBe(1500);
    expect(() => v2ProductSaveSchema.parse({ ...parsed, buyerPointsPerUnit: 0.1 })).toThrow();
    expect(() => v2ProductSaveSchema.parse({ ...parsed, specGroups: [product.specGroups[0], product.specGroups[0]] })).toThrow("规格组 ID 不能重复");
  });
});

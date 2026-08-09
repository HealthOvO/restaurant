import { DomainError } from "../errors";
import type {
  V2CartLineInput,
  V2OrderLineSnapshot,
  V2OrderQuote,
  V2Product,
  V2SelectedChoiceSnapshot,
  V2SpecGroup
} from "./types";

function requireInteger(value: number, field: string, minimum = 0): number {
  if (!Number.isInteger(value) || value < minimum) {
    throw new DomainError("INVALID_AMOUNT", `${field}必须是大于等于 ${minimum} 的整数`);
  }
  return value;
}

function selectedChoicesForGroup(group: V2SpecGroup, choiceIds: string[], couponMode: boolean): V2SelectedChoiceSnapshot[] {
  const distinctIds = Array.from(new Set(choiceIds));
  const enabledChoices = new Map(group.choices.filter((choice) => choice.enabled).map((choice) => [choice.id, choice]));

  if (group.required && distinctIds.length === 0) {
    throw new DomainError("SPEC_REQUIRED", `请选择${group.name}`);
  }
  if (group.mode === "SINGLE" && distinctIds.length > 1) {
    throw new DomainError("SPEC_LIMIT", `${group.name}只能选择一项`);
  }
  const maxSelect = group.mode === "SINGLE" ? 1 : group.maxSelect ?? group.choices.length;
  if (distinctIds.length > maxSelect) {
    throw new DomainError("SPEC_LIMIT", `${group.name}最多选择 ${maxSelect} 项`);
  }

  return distinctIds.map((choiceId) => {
    const choice = enabledChoices.get(choiceId);
    if (!choice) {
      throw new DomainError("SPEC_UNAVAILABLE", `${group.name}中有不可用选项`);
    }
    const priceDelta = requireInteger(choice.priceDelta, `${group.name}-${choice.name}加价`);
    if (couponMode && priceDelta > 0) {
      throw new DomainError("PAID_SPEC_NOT_ALLOWED", "商品券下单不能选择加价规格");
    }
    return {
      groupId: group.id,
      groupName: group.name,
      choiceId: choice.id,
      choiceName: choice.name,
      priceDelta
    };
  });
}

function priceLine(product: V2Product, input: V2CartLineInput, lineIndex: number, couponMode: boolean): V2OrderLineSnapshot {
  if (!product.enabled || product.soldOut) {
    throw new DomainError("PRODUCT_UNAVAILABLE", `${product.name}当前不可购买`);
  }
  const quantity = requireInteger(input.quantity, "数量", 1);
  if (quantity > 99) {
    throw new DomainError("QUANTITY_LIMIT", "单个商品一次最多购买 99 份");
  }

  const selections = new Map(input.selections.map((selection) => [selection.groupId, selection.choiceIds]));
  if (selections.size !== input.selections.length) {
    throw new DomainError("DUPLICATE_SPEC_GROUP", "同一规格组不能重复提交");
  }

  for (const groupId of selections.keys()) {
    if (!product.specGroups.some((group) => group.id === groupId)) {
      throw new DomainError("SPEC_UNAVAILABLE", "商品规格已经变化，请重新选择");
    }
  }

  const selectedChoices = product.specGroups.flatMap((group) =>
    selectedChoicesForGroup(group, selections.get(group.id) ?? [], couponMode)
  );
  const basePrice = requireInteger(product.basePrice, `${product.name}价格`);
  const optionTotal = selectedChoices.reduce((total, choice) => total + choice.priceDelta, 0);
  const unitPrice = couponMode ? 0 : basePrice + optionTotal;
  const lineTotal = unitPrice * quantity;
  const buyerPointsPerUnit = product.pointsEnabled && !couponMode ? requireInteger(product.buyerPointsPerUnit, "本人积分") : 0;
  const inviterPointsPerUnit = product.pointsEnabled && !couponMode ? requireInteger(product.inviterPointsPerUnit, "邀请积分") : 0;

  return {
    lineId: `line-${lineIndex + 1}`,
    productId: product._id,
    productVersion: product.version,
    productName: product.name,
    imageUrl: product.imageUrl,
    quantity,
    basePrice: couponMode ? 0 : basePrice,
    unitPrice,
    lineTotal,
    buyerPointsPerUnit,
    inviterPointsPerUnit,
    buyerPointsTotal: buyerPointsPerUnit * quantity,
    inviterPointsTotal: inviterPointsPerUnit * quantity,
    selectedChoices,
    note: input.note?.trim() || undefined
  };
}

export function quoteV2Order(products: V2Product[], inputs: V2CartLineInput[]): V2OrderQuote {
  if (inputs.length === 0) {
    throw new DomainError("EMPTY_CART", "请先选择商品");
  }
  const productsById = new Map(products.map((product) => [product._id, product]));
  const lineItems = inputs.map((input, index) => {
    const product = productsById.get(input.productId);
    if (!product) {
      throw new DomainError("PRODUCT_NOT_FOUND", "商品不存在或已删除");
    }
    return priceLine(product, input, index, false);
  });

  return {
    lineItems,
    itemCount: lineItems.reduce((total, item) => total + item.quantity, 0),
    payableAmount: lineItems.reduce((total, item) => total + item.lineTotal, 0),
    buyerPoints: lineItems.reduce((total, item) => total + item.buyerPointsTotal, 0),
    inviterPoints: lineItems.reduce((total, item) => total + item.inviterPointsTotal, 0)
  };
}

export function quoteV2CouponProduct(product: V2Product, selections: V2CartLineInput["selections"]): V2OrderQuote {
  const line = priceLine(product, { productId: product._id, quantity: 1, selections }, 0, true);
  return { lineItems: [line], itemCount: 1, payableAmount: 0, buyerPoints: 0, inviterPoints: 0 };
}

import { DomainError } from "../errors";
import type {
  MenuFulfillmentMode,
  MenuItem,
  MenuItemOptionChoice,
  MenuItemOptionGroup,
  OrderLineItem,
  OrderSelectedOption,
  OrderStatus,
  StoreConfig
} from "../types";

export interface RequestedOrderOption {
  groupId: string;
  choiceId: string;
}

export interface RequestedOrderItem {
  menuItemId: string;
  quantity: number;
  note?: string;
  selectedOptions?: RequestedOrderOption[];
}

export interface OrderPreviewResult {
  itemCount: number;
  subtotalAmount: number;
  payableAmount: number;
  lineItems: OrderLineItem[];
}

export function assertOrderSubmissionReady(input: {
  fulfillmentMode: MenuFulfillmentMode;
  tableNo?: string;
  contactName?: string;
}): void {
  const tableNo = input.tableNo?.trim();
  const contactName = input.contactName?.trim();

  if (input.fulfillmentMode === "DINE_IN" && !tableNo) {
    throw new DomainError("ORDER_TABLE_REQUIRED", "堂食订单请先填写桌号");
  }

  if (input.fulfillmentMode === "PICKUP" && !contactName) {
    throw new DomainError("ORDER_CONTACT_REQUIRED", "自提订单请先填写联系人");
  }
}

function buildLineId(menuItemId: string, selectedOptions: OrderSelectedOption[]): string {
  const optionKey = selectedOptions
    .map((item) => `${item.groupId}:${item.choiceId}`)
    .sort()
    .join("|");
  return optionKey ? `${menuItemId}__${optionKey}` : menuItemId;
}

function sortOptions(groups: MenuItemOptionGroup[], selectedOptions: OrderSelectedOption[]): OrderSelectedOption[] {
  const groupIndex = new Map(groups.map((group, index) => [group._id, index]));
  return selectedOptions
    .slice()
    .sort((left, right) => {
      const leftIndex = groupIndex.get(left.groupId) ?? 0;
      const rightIndex = groupIndex.get(right.groupId) ?? 0;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.choiceName.localeCompare(right.choiceName);
    });
}

function applyDefaultChoices(group: MenuItemOptionGroup, selectedChoices: MenuItemOptionChoice[]): MenuItemOptionChoice[] {
  if (selectedChoices.length > 0) {
    return selectedChoices;
  }

  return group.choices.filter((choice) => choice.isEnabled && choice.isDefault);
}

function resolveSelectedOptions(menuItem: MenuItem, requestedOptions: RequestedOrderOption[]): OrderSelectedOption[] {
  const groups = menuItem.optionGroups ?? [];
  if (groups.length === 0) {
    return [];
  }

  const selectedOptionsByGroup = requestedOptions.reduce<Record<string, string[]>>((result, option) => {
    const choiceIds = (result[option.groupId] ??= []);
    if (!choiceIds.includes(option.choiceId)) {
      choiceIds.push(option.choiceId);
    }
    return result;
  }, {});

  const selectedOptions: OrderSelectedOption[] = [];

  for (const group of groups) {
    const requestedChoiceIds = selectedOptionsByGroup[group._id] ?? [];
    const requestedChoices = requestedChoiceIds.map((choiceId) => {
      const choice = group.choices.find((item) => item._id === choiceId && item.isEnabled);
      if (!choice) {
        throw new DomainError("ORDER_OPTION_INVALID", `菜品「${menuItem.name}」存在无效规格选项`);
      }
      return choice;
    });

    const effectiveChoices = applyDefaultChoices(group, requestedChoices);
    if (group.required && effectiveChoices.length === 0) {
      throw new DomainError("ORDER_OPTION_REQUIRED", `菜品「${menuItem.name}」缺少必选规格`);
    }
    if (!group.multiSelect && effectiveChoices.length > 1) {
      throw new DomainError("ORDER_OPTION_INVALID", `菜品「${menuItem.name}」的规格「${group.name}」只能选择一个`);
    }
    if (group.maxSelect && effectiveChoices.length > group.maxSelect) {
      throw new DomainError("ORDER_OPTION_INVALID", `菜品「${menuItem.name}」的规格「${group.name}」超过可选上限`);
    }

    for (const choice of effectiveChoices) {
      selectedOptions.push({
        groupId: group._id,
        groupName: group.name,
        choiceId: choice._id,
        choiceName: choice.name,
        priceDelta: Number(choice.priceDelta) || 0
      });
    }
  }

  return sortOptions(groups, selectedOptions);
}

export function previewOrder(input: {
  items: RequestedOrderItem[];
  menuItems: MenuItem[];
  storeConfig: Pick<StoreConfig, "dineInEnabled" | "pickupEnabled" | "minOrderAmount">;
  fulfillmentMode: MenuFulfillmentMode;
}): OrderPreviewResult {
  const { items, menuItems, storeConfig, fulfillmentMode } = input;
  if (items.length === 0) {
    throw new DomainError("ORDER_EMPTY", "购物车还是空的，先选几样菜再下单");
  }

  if (fulfillmentMode === "DINE_IN" && !storeConfig.dineInEnabled) {
    throw new DomainError("ORDER_MODE_DISABLED", "当前门店暂不支持堂食下单");
  }
  if (fulfillmentMode === "PICKUP" && !storeConfig.pickupEnabled) {
    throw new DomainError("ORDER_MODE_DISABLED", "当前门店暂不支持自提");
  }

  const menuItemById = new Map(menuItems.map((item) => [item._id, item]));
  const lineItems = items.map((requestedItem) => {
    const menuItem = menuItemById.get(requestedItem.menuItemId);
    if (!menuItem || !menuItem.isEnabled || menuItem.isSoldOut) {
      throw new DomainError("ORDER_MENU_ITEM_INVALID", "购物车里有已下架或已售罄的菜品，请刷新后重试");
    }

    const selectedOptions = resolveSelectedOptions(menuItem, requestedItem.selectedOptions ?? []);
    const basePrice = Number(menuItem.price) || 0;
    const unitPrice = basePrice + selectedOptions.reduce((total, option) => total + option.priceDelta, 0);
    const lineTotal = unitPrice * requestedItem.quantity;

    return {
      lineId: buildLineId(menuItem._id, selectedOptions),
      menuItemId: menuItem._id,
      categoryId: menuItem.categoryId,
      name: menuItem.name,
      imageUrl: menuItem.imageUrl,
      quantity: requestedItem.quantity,
      basePrice,
      unitPrice,
      selectedOptions,
      lineTotal,
      note: requestedItem.note?.trim()
    };
  });

  const itemCount = lineItems.reduce((total, item) => total + item.quantity, 0);
  const subtotalAmount = lineItems.reduce((total, item) => total + item.lineTotal, 0);
  if (subtotalAmount < (Number(storeConfig.minOrderAmount) || 0)) {
    throw new DomainError("ORDER_MIN_AMOUNT", "当前金额还没达到门店起订金额");
  }

  return {
    itemCount,
    subtotalAmount,
    payableAmount: subtotalAmount,
    lineItems
  };
}

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_CONFIRM: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: []
};

export function assertOrderStatusTransition(currentStatus: OrderStatus, nextStatus: OrderStatus): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!ORDER_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new DomainError("ORDER_STATUS_INVALID", "当前订单状态不支持这样流转");
  }
}

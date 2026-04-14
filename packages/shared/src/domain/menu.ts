import { DomainError } from "../errors";
import type { MenuCategory, MenuItem } from "../types";

function sortByOrder<T extends { sortOrder: number; createdAt: string }>(rows: T[]): T[] {
  return rows
    .slice()
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });
}

export function assertMenuConfigValid(categories: MenuCategory[], items: MenuItem[]): void {
  const enabledCategoryIds = new Set(
    categories
      .filter((category) => category.isEnabled)
      .map((category) => category._id)
  );

  if (categories.length === 0) {
    throw new DomainError("MENU_CATEGORY_REQUIRED", "至少需要配置一个菜品分类");
  }

  const seenCategoryNames = new Set<string>();
  for (const category of categories) {
    const name = category.name.trim();
    if (!name) {
      throw new DomainError("MENU_CATEGORY_NAME_REQUIRED", "菜品分类名称不能为空");
    }
    if (seenCategoryNames.has(name)) {
      throw new DomainError("MENU_CATEGORY_DUPLICATED", `菜品分类「${name}」重复`);
    }
    seenCategoryNames.add(name);
  }

  if (items.length === 0) {
    throw new DomainError("MENU_ITEM_REQUIRED", "至少需要配置一个菜品");
  }

  for (const item of items) {
    if (!item.name.trim()) {
      throw new DomainError("MENU_ITEM_NAME_REQUIRED", "菜品名称不能为空");
    }
    if (!categories.find((category) => category._id === item.categoryId)) {
      throw new DomainError("MENU_ITEM_CATEGORY_INVALID", `菜品「${item.name}」缺少有效分类`);
    }
    if (item.price < 0) {
      throw new DomainError("MENU_ITEM_PRICE_INVALID", `菜品「${item.name}」价格不能小于 0`);
    }

    for (const group of item.optionGroups ?? []) {
      if (!group.name.trim()) {
        throw new DomainError("MENU_ITEM_OPTION_GROUP_INVALID", `菜品「${item.name}」存在空规格组名称`);
      }
      if (group.maxSelect && !group.multiSelect && group.maxSelect > 1) {
        throw new DomainError("MENU_ITEM_OPTION_GROUP_INVALID", `菜品「${item.name}」的单选规格不能设置多选上限`);
      }
      if (!group.multiSelect && group.choices.filter((choice) => choice.isEnabled && choice.isDefault).length > 1) {
        throw new DomainError("MENU_ITEM_OPTION_GROUP_INVALID", `菜品「${item.name}」的单选规格只能有一个默认选项`);
      }
      if (group.required && group.choices.filter((choice) => choice.isEnabled).length === 0) {
        throw new DomainError("MENU_ITEM_OPTION_GROUP_INVALID", `菜品「${item.name}」的必选规格没有可用选项`);
      }
      for (const choice of group.choices) {
        if (!choice.name.trim()) {
          throw new DomainError("MENU_ITEM_OPTION_CHOICE_INVALID", `菜品「${item.name}」存在空规格选项`);
        }
        if (choice.priceDelta < 0) {
          throw new DomainError("MENU_ITEM_OPTION_CHOICE_INVALID", `菜品「${item.name}」的规格加价不能小于 0`);
        }
      }
    }
  }

  if (!items.some((item) => item.isEnabled && !item.isSoldOut && enabledCategoryIds.has(item.categoryId))) {
    throw new DomainError("MENU_ITEM_ENABLED_REQUIRED", "至少需要有一个可售菜品");
  }
}

export function buildMenuCatalog(categories: MenuCategory[], items: MenuItem[]) {
  const visibleCategories = sortByOrder(categories).filter((category) => category.isEnabled);
  const visibleCategoryIds = new Set(visibleCategories.map((category) => category._id));
  const visibleItems = sortByOrder(items)
    .filter((item) => item.isEnabled)
    .filter((item) => visibleCategoryIds.has(item.categoryId));

  return {
    categories: visibleCategories,
    items: visibleItems
  };
}

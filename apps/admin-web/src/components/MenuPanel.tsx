import { useEffect, useMemo, useState } from "react";
import {
  assertMenuConfigValid,
  type MenuCategory,
  type MenuItem,
  type MenuItemOptionChoice,
  type MenuItemOptionGroup,
  type StoreConfig
} from "@restaurant/shared";

interface MenuPanelProps {
  storeConfig: StoreConfig;
  categories: MenuCategory[];
  items: MenuItem[];
  saving?: boolean;
  onSave: (payload: {
    storeConfig: StoreConfig;
    categories: MenuCategory[];
    items: MenuItem[];
  }) => Promise<void>;
}

const HERO_TONES = [
  { value: "ember", label: "暖炉红" },
  { value: "wheat", label: "麦穗黄" },
  { value: "jade", label: "青玉绿" },
  { value: "berry", label: "莓果粉" },
  { value: "graphite", label: "石墨灰" }
];

function nowIso() {
  return new Date().toISOString();
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toFixed(0)}`;
}

function normalizeText(value?: string) {
  const next = `${value ?? ""}`.trim();
  return next || undefined;
}

function normalizeTagsInput(value: string) {
  return value
    .split(/[,\n、，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function tagsToInput(tags?: string[]) {
  return (tags ?? []).join("、");
}

function resequence<T extends { sortOrder: number }>(items: T[]) {
  return items.map((item, index) => ({
    ...item,
    sortOrder: index
  }));
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = items.slice();
  const [current] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, current);
  return next;
}

function moveMenuItemWithinCategory(items: MenuItem[], itemId: string, direction: -1 | 1) {
  const currentIndex = items.findIndex((item) => item._id === itemId);
  if (currentIndex < 0) {
    return items;
  }

  const currentCategoryId = items[currentIndex]?.categoryId;
  const siblingIndices = items.reduce<number[]>((result, item, index) => {
    if (item.categoryId === currentCategoryId) {
      result.push(index);
    }
    return result;
  }, []);
  const currentPosition = siblingIndices.indexOf(currentIndex);
  const targetIndex = siblingIndices[currentPosition + direction];

  if (typeof targetIndex !== "number") {
    return items;
  }

  return moveItem(items, currentIndex, targetIndex);
}

function moveMenuItemToCategoryEnd(items: MenuItem[], itemId: string, nextCategoryId: string) {
  const currentIndex = items.findIndex((item) => item._id === itemId);
  if (currentIndex < 0) {
    return items;
  }

  const currentItem = items[currentIndex];
  if (!currentItem) {
    return items;
  }

  const nextItems = items.slice();
  nextItems.splice(currentIndex, 1);

  const insertAfterIndex = nextItems.reduce<number>(
    (lastIndex, item, index) => (item.categoryId === nextCategoryId ? index : lastIndex),
    -1
  );
  const movedItem: MenuItem = {
    ...currentItem,
    categoryId: nextCategoryId
  };

  if (insertAfterIndex < 0) {
    nextItems.push(movedItem);
    return nextItems;
  }

  nextItems.splice(insertAfterIndex + 1, 0, movedItem);
  return nextItems;
}

function removeCategoryAndReassignItems(categories: MenuCategory[], items: MenuItem[], categoryId: string) {
  const currentIndex = categories.findIndex((category) => category._id === categoryId);
  if (currentIndex < 0) {
    return {
      categories,
      items,
      nextSelectedCategoryId: categories[0]?._id ?? ""
    };
  }

  const nextCategories = categories.filter((category) => category._id !== categoryId);
  if (nextCategories.length === 0) {
    return {
      categories,
      items,
      nextSelectedCategoryId: ""
    };
  }

  const fallbackIndex = Math.min(currentIndex, nextCategories.length - 1);
  const nextSelectedCategoryId = nextCategories[fallbackIndex]?._id ?? nextCategories[0]?._id ?? "";
  const nextItems = items.map((item) =>
    item.categoryId === categoryId
      ? {
          ...item,
          categoryId: nextSelectedCategoryId
        }
      : item
  );

  return {
    categories: nextCategories,
    items: nextItems,
    nextSelectedCategoryId
  };
}

function createCategoryDraft(storeId: string, sortOrder: number): MenuCategory {
  const now = nowIso();
  return {
    _id: createLocalId("category"),
    storeId,
    name: "新分类",
    description: "",
    sortOrder,
    isEnabled: true,
    heroTone: "ember",
    createdAt: now,
    updatedAt: now
  };
}

function createOptionChoiceDraft(): MenuItemOptionChoice {
  return {
    _id: createLocalId("choice"),
    name: "新选项",
    priceDelta: 0,
    isEnabled: true,
    isDefault: false
  };
}

function createOptionGroupDraft(): MenuItemOptionGroup {
  return {
    _id: createLocalId("group"),
    name: "新规格组",
    required: false,
    multiSelect: false,
    maxSelect: 1,
    choices: [createOptionChoiceDraft()]
  };
}

function createMenuItemDraft(storeId: string, categoryId: string, sortOrder: number): MenuItem {
  const now = nowIso();
  return {
    _id: createLocalId("item"),
    storeId,
    categoryId,
    name: "新菜品",
    description: "",
    imageUrl: "",
    price: 18,
    isEnabled: true,
    isRecommended: false,
    isSoldOut: false,
    sortOrder,
    tags: [],
    monthlySales: 0,
    optionGroups: [],
    createdAt: now,
    updatedAt: now
  };
}

function buildSnapshot(storeConfig: StoreConfig, categories: MenuCategory[], items: MenuItem[]) {
  return JSON.stringify({
    storeConfig: {
      storeName: storeConfig.storeName,
      storeSubtitle: storeConfig.storeSubtitle,
      announcement: storeConfig.announcement,
      address: storeConfig.address,
      contactPhone: storeConfig.contactPhone,
      businessHoursText: storeConfig.businessHoursText,
      dineInEnabled: storeConfig.dineInEnabled,
      pickupEnabled: storeConfig.pickupEnabled,
      minOrderAmount: Number(storeConfig.minOrderAmount) || 0,
      bannerTitle: storeConfig.bannerTitle,
      bannerSubtitle: storeConfig.bannerSubtitle,
      bannerTags: storeConfig.bannerTags ?? [],
      orderNotice: storeConfig.orderNotice
    },
    categories: resequence(categories).map((category) => ({
      _id: category._id,
      name: category.name,
      description: category.description,
      isEnabled: category.isEnabled,
      heroTone: category.heroTone,
      sortOrder: category.sortOrder
    })),
    items: resequence(items).map((item) => ({
      _id: item._id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      price: Number(item.price) || 0,
      isEnabled: item.isEnabled,
      isRecommended: item.isRecommended,
      isSoldOut: item.isSoldOut,
      sortOrder: item.sortOrder,
      tags: item.tags ?? [],
      monthlySales: Number(item.monthlySales) || 0,
      optionGroups: (item.optionGroups ?? []).map((group) => ({
        _id: group._id,
        name: group.name,
        required: group.required,
        multiSelect: group.multiSelect,
        maxSelect: group.maxSelect,
        choices: group.choices.map((choice) => ({
          _id: choice._id,
          name: choice.name,
          priceDelta: Number(choice.priceDelta) || 0,
          isEnabled: choice.isEnabled,
          isDefault: Boolean(choice.isDefault)
        }))
      }))
    }))
  });
}

export function MenuPanel({ storeConfig, categories, items, saving = false, onSave }: MenuPanelProps) {
  const [draftStoreConfig, setDraftStoreConfig] = useState<StoreConfig>(storeConfig);
  const [draftCategories, setDraftCategories] = useState<MenuCategory[]>(() => resequence(categories));
  const [draftItems, setDraftItems] = useState<MenuItem[]>(() => resequence(items));
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?._id ?? "");
  const [selectedItemId, setSelectedItemId] = useState(items[0]?._id ?? "");
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    setDraftStoreConfig(storeConfig);
    setDraftCategories(resequence(categories));
    setDraftItems(resequence(items));
    setSelectedCategoryId(categories[0]?._id ?? "");
    setSelectedItemId(items[0]?._id ?? "");
    setValidationMessage("");
  }, [storeConfig, categories, items]);

  const orderedCategories = useMemo(() => resequence(draftCategories), [draftCategories]);
  const orderedItems = useMemo(() => resequence(draftItems), [draftItems]);
  const selectedCategory = orderedCategories.find((item) => item._id === selectedCategoryId) ?? orderedCategories[0] ?? null;
  const categoryItems = selectedCategory ? orderedItems.filter((item) => item.categoryId === selectedCategory._id) : [];
  const selectedItem =
    orderedItems.find((item) => item._id === selectedItemId) ??
    categoryItems[0] ??
    orderedItems[0] ??
    null;
  const enabledItemCount = orderedItems.filter((item) => item.isEnabled && !item.isSoldOut).length;
  const recommendedCount = orderedItems.filter((item) => item.isRecommended && item.isEnabled).length;
  const soldOutCount = orderedItems.filter((item) => item.isSoldOut).length;
  const selectedCategoryItemCount = selectedCategory ? orderedItems.filter((item) => item.categoryId === selectedCategory._id).length : 0;
  const hasUnsavedChanges =
    buildSnapshot(draftStoreConfig, orderedCategories, orderedItems) !== buildSnapshot(storeConfig, categories, items);

  function updateStoreConfig(patch: Partial<StoreConfig>) {
    setValidationMessage("");
    setDraftStoreConfig((current) => ({
      ...current,
      ...patch
    }));
  }

  function updateCategories(nextCategories: MenuCategory[]) {
    setValidationMessage("");
    const resequenced = resequence(nextCategories);
    setDraftCategories(resequenced);
    if (!resequenced.some((item) => item._id === selectedCategoryId)) {
      setSelectedCategoryId(resequenced[0]?._id ?? "");
    }
  }

  function updateItems(nextItems: MenuItem[]) {
    setValidationMessage("");
    const resequenced = resequence(nextItems);
    setDraftItems(resequenced);
    if (!resequenced.some((item) => item._id === selectedItemId)) {
      const fallback = resequenced.find((item) => item.categoryId === selectedCategoryId) ?? resequenced[0] ?? null;
      setSelectedItemId(fallback?._id ?? "");
    }
  }

  function updateCategory(categoryId: string, patch: Partial<MenuCategory>) {
    updateCategories(draftCategories.map((item) => (item._id === categoryId ? { ...item, ...patch } : item)));
  }

  function updateMenuItem(itemId: string, patch: Partial<MenuItem>) {
    updateItems(draftItems.map((item) => (item._id === itemId ? { ...item, ...patch } : item)));
  }

  function updateOptionGroup(itemId: string, groupId: string, patch: Partial<MenuItemOptionGroup>) {
    updateItems(
      draftItems.map((item) =>
        item._id === itemId
          ? {
              ...item,
              optionGroups: (item.optionGroups ?? []).map((group) => {
                if (group._id !== groupId) {
                  return group;
                }

                const nextGroup = {
                  ...group,
                  ...patch
                };

                if (patch.multiSelect === false) {
                  let defaultKept = false;
                  nextGroup.choices = nextGroup.choices.map((choice) => {
                    if (!choice.isDefault || defaultKept) {
                      return {
                        ...choice,
                        isDefault: false
                      };
                    }

                    defaultKept = true;
                    return choice;
                  });
                  nextGroup.maxSelect = 1;
                }

                return nextGroup;
              })
            }
          : item
      )
    );
  }

  function updateOptionChoice(
    itemId: string,
    groupId: string,
    choiceId: string,
    patch: Partial<MenuItemOptionChoice>
  ) {
    updateItems(
      draftItems.map((item) => {
        if (item._id !== itemId) {
          return item;
        }

        return {
          ...item,
          optionGroups: (item.optionGroups ?? []).map((group) => {
            if (group._id !== groupId) {
              return group;
            }

            const nextChoices = group.choices.map((choice) => {
              if (choice._id !== choiceId) {
                return patch.isDefault && !group.multiSelect ? { ...choice, isDefault: false } : choice;
              }
              return {
                ...choice,
                ...patch
              };
            });

            return {
              ...group,
              choices: nextChoices
            };
          })
        };
      })
    );
  }

  async function handleSave() {
    try {
      const now = nowIso();
      const preparedStoreConfig: StoreConfig = {
        ...draftStoreConfig,
        storeName: draftStoreConfig.storeName.trim(),
        storeSubtitle: normalizeText(draftStoreConfig.storeSubtitle),
        announcement: normalizeText(draftStoreConfig.announcement),
        address: normalizeText(draftStoreConfig.address),
        contactPhone: normalizeText(draftStoreConfig.contactPhone),
        businessHoursText: normalizeText(draftStoreConfig.businessHoursText),
        minOrderAmount: Math.max(0, Number(draftStoreConfig.minOrderAmount) || 0),
        bannerTitle: normalizeText(draftStoreConfig.bannerTitle),
        bannerSubtitle: normalizeText(draftStoreConfig.bannerSubtitle),
        bannerTags: (draftStoreConfig.bannerTags ?? []).slice(0, 6),
        orderNotice: normalizeText(draftStoreConfig.orderNotice),
        updatedAt: now
      };

      if (!preparedStoreConfig.dineInEnabled && !preparedStoreConfig.pickupEnabled) {
        throw new Error("堂食和自提至少要保留一个。");
      }

      const preparedCategories = resequence(
        orderedCategories.map((category) => ({
          ...category,
          name: category.name.trim(),
          description: normalizeText(category.description),
          heroTone: normalizeText(category.heroTone),
          updatedAt: now
        }))
      );

      const preparedItems = resequence(
        orderedItems.map((item) => ({
          ...item,
          name: item.name.trim(),
          description: normalizeText(item.description),
          imageUrl: normalizeText(item.imageUrl),
          price: Math.max(0, Number(item.price) || 0),
          tags: (item.tags ?? []).slice(0, 6),
          monthlySales: Math.max(0, Number(item.monthlySales) || 0),
          updatedAt: now,
          optionGroups: (item.optionGroups ?? []).map((group) => ({
            ...group,
            name: group.name.trim(),
            maxSelect: group.multiSelect ? Math.max(1, Number(group.maxSelect) || 1) : 1,
            choices: group.choices.map((choice) => ({
              ...choice,
              name: choice.name.trim(),
              priceDelta: Math.max(0, Number(choice.priceDelta) || 0)
            }))
          }))
        }))
      );

      assertMenuConfigValid(preparedCategories, preparedItems);
      setValidationMessage("");
      await onSave({
        storeConfig: preparedStoreConfig,
        categories: preparedCategories,
        items: preparedItems
      });
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : "菜单保存失败，请检查配置");
    }
  }

  return (
    <div className="section-stack">
      <div className="row-card menu-workbench-header">
        <div className="card-title-block">
          <div className="inline-tags">
            <div className="tag tag-navy">点餐菜单</div>
            <div className="tag">门店配置</div>
            <div className="tag">规格可编辑</div>
          </div>
          <h3 className="section-title">点餐菜单工作台</h3>
          <p className="subtle">门店信息、分类、菜品和规格在这一页改完，保存后顾客端和店员端都会同步。</p>
        </div>
        <div className="button-row">
          <div className={`tag ${hasUnsavedChanges ? "tag" : "tag tag-success"}`}>{hasUnsavedChanges ? "有未保存修改" : "已同步"}</div>
          <button className="button button-primary" disabled={saving || !hasUnsavedChanges} type="button" onClick={() => void handleSave()}>
            {saving ? "保存中..." : "保存菜单配置"}
          </button>
        </div>
      </div>

      {validationMessage ? (
        <div className="error" role="alert">
          {validationMessage}
        </div>
      ) : null}

      <div className="metric-grid compact-metric-grid">
        <div className="metric-card compact-metric-card">
          <div className="tag tag-navy">分类数</div>
          <div className="metric-value metric-value-compact">{orderedCategories.length}</div>
          <div className="metric-footnote">顾客端会按分类展示。</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag tag-success">可售菜品</div>
          <div className="metric-value metric-value-compact">{enabledItemCount}</div>
          <div className="metric-footnote">已上架且未售罄。</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag">推荐菜</div>
          <div className="metric-value metric-value-compact">{recommendedCount}</div>
          <div className="metric-footnote">首页可优先露出。</div>
        </div>
        <div className="metric-card compact-metric-card">
          <div className="tag">售罄</div>
          <div className="metric-value metric-value-compact">{soldOutCount}</div>
          <div className="metric-footnote">恢复后顾客端即可再次下单。</div>
        </div>
      </div>

      <div className="split menu-workbench-grid">
        <div className="section-stack">
          <div className="row-card stack">
            <div className="card-title-block">
              <div className="section-eyebrow">门店展示</div>
              <h3 className="section-title">基础信息与点餐开关</h3>
              <p className="subtle">这里控制顾客端首页标题、公告、营业信息和堂食 / 自提开关。</p>
            </div>

            <div className="field-grid">
              <label className="field-label" htmlFor="store-name">
                门店名称
                <input
                  id="store-name"
                  className="field"
                  value={draftStoreConfig.storeName}
                  onChange={(event) => updateStoreConfig({ storeName: event.target.value })}
                />
              </label>

              <label className="field-label" htmlFor="store-subtitle">
                副标题
                <input
                  id="store-subtitle"
                  className="field"
                  placeholder="例如 现点现做，热菜和饮品都能直接下单"
                  value={draftStoreConfig.storeSubtitle ?? ""}
                  onChange={(event) => updateStoreConfig({ storeSubtitle: event.target.value })}
                />
              </label>
            </div>

            <div className="field-grid">
              <label className="field-label" htmlFor="store-hours">
                营业时间
                <input
                  id="store-hours"
                  className="field"
                  placeholder="例如 10:30 - 22:00"
                  value={draftStoreConfig.businessHoursText ?? ""}
                  onChange={(event) => updateStoreConfig({ businessHoursText: event.target.value })}
                />
              </label>

              <label className="field-label" htmlFor="store-phone">
                联系电话
                <input
                  id="store-phone"
                  className="field"
                  placeholder="例如 400-000-0000"
                  value={draftStoreConfig.contactPhone ?? ""}
                  onChange={(event) => updateStoreConfig({ contactPhone: event.target.value })}
                />
              </label>
            </div>

            <label className="field-label" htmlFor="store-address">
              地址 / 到店提示
              <input
                id="store-address"
                className="field"
                placeholder="例如 到店后可直接告诉店员桌号"
                value={draftStoreConfig.address ?? ""}
                onChange={(event) => updateStoreConfig({ address: event.target.value })}
              />
            </label>

            <div className="field-grid">
              <label className="field-label" htmlFor="banner-title">
                首页主标题
                <input
                  id="banner-title"
                  className="field"
                  placeholder="例如 今天吃点热乎的"
                  value={draftStoreConfig.bannerTitle ?? ""}
                  onChange={(event) => updateStoreConfig({ bannerTitle: event.target.value })}
                />
              </label>

              <label className="field-label" htmlFor="banner-subtitle">
                首页副标题
                <input
                  id="banner-subtitle"
                  className="field"
                  placeholder="例如 先下单，再看积分和菜品券到账"
                  value={draftStoreConfig.bannerSubtitle ?? ""}
                  onChange={(event) => updateStoreConfig({ bannerSubtitle: event.target.value })}
                />
              </label>
            </div>

            <div className="field-grid">
              <label className="field-label" htmlFor="banner-tags">
                首页标签
                <input
                  id="banner-tags"
                  className="field"
                  placeholder="用顿号或逗号分隔，例如 现点现做、支持堂食"
                  value={tagsToInput(draftStoreConfig.bannerTags)}
                  onChange={(event) => updateStoreConfig({ bannerTags: normalizeTagsInput(event.target.value) })}
                />
              </label>

              <label className="field-label" htmlFor="store-min-order">
                起订金额
                <input
                  id="store-min-order"
                  className="field"
                  inputMode="decimal"
                  value={`${Number(draftStoreConfig.minOrderAmount) || 0}`}
                  onChange={(event) => updateStoreConfig({ minOrderAmount: Number(event.target.value) || 0 })}
                />
              </label>
            </div>

            <label className="field-label" htmlFor="store-announcement">
              公告
              <textarea
                id="store-announcement"
                className="textarea"
                placeholder="例如 高峰期请留意出餐顺序"
                value={draftStoreConfig.announcement ?? ""}
                onChange={(event) => updateStoreConfig({ announcement: event.target.value })}
              />
            </label>

            <label className="field-label" htmlFor="store-order-notice">
              下单提示
              <textarea
                id="store-order-notice"
                className="textarea"
                placeholder="例如 下单后店员会在小程序里更新状态"
                value={draftStoreConfig.orderNotice ?? ""}
                onChange={(event) => updateStoreConfig({ orderNotice: event.target.value })}
              />
            </label>

            <div className="field-grid">
              <label className="toggle-field">
                <input
                  checked={draftStoreConfig.dineInEnabled}
                  type="checkbox"
                  onChange={(event) => updateStoreConfig({ dineInEnabled: event.target.checked })}
                />
                <span>允许堂食下单</span>
              </label>
              <label className="toggle-field">
                <input
                  checked={draftStoreConfig.pickupEnabled}
                  type="checkbox"
                  onChange={(event) => updateStoreConfig({ pickupEnabled: event.target.checked })}
                />
                <span>允许自提下单</span>
              </label>
            </div>
          </div>
        </div>

        <div className="section-stack">
          <div className="row-card stack">
            <div className="card-header">
              <div className="card-title-block">
                <div className="section-eyebrow">菜单分类</div>
                <h3 className="section-title">分类顺序和展示氛围</h3>
                <p className="subtle">分类决定菜单的浏览结构，也决定首页推荐的组织方式。</p>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  const nextCategory = createCategoryDraft(draftStoreConfig.storeId, draftCategories.length);
                  updateCategories([...draftCategories, nextCategory]);
                  setSelectedCategoryId(nextCategory._id);
                }}
              >
                新增分类
              </button>
            </div>

            <div className="table-like menu-category-list">
              {orderedCategories.map((category, index) => {
                const categoryItemCount = orderedItems.filter((item) => item.categoryId === category._id).length;
                const active = selectedCategory?._id === category._id;
                return (
                  <div
                    key={category._id}
                    className={`menu-category-card ${active ? "menu-category-card-active" : ""}`}
                    onClick={() => {
                      setSelectedCategoryId(category._id);
                      const firstItem = orderedItems.find((item) => item.categoryId === category._id);
                      setSelectedItemId(firstItem?._id ?? "");
                    }}
                  >
                    <div className="menu-category-card-top">
                      <div className="card-title-block">
                        <strong>{category.name || "未命名分类"}</strong>
                        <span className="subtle tiny">{category.description || "还没写分类描述"}</span>
                      </div>
                      <div className="inline-tags">
                        <div className={`tag ${category.isEnabled ? "tag-success" : "tag-navy"}`}>
                          {category.isEnabled ? "启用中" : "已隐藏"}
                        </div>
                        <div className="tag">{categoryItemCount} 道菜</div>
                      </div>
                    </div>

                    {active ? (
                      <div className="stack">
                        <div className="field-grid">
                          <label className="field-label" htmlFor={`category-name-${category._id}`}>
                            分类名称
                            <input
                              id={`category-name-${category._id}`}
                              className="field"
                              value={category.name}
                              onChange={(event) => updateCategory(category._id, { name: event.target.value })}
                            />
                          </label>
                          <label className="field-label" htmlFor={`category-tone-${category._id}`}>
                            色调
                            <select
                              id={`category-tone-${category._id}`}
                              className="field"
                              value={category.heroTone ?? ""}
                              onChange={(event) => updateCategory(category._id, { heroTone: event.target.value })}
                            >
                              {HERO_TONES.map((tone) => (
                                <option key={tone.value} value={tone.value}>
                                  {tone.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <label className="field-label" htmlFor={`category-desc-${category._id}`}>
                          分类描述
                          <input
                            id={`category-desc-${category._id}`}
                            className="field"
                            value={category.description ?? ""}
                            onChange={(event) => updateCategory(category._id, { description: event.target.value })}
                          />
                        </label>

                        <div className="button-row">
                          <button
                            className="button button-secondary"
                            disabled={index === 0}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateCategories(moveItem(orderedCategories, index, index - 1));
                            }}
                          >
                            上移
                          </button>
                          <button
                            className="button button-secondary"
                            disabled={index === orderedCategories.length - 1}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateCategories(moveItem(orderedCategories, index, index + 1));
                            }}
                          >
                            下移
                          </button>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateCategory(category._id, { isEnabled: !category.isEnabled });
                            }}
                          >
                            {category.isEnabled ? "隐藏分类" : "恢复分类"}
                          </button>
                          <button
                            className="button button-danger"
                            disabled={orderedCategories.length === 1}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const nextState = removeCategoryAndReassignItems(orderedCategories, orderedItems, category._id);
                              updateCategories(nextState.categories);
                              updateItems(nextState.items);
                              setSelectedCategoryId(nextState.nextSelectedCategoryId);
                            }}
                          >
                            删除分类
                          </button>
                        </div>
                        {orderedCategories.length > 1 && selectedCategoryItemCount > 0 ? (
                          <p className="subtle tiny">
                            删除后会把这个分类下的 {selectedCategoryItemCount} 道菜转到相邻分类，避免误删整组菜品。
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row-card stack">
            <div className="card-header">
              <div className="card-title-block">
                <div className="section-eyebrow">菜品列表</div>
                <h3 className="section-title">{selectedCategory ? `${selectedCategory.name} 的菜品` : "先创建一个分类"}</h3>
                <p className="subtle">先选分类，再维护菜品顺序、上下架状态和推荐位。</p>
              </div>
              <button
                className="button button-secondary"
                disabled={!selectedCategory}
                type="button"
                onClick={() => {
                  if (!selectedCategory) {
                    return;
                  }
                  const nextItem = createMenuItemDraft(draftStoreConfig.storeId, selectedCategory._id, draftItems.length);
                  updateItems([...draftItems, nextItem]);
                  setSelectedItemId(nextItem._id);
                }}
              >
                新增菜品
              </button>
            </div>

            {selectedCategory ? (
              categoryItems.length > 0 ? (
                <div className="table-like menu-item-list">
                  {categoryItems.map((item, index) => {
                    const active = selectedItem?._id === item._id;
                    return (
                      <div
                        key={item._id}
                        className={`menu-item-card ${active ? "menu-item-card-active" : ""}`}
                        onClick={() => setSelectedItemId(item._id)}
                      >
                        <div className="menu-item-card-top">
                          <div className="card-title-block">
                            <strong>{item.name || "未命名菜品"}</strong>
                            <span className="subtle tiny">{item.description || "还没写菜品描述"}</span>
                          </div>
                          <strong>{formatCurrency(item.price)}</strong>
                        </div>

                        <div className="inline-tags">
                          <div className={`tag ${item.isEnabled ? "tag-success" : "tag-navy"}`}>{item.isEnabled ? "上架中" : "已下架"}</div>
                          {item.isRecommended ? <div className="tag">推荐</div> : null}
                          {item.isSoldOut ? <div className="tag">售罄</div> : null}
                          <div className="tag">{item.optionGroups?.length ?? 0} 个规格组</div>
                        </div>

                        {active ? (
                          <div className="button-row">
                            <button
                              className="button button-secondary"
                              disabled={index === 0}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                updateItems(moveMenuItemWithinCategory(orderedItems, item._id, -1));
                              }}
                            >
                              上移
                            </button>
                            <button
                              className="button button-secondary"
                              disabled={index === categoryItems.length - 1}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                updateItems(moveMenuItemWithinCategory(orderedItems, item._id, 1));
                              }}
                            >
                              下移
                            </button>
                            <button
                              className="button button-danger"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                updateItems(orderedItems.filter((current) => current._id !== item._id));
                              }}
                            >
                              删除菜品
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="tag">当前分类为空</div>
                  <h3 className="section-title">这个分类还没有菜品</h3>
                  <p className="subtle">先新增一道菜，再配置价格、标签和规格。</p>
                </div>
              )
            ) : (
              <div className="empty-state">
                <div className="tag">还没有分类</div>
                <h3 className="section-title">先创建菜单分类</h3>
                <p className="subtle">至少要有一个分类，顾客端才能正常展示菜单。</p>
              </div>
            )}
          </div>

          {selectedItem ? (
            <div className="row-card stack">
              <div className="card-header">
                <div className="card-title-block">
                  <div className="section-eyebrow">菜品编辑</div>
                  <h3 className="section-title">编辑 {selectedItem.name || "当前菜品"}</h3>
                  <p className="subtle">价格、标签、售卖状态和规格都在这里维护。</p>
                </div>
                <div className="inline-tags">
                  <div className={`tag ${selectedItem.isEnabled ? "tag-success" : "tag-navy"}`}>
                    {selectedItem.isEnabled ? "已上架" : "已下架"}
                  </div>
                  <div className="tag">{formatCurrency(selectedItem.price)}</div>
                </div>
              </div>

              <div className="field-grid">
                <label className="field-label" htmlFor={`item-name-${selectedItem._id}`}>
                  菜品名称
                  <input
                    id={`item-name-${selectedItem._id}`}
                    className="field"
                    value={selectedItem.name}
                    onChange={(event) => updateMenuItem(selectedItem._id, { name: event.target.value })}
                  />
                </label>

                <label className="field-label" htmlFor={`item-category-${selectedItem._id}`}>
                  所属分类
                  <select
                    id={`item-category-${selectedItem._id}`}
                    className="field"
                    value={selectedItem.categoryId}
                    onChange={(event) => {
                      const nextCategoryId = event.target.value;
                      updateItems(moveMenuItemToCategoryEnd(orderedItems, selectedItem._id, nextCategoryId));
                      setSelectedCategoryId(nextCategoryId);
                    }}
                  >
                    {orderedCategories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-grid">
                <label className="field-label" htmlFor={`item-price-${selectedItem._id}`}>
                  售价
                  <input
                    id={`item-price-${selectedItem._id}`}
                    className="field"
                    inputMode="decimal"
                    value={`${Number(selectedItem.price) || 0}`}
                    onChange={(event) => updateMenuItem(selectedItem._id, { price: Number(event.target.value) || 0 })}
                  />
                </label>

                <label className="field-label" htmlFor={`item-sales-${selectedItem._id}`}>
                  月售参考
                  <input
                    id={`item-sales-${selectedItem._id}`}
                    className="field"
                    inputMode="numeric"
                    value={`${Number(selectedItem.monthlySales) || 0}`}
                    onChange={(event) => updateMenuItem(selectedItem._id, { monthlySales: Number(event.target.value) || 0 })}
                  />
                </label>
              </div>

              <label className="field-label" htmlFor={`item-desc-${selectedItem._id}`}>
                菜品描述
                <textarea
                  id={`item-desc-${selectedItem._id}`}
                  className="textarea"
                  value={selectedItem.description ?? ""}
                  onChange={(event) => updateMenuItem(selectedItem._id, { description: event.target.value })}
                />
              </label>

              <div className="field-grid">
                <label className="field-label" htmlFor={`item-image-${selectedItem._id}`}>
                  图片链接
                  <input
                    id={`item-image-${selectedItem._id}`}
                    className="field"
                    placeholder="https://..."
                    value={selectedItem.imageUrl ?? ""}
                    onChange={(event) => updateMenuItem(selectedItem._id, { imageUrl: event.target.value })}
                  />
                </label>

                <label className="field-label" htmlFor={`item-tags-${selectedItem._id}`}>
                  标签
                  <input
                    id={`item-tags-${selectedItem._id}`}
                    className="field"
                    placeholder="例如 招牌、热卖、下饭"
                    value={tagsToInput(selectedItem.tags)}
                    onChange={(event) => updateMenuItem(selectedItem._id, { tags: normalizeTagsInput(event.target.value) })}
                  />
                </label>
              </div>

              <div className="field-grid">
                <label className="toggle-field">
                  <input
                    checked={selectedItem.isEnabled}
                    type="checkbox"
                    onChange={(event) => updateMenuItem(selectedItem._id, { isEnabled: event.target.checked })}
                  />
                  <span>上架售卖</span>
                </label>
                <label className="toggle-field">
                  <input
                    checked={selectedItem.isRecommended}
                    type="checkbox"
                    onChange={(event) => updateMenuItem(selectedItem._id, { isRecommended: event.target.checked })}
                  />
                  <span>设为推荐菜</span>
                </label>
                <label className="toggle-field">
                  <input
                    checked={selectedItem.isSoldOut}
                    type="checkbox"
                    onChange={(event) => updateMenuItem(selectedItem._id, { isSoldOut: event.target.checked })}
                  />
                  <span>暂时售罄</span>
                </label>
              </div>

              <div className="menu-options-block">
                <div className="card-header">
                  <div className="card-title-block">
                    <div className="section-eyebrow">菜品规格</div>
                    <h3 className="section-title">加料、分量和口味</h3>
                    <p className="subtle">顾客端下单时会直接按这里的规格生成选项。</p>
                  </div>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      updateMenuItem(selectedItem._id, {
                        optionGroups: [...(selectedItem.optionGroups ?? []), createOptionGroupDraft()]
                      })
                    }
                  >
                    新增规格组
                  </button>
                </div>

                {(selectedItem.optionGroups ?? []).length > 0 ? (
                  <div className="table-like menu-option-group-list">
                    {(selectedItem.optionGroups ?? []).map((group) => (
                      <div className="menu-option-group-card" key={group._id}>
                        <div className="field-grid">
                          <label className="field-label" htmlFor={`group-name-${group._id}`}>
                            规格组名称
                            <input
                              id={`group-name-${group._id}`}
                              className="field"
                              value={group.name}
                              onChange={(event) => updateOptionGroup(selectedItem._id, group._id, { name: event.target.value })}
                            />
                          </label>

                          <label className="field-label" htmlFor={`group-max-${group._id}`}>
                            最多可选
                            <input
                              id={`group-max-${group._id}`}
                              className="field"
                              disabled={!group.multiSelect}
                              inputMode="numeric"
                              value={`${group.multiSelect ? Number(group.maxSelect) || 1 : 1}`}
                              onChange={(event) =>
                                updateOptionGroup(selectedItem._id, group._id, {
                                  maxSelect: Math.max(1, Number(event.target.value) || 1)
                                })
                              }
                            />
                          </label>
                        </div>

                        <div className="field-grid">
                          <label className="toggle-field">
                            <input
                              checked={group.required}
                              type="checkbox"
                              onChange={(event) => updateOptionGroup(selectedItem._id, group._id, { required: event.target.checked })}
                            />
                            <span>必选</span>
                          </label>
                          <label className="toggle-field">
                            <input
                              checked={group.multiSelect}
                              type="checkbox"
                              onChange={(event) =>
                                updateOptionGroup(selectedItem._id, group._id, {
                                  multiSelect: event.target.checked,
                                  maxSelect: event.target.checked ? Math.max(1, Number(group.maxSelect) || 2) : 1
                                })
                              }
                            />
                            <span>允许多选</span>
                          </label>
                        </div>

                        <div className="table-like menu-option-choice-list">
                          {group.choices.map((choice) => (
                            <div className="menu-option-choice-row" key={choice._id}>
                              <input
                                aria-label={`choice-name-${choice._id}`}
                                className="field"
                                value={choice.name}
                                onChange={(event) =>
                                  updateOptionChoice(selectedItem._id, group._id, choice._id, { name: event.target.value })
                                }
                              />
                              <input
                                aria-label={`choice-price-${choice._id}`}
                                className="field"
                                inputMode="decimal"
                                value={`${Number(choice.priceDelta) || 0}`}
                                onChange={(event) =>
                                  updateOptionChoice(selectedItem._id, group._id, choice._id, {
                                    priceDelta: Math.max(0, Number(event.target.value) || 0)
                                  })
                                }
                              />
                              <label className="toggle-field compact-toggle">
                                <input
                                  checked={choice.isEnabled}
                                  type="checkbox"
                                  onChange={(event) =>
                                    updateOptionChoice(selectedItem._id, group._id, choice._id, { isEnabled: event.target.checked })
                                  }
                                />
                                <span>启用</span>
                              </label>
                              <label className="toggle-field compact-toggle">
                                <input
                                  checked={Boolean(choice.isDefault)}
                                  type="checkbox"
                                  onChange={(event) =>
                                    updateOptionChoice(selectedItem._id, group._id, choice._id, { isDefault: event.target.checked })
                                  }
                                />
                                <span>默认</span>
                              </label>
                              <button
                                className="button button-danger"
                                disabled={group.choices.length === 1}
                                type="button"
                                onClick={() =>
                                  updateOptionGroup(selectedItem._id, group._id, {
                                    choices: group.choices.filter((current) => current._id !== choice._id)
                                  })
                                }
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="subtle tiny">每个规格组至少保留 1 个选项，避免顾客端出现空规格。</p>

                        <div className="button-row">
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() =>
                              updateOptionGroup(selectedItem._id, group._id, {
                                choices: [...group.choices, createOptionChoiceDraft()]
                              })
                            }
                          >
                            新增选项
                          </button>
                          <button
                            className="button button-danger"
                            type="button"
                            onClick={() =>
                              updateMenuItem(selectedItem._id, {
                                optionGroups: (selectedItem.optionGroups ?? []).filter((current) => current._id !== group._id)
                              })
                            }
                          >
                            删除规格组
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state menu-options-empty">
                    <div className="tag">当前没有规格</div>
                    <p className="subtle">如果这道菜有分量、口味或加料，就新增一个规格组。</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

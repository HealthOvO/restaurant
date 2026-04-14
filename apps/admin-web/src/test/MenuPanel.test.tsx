import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuCategory, MenuItem, StoreConfig } from "@restaurant/shared";
import { MenuPanel } from "../components/MenuPanel";

const storeConfig: StoreConfig = {
  _id: "store-config-1",
  storeId: "default-store",
  storeName: "山野食堂",
  storeSubtitle: "现点现做",
  dineInEnabled: true,
  pickupEnabled: true,
  minOrderAmount: 0,
  bannerTags: ["现点现做"],
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z"
};

const categories: MenuCategory[] = [
  {
    _id: "category-1",
    storeId: "default-store",
    name: "招牌热菜",
    description: "主推热菜",
    sortOrder: 0,
    isEnabled: true,
    heroTone: "ember",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z"
  }
];

const items: MenuItem[] = [
  {
    _id: "item-1",
    storeId: "default-store",
    categoryId: "category-1",
    name: "精品肥牛",
    description: "招牌菜",
    price: 32,
    isEnabled: true,
    isRecommended: true,
    isSoldOut: false,
    sortOrder: 0,
    tags: ["招牌"],
    monthlySales: 128,
    optionGroups: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z"
  }
];

describe("MenuPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("saves updated store and menu payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<MenuPanel categories={categories} items={items} onSave={onSave} saving={false} storeConfig={storeConfig} />);

    fireEvent.change(screen.getByLabelText("门店名称"), {
      target: { value: "山野食堂旗舰店" }
    });
    fireEvent.change(screen.getByLabelText("售价"), {
      target: { value: "36" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存菜单配置" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        storeConfig: expect.objectContaining({
          storeName: "山野食堂旗舰店"
        }),
        categories: [expect.objectContaining({ name: "招牌热菜" })],
        items: [
          expect.objectContaining({
            _id: "item-1",
            price: 36
          })
        ]
      })
    );
  });

  it("moves items within the current category instead of crossing categories", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const categoryRows: MenuCategory[] = [
      categories[0],
      {
        _id: "category-2",
        storeId: "default-store",
        name: "清爽饮品",
        description: "饮品",
        sortOrder: 1,
        isEnabled: true,
        heroTone: "jade",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      }
    ];
    const menuRows: MenuItem[] = [
      {
        ...items[0],
        _id: "item-a1",
        name: "A1 肥牛",
        categoryId: "category-1",
        sortOrder: 0
      },
      {
        ...items[0],
        _id: "item-b1",
        name: "B1 柠檬茶",
        categoryId: "category-2",
        sortOrder: 1
      },
      {
        ...items[0],
        _id: "item-a2",
        name: "A2 鸡块",
        categoryId: "category-1",
        sortOrder: 2
      }
    ];

    const { container } = render(
      <MenuPanel categories={categoryRows} items={menuRows} onSave={onSave} saving={false} storeConfig={storeConfig} />
    );

    fireEvent.click(screen.getByText("A2 鸡块"));
    const activeItemCard = screen.getByText("A2 鸡块").closest(".menu-item-card");
    expect(activeItemCard).toBeTruthy();
    fireEvent.click(within(activeItemCard as HTMLElement).getByRole("button", { name: "上移" }));

    const names = Array.from(container.querySelectorAll(".menu-item-list .menu-item-card .card-title-block strong")).map(
      (node) => node.textContent?.trim()
    );
    expect(names.slice(0, 2)).toEqual(["A2 鸡块", "A1 肥牛"]);
  });

  it("reassigns dishes to the adjacent category when deleting a category", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const categoryRows: MenuCategory[] = [
      categories[0],
      {
        _id: "category-2",
        storeId: "default-store",
        name: "清爽饮品",
        description: "饮品",
        sortOrder: 1,
        isEnabled: true,
        heroTone: "jade",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      }
    ];

    render(<MenuPanel categories={categoryRows} items={items} onSave={onSave} saving={false} storeConfig={storeConfig} />);

    expect(screen.getByText("删除后会把这个分类下的 1 道菜转到相邻分类，避免误删整组菜品。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除分类" }));
    fireEvent.click(screen.getByRole("button", { name: "保存菜单配置" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: [expect.objectContaining({ _id: "category-2" })],
        items: [expect.objectContaining({ _id: "item-1", categoryId: "category-2" })]
      })
    );
  });

  it("keeps at least one option choice in each specification group", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MenuPanel
        categories={categories}
        items={[
          {
            ...items[0],
            optionGroups: [
              {
                _id: "group-1",
                name: "分量",
                required: true,
                multiSelect: false,
                maxSelect: 1,
                choices: [
                  {
                    _id: "choice-1",
                    name: "标准",
                    priceDelta: 0,
                    isEnabled: true,
                    isDefault: true
                  }
                ]
              }
            ]
          }
        ]}
        onSave={onSave}
        saving={false}
        storeConfig={storeConfig}
      />
    );

    expect(screen.getByText("每个规格组至少保留 1 个选项，避免顾客端出现空规格。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  });
});

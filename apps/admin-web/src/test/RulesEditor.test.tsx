import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RulesEditor } from "../components/RulesEditor";
import type { PointExchangeItem, RewardRule } from "@restaurant/shared";

const inviteRule: RewardRule = {
  _id: "rule-1",
  storeId: "default-store",
  name: "邀请1人得积分",
  type: "INVITE_MILESTONE",
  threshold: 1,
  rewardMode: "ONCE",
  pointsReward: 10,
  isEnabled: true,
  sortOrder: 0,
  createdAt: "2026-04-02T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z"
};

const welcomeRule: RewardRule = {
  _id: "welcome-1",
  storeId: "default-store",
  name: "新客首单礼",
  type: "WELCOME",
  isEnabled: true,
  sortOrder: 0,
  voucherTemplate: {
    dishId: "welcome-1",
    dishName: "酸梅汤",
    validDays: 30
  },
  createdAt: "2026-04-02T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z"
};

const exchangeItem: PointExchangeItem = {
  _id: "exchange-1",
  storeId: "default-store",
  name: "积分兑饮品",
  pointsCost: 20,
  isEnabled: true,
  sortOrder: 0,
  voucherTemplate: {
    dishId: "dish-1",
    dishName: "柠檬茶",
    validDays: 30
  },
  createdAt: "2026-04-02T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z"
};

describe("RulesEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits an invite rule and submits updated payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RulesEditor initialRules={[inviteRule]} initialExchangeItems={[]} saving={false} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("rule-points-rule-1"), {
      target: { value: "18" }
    });
    fireEvent.change(screen.getByLabelText("rule-mode-rule-1"), {
      target: { value: "REPEATABLE" }
    });
    fireEvent.click(screen.getAllByText("保存全部配置")[0]);

    expect(onSave).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          rewardMode: "REPEATABLE",
          pointsReward: 18
        })
      ],
      []
    );
  });

  it("adds a new milestone rule from an empty state", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RulesEditor initialRules={[]} initialExchangeItems={[]} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("新增邀请积分"));
    fireEvent.click(screen.getAllByText("保存全部配置")[0]);

    expect(onSave).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: "INVITE_MILESTONE",
          rewardMode: "ONCE",
          threshold: 1,
          pointsReward: 10
        })
      ],
      []
    );
  });

  it("supports adding an exchange item and saving it", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RulesEditor initialRules={[]} initialExchangeItems={[]} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("新增兑换菜品"));
    fireEvent.change(screen.getByLabelText(/exchange-points-/), {
      target: { value: "45" }
    });
    fireEvent.click(screen.getAllByText("保存全部配置")[0]);

    expect(onSave).toHaveBeenCalledWith([], [
      expect.objectContaining({
        pointsCost: 45
      })
    ]);
  });

  it("shows local validation feedback when multiple welcome rules are enabled", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RulesEditor initialRules={[welcomeRule]} initialExchangeItems={[]} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByText("新增首单礼"));
    fireEvent.click(screen.getAllByText("保存全部配置")[0]);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("新客礼最多只能启用 1 条规则");
  });

  it("moves milestone rules and keeps the new order on save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RulesEditor
        initialRules={[
          welcomeRule,
          inviteRule,
          {
            ...inviteRule,
            _id: "rule-2",
            name: "邀请3人得积分",
            threshold: 3,
            pointsReward: 30,
            sortOrder: 1
          }
        ]}
        initialExchangeItems={[]}
        saving={false}
        onSave={onSave}
      />
    );

    const enabledMoveUpButton = screen
      .getAllByRole("button", { name: "上移一位" })
      .find((button) => !button.hasAttribute("disabled"));
    expect(enabledMoveUpButton).toBeTruthy();
    fireEvent.click(enabledMoveUpButton!);
    fireEvent.click(screen.getAllByText("保存全部配置")[0]);

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          _id: "rule-2",
          sortOrder: 0
        }),
        expect.objectContaining({
          _id: "rule-1",
          sortOrder: 1
        })
      ]),
      []
    );
  });

  it("keeps two visible save areas", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RulesEditor initialRules={[inviteRule]} initialExchangeItems={[exchangeItem]} saving={false} onSave={onSave} />
    );

    expect(screen.getAllByRole("button", { name: "保存全部配置" })).toHaveLength(2);
  });
});

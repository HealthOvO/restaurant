import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuditPanel } from "../components/AuditPanel";

describe("AuditPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("translates current backend action names into readable Chinese labels", () => {
    render(
      <AuditPanel
        logs={[
          {
            _id: "audit-1",
            storeId: "default-store",
            actorId: "staff-owner-1",
            actorType: "OWNER",
            action: "SAVE_RULES",
            targetCollection: "reward_rules",
            targetId: "bulk",
            summary: "更新 4 条奖励规则",
            createdAt: "2026-04-05T09:00:00.000Z",
            updatedAt: "2026-04-05T09:00:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByText("保存奖励规则")).toBeInTheDocument();
    expect(screen.getAllByText("奖励规则").length).toBeGreaterThan(0);
  });

  it("filters logs locally and expands payload details", async () => {
    render(
      <AuditPanel
        logs={[
          {
            _id: "audit-1",
            storeId: "default-store",
            actorId: "staff-owner-1",
            actorType: "OWNER",
            action: "SAVE_RULES",
            targetCollection: "reward_rules",
            targetId: "bulk",
            summary: "更新 4 条奖励规则",
            payload: {
              updatedIds: ["rule-1", "rule-2"]
            },
            createdAt: "2026-04-05T09:00:00.000Z",
            updatedAt: "2026-04-05T09:00:00.000Z"
          },
          {
            _id: "audit-2",
            storeId: "default-store",
            actorId: "staff-1",
            actorType: "STAFF",
            action: "REDEEM_VOUCHER",
            targetCollection: "dish_vouchers",
            targetId: "voucher-1",
            summary: "核销 1 张菜品券",
            createdAt: "2026-04-05T10:00:00.000Z",
            updatedAt: "2026-04-05T10:00:00.000Z"
          }
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("操作人"), {
      target: { value: "OWNER" }
    });
    expect(screen.getByText("当前显示 1 / 2")).toBeInTheDocument();
    expect(screen.queryByText("核销 1 张菜品券")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看变更详情" }));
    expect(screen.getByText(/"updatedIds"/)).toBeInTheDocument();
  });
});

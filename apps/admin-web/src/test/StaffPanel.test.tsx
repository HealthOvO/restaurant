import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffPanel } from "../components/StaffPanel";

describe("StaffPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("supports owner password update and staff password reset without exposing full miniOpenId", () => {
    const onUpdatePassword = vi.fn().mockResolvedValue(undefined);
    render(
      <StaffPanel
        currentStaffId="owner-1"
        staffUsers={[
          {
            _id: "owner-1",
            storeId: "default-store",
            username: "owner",
            displayName: "老板",
            role: "OWNER",
            isEnabled: true,
            miniOpenId: "owner-openid-12345678",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          },
          {
            _id: "staff-1",
            storeId: "default-store",
            username: "cashier01",
            displayName: "前台小王",
            role: "STAFF",
            isEnabled: true,
            miniOpenId: "staff-openid-87654321",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          }
        ]}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onUpdatePassword={onUpdatePassword}
      />
    );

    expect(screen.getByText("新增店员账号")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "老板" })).not.toBeInTheDocument();
    expect(screen.getByText(/建议定期更新网页登录密码/)).toBeInTheDocument();
    expect(screen.getByText("停用账号")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("请输入新的后台密码")).toHaveValue("");
    expect(screen.getByPlaceholderText("请输入新的临时密码")).toHaveValue("");
    expect(screen.getAllByText(/^\w{4}\*{4}\w{4}$/).length).toBeGreaterThan(0);
    expect(screen.queryByText("owner-openid-12345678")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("请输入新的后台密码"), {
      target: { value: "new-owner-pass" }
    });
    fireEvent.click(screen.getByText("更新主账号密码"));

    fireEvent.change(screen.getByPlaceholderText("请输入新的临时密码"), {
      target: { value: "temp-staff-pass" }
    });
    fireEvent.click(screen.getByText("重置密码"));

    expect(onUpdatePassword).toHaveBeenCalledTimes(2);
  });

  it("shows pending states while creating or updating staff accounts", () => {
    render(
      <StaffPanel
        creating
        currentStaffId="owner-1"
        passwordUpdatingStaffId="staff-1"
        staffUsers={[
          {
            _id: "owner-1",
            storeId: "default-store",
            username: "owner",
            displayName: "老板",
            role: "OWNER",
            isEnabled: true,
            miniOpenId: "owner-openid-12345678",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          },
          {
            _id: "staff-1",
            storeId: "default-store",
            username: "cashier01",
            displayName: "前台小王",
            role: "STAFF",
            isEnabled: true,
            miniOpenId: "staff-openid-87654321",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          }
        ]}
        togglingStaffId="staff-1"
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onUpdatePassword={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole("button", { name: "创建中..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重置中..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "提交中..." })).toBeDisabled();
  });

  it("validates username and password before creating or resetting accounts", () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onUpdatePassword = vi.fn().mockResolvedValue(undefined);

    render(
      <StaffPanel
        currentStaffId="owner-1"
        staffUsers={[
          {
            _id: "owner-1",
            storeId: "default-store",
            username: "owner",
            displayName: "老板",
            role: "OWNER",
            isEnabled: true,
            miniOpenId: "owner-openid-12345678",
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          },
          {
            _id: "staff-1",
            storeId: "default-store",
            username: "cashier01",
            displayName: "前台小王",
            role: "STAFF",
            isEnabled: true,
            createdAt: "2026-04-02T08:00:00.000Z",
            updatedAt: "2026-04-02T08:00:00.000Z"
          }
        ]}
        onCreate={onCreate}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onUpdatePassword={onUpdatePassword}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("例如 cashier01"), {
      target: { value: "ab" }
    });
    fireEvent.change(screen.getByPlaceholderText("请输入临时密码"), {
      target: { value: "1234567" }
    });
    fireEvent.change(screen.getByPlaceholderText("例如 前台小王"), {
      target: { value: "前台小王" }
    });

    expect(screen.getByRole("alert")).toHaveTextContent("账号仅支持字母、数字、-、_，长度 4-32 位。");
    expect(screen.getByRole("button", { name: "创建账号" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("请输入新的后台密码"), {
      target: { value: "1234567" }
    });
    expect(screen.getAllByRole("alert")[1]).toHaveTextContent("密码至少 8 位。");
    expect(screen.getByRole("button", { name: "更新主账号密码" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("请输入新的临时密码"), {
      target: { value: "1234567" }
    });
    expect(screen.getAllByRole("alert")[2]).toHaveTextContent("密码至少 8 位。");
    expect(screen.getByRole("button", { name: "重置密码" })).toBeDisabled();

    expect(onCreate).not.toHaveBeenCalled();
    expect(onUpdatePassword).not.toHaveBeenCalled();
  });
});

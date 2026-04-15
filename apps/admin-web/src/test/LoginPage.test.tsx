import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../pages/LoginPage";

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits the owner login form with trimmed store scope", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);

    render(
      <LoginPage
        loginLoading={false}
        bootstrapLoading={false}
        loginErrorMessage=""
        bootstrapErrorMessage=""
        noticeMessage=""
        onLogin={onLogin}
        onBootstrap={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("例如 default-store"), {
      target: { value: " branch-01 " }
    });
    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: " owner-branch " }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "owner-pass-01" }
    });

    fireEvent.submit(screen.getByRole("button", { name: "进入后台" }).closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("owner-branch", "owner-pass-01", "branch-01");
    });
  });

  it("submits bootstrap data for a headquarters owner", async () => {
    const onBootstrap = vi.fn().mockResolvedValue(undefined);

    render(
      <LoginPage
        loginLoading={false}
        bootstrapLoading={false}
        loginErrorMessage=""
        bootstrapErrorMessage=""
        noticeMessage=""
        onLogin={vi.fn()}
        onBootstrap={onBootstrap}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "首次初始化" }));
    fireEvent.click(screen.getByRole("button", { name: "展开高级设置" }));

    fireEvent.change(screen.getByPlaceholderText("例如 default-store"), {
      target: { value: "hq-store" }
    });
    fireEvent.change(screen.getByLabelText("初始化口令"), {
      target: { value: "bootstrap-secret-01" }
    });
    fireEvent.change(screen.getByLabelText("老板账号"), {
      target: { value: "owner-hq" }
    });
    fireEvent.change(screen.getByLabelText("显示名称"), {
      target: { value: "总店老板" }
    });
    fireEvent.change(screen.getByLabelText("老板密码"), {
      target: { value: "owner-pass-01" }
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "owner-pass-01" }
    });
    fireEvent.change(screen.getByLabelText("权限范围"), {
      target: { value: "ALL_STORES" }
    });
    fireEvent.change(screen.getByPlaceholderText("branch-01, branch-02"), {
      target: { value: "branch-01, branch-02 branch-03" }
    });

    fireEvent.submit(screen.getByRole("button", { name: "创建老板账号" }).closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(onBootstrap).toHaveBeenCalledWith({
        storeId: "hq-store",
        secret: "bootstrap-secret-01",
        ownerUsername: "owner-hq",
        ownerPassword: "owner-pass-01",
        ownerDisplayName: "总店老板",
        accessScope: "ALL_STORES",
        managedStoreIds: ["branch-01", "branch-02", "branch-03"]
      });
    });
  });

  it("keeps advanced bootstrap settings collapsed by default", () => {
    render(
      <LoginPage
        loginLoading={false}
        bootstrapLoading={false}
        loginErrorMessage=""
        bootstrapErrorMessage=""
        noticeMessage=""
        onLogin={vi.fn()}
        onBootstrap={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "首次初始化" }));

    expect(screen.queryByLabelText("权限范围")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开高级设置" })).toBeInTheDocument();
  });

  it("clears bootstrap validation errors when the user edits the invalid field", async () => {
    render(
      <LoginPage
        loginLoading={false}
        bootstrapLoading={false}
        loginErrorMessage=""
        bootstrapErrorMessage=""
        noticeMessage=""
        onLogin={vi.fn()}
        onBootstrap={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "首次初始化" }));

    fireEvent.change(screen.getByLabelText("初始化口令"), {
      target: { value: "bootstrap-secret-01" }
    });
    fireEvent.change(screen.getByLabelText("老板账号"), {
      target: { value: "owner-hq" }
    });
    fireEvent.change(screen.getByLabelText("老板密码"), {
      target: { value: "owner-pass-01" }
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "wrong-pass-01" }
    });

    fireEvent.submit(screen.getByRole("button", { name: "创建老板账号" }).closest("form") as HTMLFormElement);

    expect(screen.getByRole("alert")).toHaveTextContent("两次输入的密码不一致");

    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "owner-pass-01" }
    });

    expect(screen.queryByText("两次输入的密码不一致")).not.toBeInTheDocument();
  });

  it("clears local bootstrap errors after switching tabs", async () => {
    render(
      <LoginPage
        loginLoading={false}
        bootstrapLoading={false}
        loginErrorMessage=""
        bootstrapErrorMessage=""
        noticeMessage=""
        onLogin={vi.fn()}
        onBootstrap={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "首次初始化" }));
    fireEvent.submit(screen.getByRole("button", { name: "创建老板账号" }).closest("form") as HTMLFormElement);

    expect(screen.getByRole("alert")).toHaveTextContent("请输入初始化口令");

    fireEvent.click(screen.getByRole("tab", { name: "登录" }));
    fireEvent.click(screen.getByRole("tab", { name: "首次初始化" }));

    expect(screen.queryByText("请输入初始化口令")).not.toBeInTheDocument();
  });
});

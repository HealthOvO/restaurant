import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const loginMock = vi.fn();
const bootstrapStoreOwnerMock = vi.fn();

vi.mock("../lib/api", () => ({
  login: (...args: unknown[]) => loginMock(...args),
  bootstrapStoreOwner: (...args: unknown[]) => bootstrapStoreOwnerMock(...args)
}));

vi.mock("../pages/LoginPage", () => ({
  LoginPage: (props: {
    loginErrorMessage: string;
    bootstrapErrorMessage: string;
    noticeMessage: string;
    onBootstrap: (payload: {
      storeId: string;
      secret: string;
      ownerUsername: string;
      ownerPassword: string;
    }) => Promise<void>;
  }) => (
    <div>
      <div>mock-login-page</div>
      <div data-testid="login-error">{props.loginErrorMessage}</div>
      <div data-testid="bootstrap-error">{props.bootstrapErrorMessage}</div>
      <div data-testid="notice">{props.noticeMessage}</div>
      <button
        type="button"
        onClick={() =>
          props.onBootstrap({
            storeId: "default-store",
            secret: "bootstrap-secret",
            ownerUsername: "owner",
            ownerPassword: "owner-pass-01"
          })
        }
      >
        run-bootstrap
      </button>
    </div>
  )
}));

vi.mock("../pages/DashboardPage", () => ({
  DashboardPage: () => <div>mock-dashboard-page</div>
}));

describe("App guard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    loginMock.mockReset();
    bootstrapStoreOwnerMock.mockReset();
  });

  it("shows login page when no session exists", () => {
    render(<App />);
    expect(screen.getByText("mock-login-page")).toBeInTheDocument();
  });

  it("shows dashboard when session exists", () => {
    window.localStorage.setItem(
      "restaurant-admin-session",
      JSON.stringify({
        sessionToken: "token",
        staff: {
          _id: "staff-1",
          displayName: "老板",
          role: "OWNER",
          username: "owner"
        }
      })
    );

    render(<App />);
    expect(screen.getByText("mock-dashboard-page")).toBeInTheDocument();
  });

  it("keeps the user on login and shows a manual-login notice when bootstrap succeeds but auto-login fails", async () => {
    bootstrapStoreOwnerMock.mockResolvedValue({ created: true });
    loginMock.mockRejectedValue(new Error("自动登录失败"));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "run-bootstrap" }));

    await waitFor(() => {
      expect(bootstrapStoreOwnerMock).toHaveBeenCalledWith({
        storeId: "default-store",
        secret: "bootstrap-secret",
        ownerUsername: "owner",
        ownerPassword: "owner-pass-01"
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("notice")).toHaveTextContent("老板账号已创建，请手动登录。");
      expect(screen.getByTestId("login-error")).toHaveTextContent("自动登录失败");
      expect(screen.getByText("mock-login-page")).toBeInTheDocument();
    });
  });
});

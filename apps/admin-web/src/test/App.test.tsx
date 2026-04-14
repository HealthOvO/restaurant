import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

vi.mock("../pages/LoginPage", () => ({
  LoginPage: () => <div>mock-login-page</div>
}));

vi.mock("../pages/DashboardPage", () => ({
  DashboardPage: () => <div>mock-dashboard-page</div>
}));

describe("App guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
});

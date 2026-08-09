import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

vi.stubEnv("VITE_API_MODE", "mock");

describe("merchant V2 app", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.location.hash = "";
  });

  it("logs in with the only owner account and opens today's dashboard", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "欢迎回来" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入后台" }));
    expect(await screen.findByRole("heading", { name: "今天的生意" })).toBeInTheDocument();
    expect(screen.getByText("支付金额")).toBeInTheDocument();
    expect(screen.queryByText(/员工/)).not.toBeInTheDocument();
  });

  it("completes a waiting order through an explicit confirmation", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "进入后台" }));
    fireEvent.click(await screen.findByRole("link", { name: "订单" }));
    const completeButtons = await screen.findAllByRole("button", { name: /完成出餐/ });
    fireEvent.click(completeButtons[0]);
    const dialog = screen.getByRole("dialog", { name: "完成这笔订单？" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "完成出餐" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("已完成出餐")).toBeInTheDocument();
  });

  it("edits product points and keeps them as integers", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "进入后台" }));
    fireEvent.click(await screen.findByRole("link", { name: "商品" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "编辑" }))[0]);
    const points = screen.getByLabelText("顾客每份积分") as HTMLInputElement;
    fireEvent.change(points, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "保存商品" }));
    expect(await screen.findByText("商品已保存")).toBeInTheDocument();
    expect(await screen.findByText("顾客 +12/份")).toBeInTheDocument();
  });
});

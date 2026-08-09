import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { NEW_ORDER_CHIME } from "../lib/new-order-alert";
import { clearResourceCache } from "../lib/resource-cache";
import { resetMockMerchantApi } from "../mocks/mockApi";

vi.stubEnv("VITE_API_MODE", "mock");

describe("merchant V2 app", () => {
  beforeEach(() => {
    resetMockMerchantApi();
    window.sessionStorage.clear();
    window.localStorage.clear();
    clearResourceCache();
    window.location.hash = "";
  });

  it("logs in with the only owner account and opens today's dashboard", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "老板登录" })).toBeInTheDocument();
    expect(screen.getByText("雄飞肉片")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByRole("heading", { name: "今天的生意" })).toBeInTheDocument();
    expect(screen.getByText("支付金额")).toBeInTheDocument();
    expect(screen.queryByText(/员工/)).not.toBeInTheDocument();
  });

  it("completes a waiting order through an explicit confirmation", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "商品" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "编辑" }))[0]);
    const points = screen.getByLabelText("顾客每份积分") as HTMLInputElement;
    fireEvent.change(points, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "保存商品" }));
    expect(await screen.findByText("商品已保存")).toBeInTheDocument();
    expect(await screen.findByText("顾客 +12/份")).toBeInTheDocument();
  });

  it("keeps the new-order sound choice after the page is reopened", async () => {
    const first = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "订单" }));
    fireEvent.click(await screen.findByRole("button", { name: "打开新单提醒" }));
    expect(screen.getByRole("button", { name: "新单提醒已开启" })).toBeInTheDocument();

    first.unmount();
    window.location.hash = "#/orders";
    render(<App />);
    expect(await screen.findByRole("button", { name: "新单提醒已开启" })).toBeInTheDocument();
  });

  it("keeps the order page stable on filter switches and always shows the oldest order first", async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "订单" }));
    await screen.findByText("102");
    const waitingCards = container.querySelectorAll(".order-card");
    expect(waitingCards[0]).toHaveTextContent("102");
    expect(waitingCards[1]).toHaveTextContent("103");

    fireEvent.click(screen.getByRole("tab", { name: "全部" }));
    await waitFor(() => expect(container.querySelectorAll(".order-card")).toHaveLength(3));
    const allCards = container.querySelectorAll(".order-card");
    expect(allCards[0]).toHaveTextContent("101");
    expect(allCards[1]).toHaveTextContent("102");
    expect(allCards[2]).toHaveTextContent("103");
    expect(screen.getByText("最早优先")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "已完成" }));
    expect(screen.getByRole("heading", { name: "订单" })).toBeInTheDocument();
    expect(screen.queryByText("正在同步订单")).not.toBeInTheDocument();
    expect(await screen.findByText("101")).toBeInTheDocument();
  });

  it("uses a repeated chime instead of a single short beep", () => {
    expect(NEW_ORDER_CHIME).toHaveLength(6);
    const last = NEW_ORDER_CHIME[NEW_ORDER_CHIME.length - 1];
    expect(last.offset + last.duration).toBeGreaterThan(1.5);
  });
});

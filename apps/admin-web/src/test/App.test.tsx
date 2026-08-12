import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { NEW_ORDER_CHIME } from "../lib/new-order-alert";
import { clearResourceCache } from "../lib/resource-cache";
import { addMockDelayedPaymentOrder, addMockRefundingOrders, emptyMockWaitingQueue, expireMockMerchantSession, resetMockMerchantApi, seedMockWaitingOrders, setMockMemberDetailDelay, setMockMemberSearchDelay, setMockOrderListDelay, setMockOrderListFailure, setMockStoreConfigDelay } from "../mocks/mockApi";
import { formatSignedPoints } from "../pages/DashboardPage";

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
    expect(screen.getByText("祯好七福鼎肉片")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByRole("heading", { name: "今天的生意" })).toBeInTheDocument();
    expect(screen.getByText("支付金额")).toBeInTheDocument();
    expect(screen.queryByText(/员工/)).not.toBeInTheDocument();
    expect(await screen.findByText("当前有 2 笔待出餐")).toBeInTheDocument();
    expect(screen.getByText(/待出餐 2 笔/)).toBeInTheDocument();
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
    window.dispatchEvent(new Event("online"));
    expect(await screen.findByText("当前有 1 笔待出餐")).toBeInTheDocument();
    expect(screen.getByText(/取餐号 103/)).toBeInTheDocument();
    expect(screen.queryByText(/取餐号 102、103/)).not.toBeInTheDocument();
  });

  it("edits product points and keeps them as integers", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "商品" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "编辑" }))[0]);
    const productName = screen.getByLabelText("商品名称") as HTMLInputElement;
    productName.focus();
    fireEvent.change(productName, { target: { value: "祯好七福鼎肉片测" } });
    expect(productName).toHaveFocus();
    fireEvent.change(productName, { target: { value: "祯好七福鼎肉片测试" } });
    expect(productName).toHaveFocus();
    const points = screen.getByLabelText("顾客每份积分") as HTMLInputElement;
    fireEvent.change(points, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "保存商品" }));
    expect(await screen.findByText("商品已保存")).toBeInTheDocument();
    expect(await screen.findByText("顾客 +12/份")).toBeInTheDocument();
  });

  it("accepts natural decimal typing for product and option prices", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "商品" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "编辑" }))[0]);

    const typeNaturally = (input: HTMLInputElement, value: string) => {
      fireEvent.change(input, { target: { value: "" } });
      for (const character of value) fireEvent.change(input, { target: { value: input.value + character } });
    };
    const basePrice = screen.getByLabelText("基础价格（元）") as HTMLInputElement;
    const optionPrice = screen.getByLabelText("加肉加价") as HTMLInputElement;
    typeNaturally(basePrice, "12.5");
    typeNaturally(optionPrice, "2.5");
    expect(basePrice).toHaveValue("12.5");
    expect(optionPrice).toHaveValue("2.5");

    fireEvent.click(screen.getByRole("button", { name: "保存商品" }));
    expect(await screen.findByText("商品已保存")).toBeInTheDocument();
    expect(await screen.findByText("¥12.50")).toBeInTheDocument();
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

  it("does not overwrite a settings draft when a cached background refresh finishes", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "营业设置" }));
    expect(await screen.findByDisplayValue("每日现打肉泥，现点现煮")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "商品" }));

    setMockStoreConfigDelay(300);
    fireEvent.click(screen.getByRole("link", { name: "营业设置" }));
    const announcement = screen.getByLabelText("今日公告") as HTMLTextAreaElement;
    fireEvent.change(announcement, { target: { value: "刚刚输入的新公告" } });
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(announcement).toHaveValue("刚刚输入的新公告");
  });

  it("keeps the waiting queue oldest-first and history newest-first", async () => {
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
    expect(allCards[0]).toHaveTextContent("103");
    expect(allCards[1]).toHaveTextContent("102");
    expect(allCards[2]).toHaveTextContent("101");
    expect(screen.getByText("最近优先")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "已完成" }));
    expect(screen.getByRole("heading", { name: "订单" })).toBeInTheDocument();
    expect(screen.queryByText("正在同步订单")).not.toBeInTheDocument();
    expect(await screen.findByText("101")).toBeInTheDocument();
  });

  it("keeps loaded waiting-order pages when the five-second monitor refreshes", async () => {
    seedMockWaitingOrders(120);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "订单" }));
    expect(await screen.findByText("已加载 50 单")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(await screen.findByText("已加载 100 单")).toBeInTheDocument();

    window.dispatchEvent(new Event("online"));
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(screen.getByText("已加载 100 单")).toBeInTheDocument();
  });

  it("announces an older order that enters the waiting queue after a delayed payment", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    expect(await screen.findByText("当前有 2 笔待出餐")).toBeInTheDocument();

    addMockDelayedPaymentOrder();
    window.dispatchEvent(new Event("online"));

    expect(await screen.findByText("收到 1 笔新订单")).toBeInTheDocument();
    expect(screen.getByText(/104/)).toBeInTheDocument();
  });

  it("announces the first order after an empty baseline without treating initial orders as new", async () => {
    emptyMockWaitingQueue();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    expect(await screen.findByText(/待出餐 0 笔/)).toBeInTheDocument();
    expect(screen.queryByText(/收到 .*笔新订单/)).not.toBeInTheDocument();

    addMockDelayedPaymentOrder();
    window.dispatchEvent(new Event("online"));

    expect(await screen.findByText("收到 1 笔新订单")).toBeInTheDocument();
    expect(screen.getByText(/104/)).toBeInTheDocument();
  });

  it("directs abnormal refunds to the merchant platform while keeping closed refunds retryable", async () => {
    addMockRefundingOrders();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "订单" }));
    fireEvent.click(await screen.findByRole("tab", { name: "退款中" }));

    const abnormalCard = (await screen.findByText("201")).closest(".order-card");
    const closedCard = (await screen.findByText("202")).closest(".order-card");
    expect(abnormalCard).not.toBeNull();
    expect(closedCard).not.toBeNull();
    expect(within(abnormalCard as HTMLElement).getByRole("alert")).toHaveTextContent("退款异常，请到微信支付商户平台处理");
    expect(within(abnormalCard as HTMLElement).queryByRole("button", { name: "重新退款" })).not.toBeInTheDocument();
    expect(within(closedCard as HTMLElement).getByRole("button", { name: "重新退款" })).toBeInTheDocument();
  });

  it("does not let a slow previous tab request overwrite the current order filter", async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "订单" }));
    await screen.findByText("102");
    setMockOrderListDelay("ALL", 260);
    setMockOrderListDelay("COMPLETED", 20);

    fireEvent.click(screen.getByRole("tab", { name: "全部" }));
    fireEvent.click(screen.getByRole("tab", { name: "已完成" }));
    expect(await screen.findByText("101")).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 320));

    const cards = container.querySelectorAll(".order-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("101");
    expect(screen.getByRole("tab", { name: "已完成" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the latest member search when responses finish out of order", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "用户" }));
    expect(await screen.findByText("M00128")).toBeInTheDocument();
    setMockMemberSearchDelay("小陈", 260);
    setMockMemberSearchDelay("阿林", 20);

    const searchForm = screen.getByRole("search");
    const searchInput = screen.getByLabelText("搜索用户");
    fireEvent.change(searchInput, { target: { value: "小陈" } });
    fireEvent.submit(searchForm);
    fireEvent.change(searchInput, { target: { value: "阿林" } });
    fireEvent.submit(searchForm);

    expect(await screen.findByText("M00129")).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    const memberList = document.querySelector(".member-list");
    expect(memberList).toHaveTextContent("阿林");
    expect(memberList).not.toHaveTextContent("小陈");
  });

  it("keeps the latest member detail when responses finish out of order", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    fireEvent.click(await screen.findByRole("link", { name: "用户" }));
    const chenButton = await screen.findByRole("button", { name: "查看小陈详情" });
    const linButton = screen.getByRole("button", { name: "查看阿林详情" });
    setMockMemberDetailDelay("member-chen", 260);
    setMockMemberDetailDelay("member-lin", 20);

    fireEvent.click(chenButton);
    fireEvent.click(linButton);
    expect(await screen.findByRole("dialog", { name: "阿林" })).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(screen.getByRole("dialog", { name: "阿林" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "小陈" })).not.toBeInTheDocument();
  });

  it("shows order monitor failures and recovers through the visible retry action", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    await screen.findByText(/待出餐 2 笔/);
    setMockOrderListFailure(true);
    window.dispatchEvent(new Event("online"));
    expect(await screen.findByText("接单同步中断")).toBeInTheDocument();
    expect(screen.getByText("暂时无法同步新订单，请检查网络后重试")).toBeInTheDocument();

    setMockOrderListFailure(false);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("接单正常")).toBeInTheDocument();
  });

  it("returns to login with an explanation when the owner session expires", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "登录" }));
    await screen.findByRole("heading", { name: "今天的生意" });
    expireMockMerchantSession();
    fireEvent.click(screen.getByRole("link", { name: "营业设置" }));

    expect(await screen.findByRole("heading", { name: "老板登录" })).toBeInTheDocument();
    expect(screen.getByText("登录已失效，请重新登录")).toBeInTheDocument();
  });

  it("uses a repeated chime instead of a single short beep", () => {
    expect(NEW_ORDER_CHIME).toHaveLength(6);
    const last = NEW_ORDER_CHIME[NEW_ORDER_CHIME.length - 1];
    expect(last.offset + last.duration).toBeGreaterThan(1.5);
  });

  it("formats net point totals without a double sign", () => {
    expect(formatSignedPoints(8)).toBe("+8");
    expect(formatSignedPoints(-10)).toBe("-10");
    expect(formatSignedPoints(0)).toBe("0");
  });
});

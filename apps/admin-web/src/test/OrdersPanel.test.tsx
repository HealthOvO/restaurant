import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderRecord, OrderStatusLog, PaginationMeta } from "@restaurant/shared";
import { OrdersPanel } from "../components/OrdersPanel";

const pagination: PaginationMeta = {
  page: 1,
  pageSize: 8,
  total: 1,
  totalPages: 1,
  pageItemCount: 1,
  rangeStart: 1,
  rangeEnd: 1,
  hasPrevPage: false,
  hasNextPage: false
};

const order: OrderRecord = {
  _id: "order-1",
  storeId: "default-store",
  orderNo: "OD202604130001",
  memberId: "member-1",
  memberOpenId: "openid-1",
  memberCode: "M0001",
  nickname: "张三",
  status: "PENDING_CONFIRM",
  fulfillmentMode: "DINE_IN",
  sourceChannel: "MINIPROGRAM",
  tableNo: "A08",
  itemCount: 2,
  subtotalAmount: 64,
  payableAmount: 64,
  currency: "CNY",
  lineItems: [
    {
      lineId: "line-1",
      menuItemId: "dish-1",
      categoryId: "category-1",
      name: "精品肥牛",
      quantity: 2,
      basePrice: 32,
      unitPrice: 32,
      selectedOptions: [],
      lineTotal: 64
    }
  ],
  submittedAt: "2026-04-13T10:00:00.000Z",
  statusChangedAt: "2026-04-13T10:00:00.000Z",
  createdAt: "2026-04-13T10:00:00.000Z",
  updatedAt: "2026-04-13T10:00:00.000Z"
};

const logs: OrderStatusLog[] = [
  {
    _id: "log-1",
    storeId: "default-store",
    orderId: "order-1",
    orderNo: "OD202604130001",
    status: "PENDING_CONFIRM",
    operatorType: "MEMBER",
    operatorId: "openid-1",
    createdAt: "2026-04-13T10:00:00.000Z",
    updatedAt: "2026-04-13T10:00:00.000Z"
  }
];

describe("OrdersPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits filters and status actions", () => {
    const onSearch = vi.fn().mockResolvedValue(undefined);
    const onSelectOrder = vi.fn().mockResolvedValue(undefined);
    const onUpdateStatus = vi.fn().mockResolvedValue(undefined);

    render(
      <OrdersPanel
        detailLoading={false}
        loading={false}
        onSearch={onSearch}
        onSelectOrder={onSelectOrder}
        onUpdateStatus={onUpdateStatus}
        orderLogs={logs}
        pagination={pagination}
        query=""
        rows={[order]}
        selectedOrder={order}
        status="ALL"
        updatingStatus={null}
      />
    );

    fireEvent.change(screen.getByLabelText("搜索关键词"), {
      target: { value: "A08" }
    });
    fireEvent.change(screen.getByLabelText("订单状态"), {
      target: { value: "PENDING_CONFIRM" }
    });
    fireEvent.click(screen.getByRole("button", { name: "查询订单" }));

    expect(onSearch).toHaveBeenCalledWith("A08", "PENDING_CONFIRM", 1);

    fireEvent.change(screen.getByLabelText("处理备注"), {
      target: { value: "已通知后厨" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认接单" }));

    expect(onUpdateStatus).toHaveBeenCalledWith({
      orderId: "order-1",
      nextStatus: "CONFIRMED",
      note: "已通知后厨"
    });
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberSearchPanel } from "../components/MemberSearchPanel";

describe("MemberSearchPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("submits search query and manual adjustment", () => {
    const onSearch = vi.fn().mockResolvedValue(undefined);
    const onAdjust = vi.fn().mockResolvedValue(undefined);

    render(
      <MemberSearchPanel
        hasSearched={false}
        query=""
        rows={[]}
        loading={false}
        pagination={{
          page: 1,
          pageSize: 8,
          total: 0,
          totalPages: 1,
          pageItemCount: 0,
          rangeStart: 0,
          rangeEnd: 0,
          hasPrevPage: false,
          hasNextPage: false
        }}
        onSearch={onSearch}
        onAdjust={onAdjust}
        onAdjustPoints={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("输入手机号、会员号或昵称"), {
      target: { value: "13812345678" }
    });
    fireEvent.click(screen.getByText("搜索会员"));
    expect(onSearch).toHaveBeenCalledWith("13812345678", 1);

    fireEvent.change(screen.getByPlaceholderText("被邀请会员 ID"), {
      target: { value: "invitee-1" }
    });
    fireEvent.change(screen.getByPlaceholderText("新邀请人会员 ID"), {
      target: { value: "inviter-1" }
    });
    fireEvent.change(screen.getByPlaceholderText("例如：顾客提供了正确邀请人信息"), {
      target: { value: "顾客提供了正确邀请人信息" }
    });
    fireEvent.click(screen.getByText("保存关系修正"));

    expect(onAdjust).toHaveBeenCalledWith("invitee-1", "inviter-1", "顾客提供了正确邀请人信息");
  });

  it("fills invitee and inviter ids from member shortcuts with visible feedback", () => {
    render(
      <MemberSearchPanel
        adjusting={false}
        hasSearched
        query=""
        rows={[
          {
            member: {
              _id: "member-1",
              storeId: "default-store",
              memberCode: "M0001",
              openId: "openid-1",
              nickname: "张三",
              phone: "13800000000",
              phoneVerifiedAt: "2026-04-05T10:00:00.000Z",
              pointsBalance: 12,
              hasCompletedFirstVisit: false,
              firstVisitAt: undefined,
              createdAt: "2026-04-05T10:00:00.000Z",
              updatedAt: "2026-04-05T10:00:00.000Z"
            },
            relation: null,
            visits: [],
            vouchers: []
          },
          {
            member: {
              _id: "member-2",
              storeId: "default-store",
              memberCode: "M0002",
              openId: "openid-2",
              nickname: "李四",
              phone: "13900000000",
              phoneVerifiedAt: "2026-04-05T10:00:00.000Z",
              pointsBalance: 30,
              hasCompletedFirstVisit: false,
              firstVisitAt: undefined,
              createdAt: "2026-04-05T10:00:00.000Z",
              updatedAt: "2026-04-05T10:00:00.000Z"
            },
            relation: null,
            visits: [],
            vouchers: []
          }
        ]}
        loading={false}
        pagination={{
          page: 1,
          pageSize: 8,
          total: 2,
          totalPages: 1,
          pageItemCount: 2,
          rangeStart: 1,
          rangeEnd: 2,
          hasPrevPage: false,
          hasNextPage: false
        }}
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onAdjust={vi.fn().mockResolvedValue(undefined)}
        onAdjustPoints={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getAllByText("设为被邀请人")[0]);
    expect(screen.getByLabelText("被邀请会员 ID")).toHaveValue("member-1");
    expect(screen.getByRole("status")).toHaveTextContent("已带入被邀请会员：张三");
    expect(screen.getByText("被邀请会员")).toBeInTheDocument();
    expect(screen.getByText("M0001 · 已从列表带入")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("设为邀请人")[1]);
    expect(screen.getByLabelText("新邀请人会员 ID")).toHaveValue("member-2");
    expect(screen.getByRole("status")).toHaveTextContent("已带入邀请人会员：李四");
    expect(screen.getByText("邀请人会员")).toBeInTheDocument();
  });

  it("prevents selecting the same member for both invite sides", () => {
    render(
      <MemberSearchPanel
        adjusting={false}
        hasSearched
        query=""
        rows={[
          {
            member: {
              _id: "member-1",
              storeId: "default-store",
              memberCode: "M0001",
              openId: "openid-1",
              nickname: "张三",
              phone: "13800000000",
              phoneVerifiedAt: "2026-04-05T10:00:00.000Z",
              pointsBalance: 0,
              hasCompletedFirstVisit: false,
              firstVisitAt: undefined,
              createdAt: "2026-04-05T10:00:00.000Z",
              updatedAt: "2026-04-05T10:00:00.000Z"
            },
            relation: null,
            visits: [],
            vouchers: []
          }
        ]}
        loading={false}
        pagination={{
          page: 1,
          pageSize: 8,
          total: 1,
          totalPages: 1,
          pageItemCount: 1,
          rangeStart: 1,
          rangeEnd: 1,
          hasPrevPage: false,
          hasNextPage: false
        }}
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onAdjust={vi.fn().mockResolvedValue(undefined)}
        onAdjustPoints={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByText("设为被邀请人"));
    fireEvent.click(screen.getByText("设为邀请人"));

    expect(screen.getByRole("status")).toHaveTextContent("邀请人和被邀请人不能是同一会员");
    expect(screen.getByLabelText("新邀请人会员 ID")).toHaveValue("");
  });

  it("locks manual adjustment inputs while a binding change is submitting", () => {
    render(
      <MemberSearchPanel
        adjusting
        hasSearched={false}
        query=""
        rows={[]}
        loading={false}
        pagination={{
          page: 1,
          pageSize: 8,
          total: 0,
          totalPages: 1,
          pageItemCount: 0,
          rangeStart: 0,
          rangeEnd: 0,
          hasPrevPage: false,
          hasNextPage: false
        }}
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onAdjust={vi.fn().mockResolvedValue(undefined)}
        onAdjustPoints={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByLabelText("被邀请会员 ID")).toBeDisabled();
    expect(screen.getByLabelText("新邀请人会员 ID")).toBeDisabled();
    expect(screen.getByPlaceholderText("例如：顾客提供了正确邀请人信息")).toBeDisabled();
    expect(screen.getByRole("button", { name: "提交中..." })).toBeDisabled();
  });
});

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedbackTicket } from "@restaurant/shared";
import { FeedbackPanel } from "../components/FeedbackPanel";

function createFeedbackTicket(overrides: Partial<FeedbackTicket> = {}): FeedbackTicket {
  return {
    _id: "feedback-1",
    storeId: "default-store",
    feedbackCode: "F00000001",
    sourceType: "MEMBER",
    sourceChannel: "MINIPROGRAM_MEMBER",
    status: "OPEN",
    priority: "NORMAL",
    category: "POINTS",
    title: "积分没有到账",
    content: "昨天完成首单后，积分没有到账。",
    submitterOpenId: "openid-member-1",
    memberId: "member-1",
    memberCode: "M0001",
    contactName: "张三",
    contactInfo: "13800000000",
    sourcePage: "/pages/feedback/feedback",
    createdAt: "2026-04-08T10:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    ...overrides
  };
}

describe("FeedbackPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("filters feedbacks locally by source, status, category and keyword", () => {
    render(
      <FeedbackPanel
        feedbacks={[
          createFeedbackTicket(),
          createFeedbackTicket({
            _id: "feedback-2",
            feedbackCode: "F00000002",
            sourceType: "STAFF",
            sourceChannel: "MINIPROGRAM_STAFF",
            status: "PROCESSING",
            priority: "HIGH",
            category: "STAFF_TOOL",
            title: "核销页一直转圈",
            content: "扫码后页面一直转圈，无法完成核销。",
            staffUserId: "staff-1",
            staffUsername: "cashier01",
            contactName: "前台小王",
            contactInfo: "cashier01"
          })
        ]}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.change(screen.getByLabelText("提交来源"), {
      target: { value: "STAFF" }
    });
    fireEvent.change(screen.getByLabelText("问题分类"), {
      target: { value: "STAFF_TOOL" }
    });
    fireEvent.change(screen.getByLabelText("搜索关键词"), {
      target: { value: "cashier01" }
    });

    expect(screen.getByText("核销页一直转圈")).toBeInTheDocument();
    expect(screen.queryByText("积分没有到账")).toBeNull();
    expect(screen.getByText("当前显示 1 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清空筛选" }));
    expect(screen.getByText("积分没有到账")).toBeInTheDocument();
  });

  it("submits edited feedback handling data", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<FeedbackPanel feedbacks={[createFeedbackTicket()]} onUpdate={onUpdate} />);

    const card = screen.getByText("积分没有到账").closest(".feedback-card");
    expect(card).toBeTruthy();

    const scoped = within(card as HTMLElement);
    const saveButton = scoped.getByRole("button", { name: "保存处理结果" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(scoped.getByRole("combobox", { name: "处理状态" }), {
      target: { value: "PROCESSING" }
    });
    fireEvent.change(scoped.getByRole("combobox", { name: "优先级" }), {
      target: { value: "URGENT" }
    });
    fireEvent.change(scoped.getByLabelText("给用户的回复"), {
      target: { value: "已经接手排查，稍后回你。" }
    });

    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    expect(onUpdate).toHaveBeenCalledWith({
      feedbackId: "feedback-1",
      status: "PROCESSING",
      priority: "URGENT",
      ownerReply: "已经接手排查，稍后回你。"
    });
  });
});

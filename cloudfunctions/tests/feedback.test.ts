import { describe, expect, it, vi } from "vitest";
import {
  listAdminFeedback,
  listMyMemberFeedback,
  listMyStaffFeedback,
  submitMemberFeedback,
  submitStaffFeedback,
  updateAdminFeedback
} from "../src/runtime/service.feedback";
import { issueSessionToken } from "../src/runtime/auth";

process.env.SESSION_SECRET = "test-session-secret";

const ownerSessionToken = issueSessionToken({
  staffUserId: "staff-owner-1",
  username: "owner",
  role: "OWNER",
  storeId: "default-store"
});

const staffSessionToken = issueSessionToken({
  staffUserId: "staff-1",
  username: "cashier01",
  role: "STAFF",
  storeId: "default-store"
});

describe("feedback flow", () => {
  it("allows a member to submit feedback and keeps member snapshot fields", async () => {
    const repository = {
      storeId: "default-store",
      getMemberByOpenId: vi.fn().mockResolvedValue({
        _id: "member-1",
        storeId: "default-store",
        memberCode: "M00000001",
        openId: "openid-member-1",
        phone: "13812345678",
        nickname: "张三",
        pointsBalance: 0,
        hasCompletedFirstVisit: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      saveFeedbackTicket: vi.fn().mockImplementation(async (ticket) => ticket),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await submitMemberFeedback(repository as never, "openid-member-1", {
      title: "积分没有到账",
      content: "昨天完成首单了，但是今天积分还是没有变化。",
      category: "POINTS",
      sourcePage: "/pages/vouchers/vouchers"
    });

    expect(result).toMatchObject({
      ok: true,
      ticket: {
        sourceType: "MEMBER",
        sourceChannel: "MINIPROGRAM_MEMBER",
        memberId: "member-1",
        memberCode: "M00000001",
        contactName: "张三",
        contactInfo: "13812345678",
        category: "POINTS"
      }
    });
    expect(repository.saveFeedbackTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackCode: expect.stringMatching(/^F/),
        submitterOpenId: "openid-member-1"
      })
    );
  });

  it("returns the current member's own feedback sorted by update time", async () => {
    const repository = {
      listFeedbackTicketsBySubmitterOpenId: vi.fn().mockResolvedValue([
        {
          _id: "feedback-1",
          storeId: "default-store",
          feedbackCode: "F00000001",
          sourceType: "MEMBER",
          sourceChannel: "MINIPROGRAM_MEMBER",
          status: "OPEN",
          priority: "NORMAL",
          category: "BUG",
          title: "旧反馈",
          content: "旧反馈内容",
          submitterOpenId: "openid-member-1",
          createdAt: "2026-04-01T08:00:00.000Z",
          updatedAt: "2026-04-01T08:00:00.000Z"
        },
        {
          _id: "feedback-2",
          storeId: "default-store",
          feedbackCode: "F00000002",
          sourceType: "MEMBER",
          sourceChannel: "MINIPROGRAM_MEMBER",
          status: "PROCESSING",
          priority: "HIGH",
          category: "VOUCHER",
          title: "新反馈",
          content: "新反馈内容",
          submitterOpenId: "openid-member-1",
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-03T08:00:00.000Z"
        }
      ])
    };

    const result = await listMyMemberFeedback(repository as never, "openid-member-1");

    expect(result.tickets.map((ticket) => ticket._id)).toEqual(["feedback-2", "feedback-1"]);
  });

  it("allows staff to submit and query their own feedback", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      saveFeedbackTicket: vi.fn().mockImplementation(async (ticket) => ticket),
      listFeedbackTicketsByStaffUserId: vi.fn().mockResolvedValue([
        {
          _id: "feedback-staff-1",
          storeId: "default-store",
          feedbackCode: "F00001001",
          sourceType: "STAFF",
          sourceChannel: "MINIPROGRAM_STAFF",
          status: "OPEN",
          priority: "NORMAL",
          category: "STAFF_TOOL",
          title: "核销页卡住了",
          content: "扫完券以后页面一直转圈。",
          staffUserId: "staff-1",
          staffUsername: "cashier01",
          contactName: "前台小王",
          contactInfo: "cashier01",
          createdAt: "2026-04-02T08:00:00.000Z",
          updatedAt: "2026-04-02T08:00:00.000Z"
        }
      ]),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const submitResult = await submitStaffFeedback(repository as never, {
      sessionToken: staffSessionToken,
      title: "核销页卡住了",
      content: "扫完券以后页面一直转圈。",
      category: "STAFF_TOOL",
      sourcePage: "/pages/staff-voucher/staff-voucher"
    });
    const listResult = await listMyStaffFeedback(repository as never, {
      sessionToken: staffSessionToken
    });

    expect(submitResult).toMatchObject({
      ok: true,
      ticket: {
        sourceType: "STAFF",
        staffUserId: "staff-1",
        staffUsername: "cashier01"
      }
    });
    expect(listResult.tickets).toHaveLength(1);
    expect(repository.listFeedbackTicketsByStaffUserId).toHaveBeenCalledWith("staff-1");
  });

  it("allows a member without a member record to submit feedback", async () => {
    const repository = {
      storeId: "default-store",
      getMemberByOpenId: vi.fn().mockResolvedValue(null),
      saveFeedbackTicket: vi.fn().mockImplementation(async (ticket) => ticket),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    const result = await submitMemberFeedback(repository as never, "openid-guest-1", {
      title: "还没注册也想先反馈",
      content: "我先提个问题，后面再去绑定手机号。",
      category: "OTHER"
    });

    expect(result).toMatchObject({
      ok: true,
      ticket: {
        sourceType: "MEMBER",
        submitterOpenId: "openid-guest-1",
        memberId: undefined,
        memberCode: undefined,
        contactName: "微信用户"
      }
    });
  });

  it("requires an owner reply before resolving feedback and persists owner updates", async () => {
    const feedbackTicket = {
      _id: "feedback-1",
      storeId: "default-store",
      feedbackCode: "F00000001",
      sourceType: "MEMBER" as const,
      sourceChannel: "MINIPROGRAM_MEMBER" as const,
      status: "OPEN" as const,
      priority: "NORMAL" as const,
      category: "BUG" as const,
      title: "页面空白",
      content: "打开后是空白页。",
      submitterOpenId: "openid-member-1",
      createdAt: "2026-04-02T08:00:00.000Z",
      updatedAt: "2026-04-02T08:00:00.000Z"
    };
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getFeedbackTicketById: vi.fn().mockResolvedValue(feedbackTicket),
      saveFeedbackTicket: vi.fn().mockImplementation(async (ticket) => ticket),
      addAuditLog: vi.fn().mockResolvedValue(undefined),
      listFeedbackTickets: vi.fn().mockResolvedValue([feedbackTicket])
    };

    await expect(
      updateAdminFeedback(repository as never, {
        sessionToken: ownerSessionToken,
        feedbackId: "feedback-1",
        status: "RESOLVED",
        priority: "HIGH",
        ownerReply: ""
      })
    ).rejects.toMatchObject({
      code: "FEEDBACK_REPLY_REQUIRED"
    });

    const result = await updateAdminFeedback(repository as never, {
      sessionToken: ownerSessionToken,
      feedbackId: "feedback-1",
      status: "RESOLVED",
      priority: "HIGH",
      ownerReply: "已经修复，请你重新进入页面试一下。"
    });
    const listResult = await listAdminFeedback(repository as never, {
      sessionToken: ownerSessionToken
    });

    expect(result).toMatchObject({
      ok: true,
      ticket: {
        status: "RESOLVED",
        priority: "HIGH",
        ownerReply: "已经修复，请你重新进入页面试一下。",
        handledByStaffId: "staff-owner-1"
      }
    });
    expect(listResult.tickets).toHaveLength(1);
  });

  it("rejects non-owner access when reading or updating admin feedback", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-1",
        storeId: "default-store",
        username: "cashier01",
        passwordHash: "hash",
        displayName: "前台小王",
        role: "STAFF",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      listFeedbackTickets: vi.fn().mockResolvedValue([]),
      getFeedbackTicketById: vi.fn().mockResolvedValue(null)
    };

    await expect(
      listAdminFeedback(repository as never, {
        sessionToken: staffSessionToken
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });

    await expect(
      updateAdminFeedback(repository as never, {
        sessionToken: staffSessionToken,
        feedbackId: "feedback-1",
        status: "PROCESSING",
        priority: "HIGH",
        ownerReply: "正在处理"
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });

    expect(repository.listFeedbackTickets).not.toHaveBeenCalled();
    expect(repository.getFeedbackTicketById).not.toHaveBeenCalled();
  });

  it("returns a clear error when the owner updates a missing feedback ticket", async () => {
    const repository = {
      storeId: "default-store",
      getStaffById: vi.fn().mockResolvedValue({
        _id: "staff-owner-1",
        storeId: "default-store",
        username: "owner",
        passwordHash: "hash",
        displayName: "老板",
        role: "OWNER",
        isEnabled: true,
        createdAt: "2026-04-02T08:00:00.000Z",
        updatedAt: "2026-04-02T08:00:00.000Z"
      }),
      getFeedbackTicketById: vi.fn().mockResolvedValue(null),
      saveFeedbackTicket: vi.fn().mockImplementation(async (ticket) => ticket),
      addAuditLog: vi.fn().mockResolvedValue(undefined)
    };

    await expect(
      updateAdminFeedback(repository as never, {
        sessionToken: ownerSessionToken,
        feedbackId: "feedback-missing",
        status: "PROCESSING",
        priority: "HIGH",
        ownerReply: "正在排查"
      })
    ).rejects.toMatchObject({
      code: "FEEDBACK_NOT_FOUND"
    });

    expect(repository.saveFeedbackTicket).not.toHaveBeenCalled();
  });
});

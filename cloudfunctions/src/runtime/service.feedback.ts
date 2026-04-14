import {
  adminFeedbackListInputSchema,
  adminFeedbackUpdateInputSchema,
  createFeedbackCode,
  DomainError,
  memberFeedbackSubmitInputSchema,
  staffFeedbackMineInputSchema,
  staffFeedbackSubmitInputSchema,
  type AuditLog,
  type FeedbackTicket
} from "@restaurant/shared";
import { createId } from "./ids";
import { RestaurantRepository } from "./repository";
import { requireActiveStaffSession } from "./service.staff";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = `${value ?? ""}`.trim();
  return normalized || undefined;
}

function sortFeedbackTickets(tickets: FeedbackTicket[]): FeedbackTicket[] {
  return tickets.slice().sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

async function writeAudit(
  repository: RestaurantRepository,
  payload: Omit<AuditLog, "_id" | "createdAt" | "updatedAt" | "storeId">
): Promise<void> {
  const now = nowIso();
  await repository.addAuditLog({
    _id: createId("audit"),
    storeId: repository.storeId,
    createdAt: now,
    updatedAt: now,
    ...payload
  });
}

async function writeAuditSafely(
  repository: RestaurantRepository,
  payload: Omit<AuditLog, "_id" | "createdAt" | "updatedAt" | "storeId">
): Promise<void> {
  try {
    await writeAudit(repository, payload);
  } catch (error) {
    console.error("[audit] failed to persist log", payload.action, error);
  }
}

export async function submitMemberFeedback(repository: RestaurantRepository, callerOpenId: string, input: unknown) {
  const parsed = memberFeedbackSubmitInputSchema.parse(input);
  const member = await repository.getMemberByOpenId(callerOpenId);
  const now = nowIso();
  const feedbackId = createId("feedback");
  const ticket: FeedbackTicket = {
    _id: feedbackId,
    storeId: repository.storeId,
    feedbackCode: createFeedbackCode(feedbackId),
    sourceType: "MEMBER",
    sourceChannel: "MINIPROGRAM_MEMBER",
    status: "OPEN",
    priority: "NORMAL",
    category: parsed.category,
    title: parsed.title.trim(),
    content: parsed.content.trim(),
    submitterOpenId: callerOpenId,
    memberId: member?._id,
    memberCode: member?.memberCode,
    contactName: normalizeOptionalText(parsed.contactName) ?? member?.nickname ?? member?.memberCode ?? "微信用户",
    contactInfo: normalizeOptionalText(parsed.contactInfo) ?? member?.phone,
    sourcePage: normalizeOptionalText(parsed.sourcePage),
    createdAt: now,
    updatedAt: now
  };

  await repository.saveFeedbackTicket(ticket);
  await writeAuditSafely(repository, {
    actorId: member?._id ?? callerOpenId,
    actorType: "MEMBER",
    action: "SUBMIT_FEEDBACK",
    targetCollection: "feedback_tickets",
    targetId: ticket._id,
    summary: `会员提交反馈 ${ticket.feedbackCode}`,
    payload: {
      sourceType: ticket.sourceType,
      category: ticket.category,
      title: ticket.title
    }
  });

  return {
    ok: true,
    ticket
  };
}

export async function listMyMemberFeedback(repository: RestaurantRepository, callerOpenId: string) {
  const tickets = await repository.listFeedbackTicketsBySubmitterOpenId(callerOpenId);
  return {
    ok: true,
    tickets: sortFeedbackTickets(tickets)
  };
}

export async function submitStaffFeedback(repository: RestaurantRepository, input: unknown) {
  const parsed = staffFeedbackSubmitInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER" && staff.role !== "STAFF") {
    throw new DomainError("FORBIDDEN", "当前账号不能提交门店反馈");
  }

  const now = nowIso();
  const feedbackId = createId("feedback");
  const ticket: FeedbackTicket = {
    _id: feedbackId,
    storeId: repository.storeId,
    feedbackCode: createFeedbackCode(feedbackId),
    sourceType: "STAFF",
    sourceChannel: "MINIPROGRAM_STAFF",
    status: "OPEN",
    priority: "NORMAL",
    category: parsed.category,
    title: parsed.title.trim(),
    content: parsed.content.trim(),
    staffUserId: staff._id,
    staffUsername: staff.username,
    contactName: normalizeOptionalText(parsed.contactName) ?? staff.displayName,
    contactInfo: normalizeOptionalText(parsed.contactInfo) ?? staff.username,
    sourcePage: normalizeOptionalText(parsed.sourcePage),
    createdAt: now,
    updatedAt: now
  };

  await repository.saveFeedbackTicket(ticket);
  await writeAuditSafely(repository, {
    actorId: staff._id,
    actorType: staff.role === "OWNER" ? "OWNER" : "STAFF",
    action: "SUBMIT_FEEDBACK",
    targetCollection: "feedback_tickets",
    targetId: ticket._id,
    summary: `门店账号提交反馈 ${ticket.feedbackCode}`,
    payload: {
      sourceType: ticket.sourceType,
      category: ticket.category,
      title: ticket.title
    }
  });

  return {
    ok: true,
    ticket
  };
}

export async function listMyStaffFeedback(repository: RestaurantRepository, input: unknown) {
  const parsed = staffFeedbackMineInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  const tickets = await repository.listFeedbackTicketsByStaffUserId(staff._id);

  return {
    ok: true,
    tickets: sortFeedbackTickets(tickets)
  };
}

export async function listAdminFeedback(repository: RestaurantRepository, input: unknown) {
  const parsed = adminFeedbackListInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以查看用户反馈");
  }

  const tickets = await repository.listFeedbackTickets();
  return {
    ok: true,
    tickets: sortFeedbackTickets(tickets)
  };
}

export async function updateAdminFeedback(repository: RestaurantRepository, input: unknown) {
  const parsed = adminFeedbackUpdateInputSchema.parse(input);
  const { staff } = await requireActiveStaffSession(repository, parsed.sessionToken);
  if (staff.role !== "OWNER") {
    throw new DomainError("FORBIDDEN", "只有老板账号可以处理用户反馈");
  }

  const ticket = await repository.getFeedbackTicketById(parsed.feedbackId);
  if (!ticket) {
    throw new DomainError("FEEDBACK_NOT_FOUND", "反馈记录不存在");
  }

  const nextOwnerReply = normalizeOptionalText(parsed.ownerReply);
  if (parsed.status === "RESOLVED" && !nextOwnerReply && !ticket.ownerReply) {
    throw new DomainError("FEEDBACK_REPLY_REQUIRED", "处理为已解决前，请先填写给用户的回复");
  }

  const now = nowIso();
  ticket.status = parsed.status;
  ticket.priority = parsed.priority;
  ticket.ownerReply = nextOwnerReply;
  ticket.handledByStaffId = staff._id;
  ticket.handledAt = now;
  ticket.updatedAt = now;

  await repository.saveFeedbackTicket(ticket);
  await writeAuditSafely(repository, {
    actorId: staff._id,
    actorType: "OWNER",
    action: "UPDATE_FEEDBACK",
    targetCollection: "feedback_tickets",
    targetId: ticket._id,
    summary: `处理反馈 ${ticket.feedbackCode}`,
    payload: {
      status: ticket.status,
      priority: ticket.priority,
      hasOwnerReply: Boolean(ticket.ownerReply)
    }
  });

  return {
    ok: true,
    ticket
  };
}

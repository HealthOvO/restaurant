import { type OpsTask } from "@restaurant/shared";
import { createId } from "./ids";
import { RestaurantRepository } from "./repository";

const MANUAL_REVIEW_CODES = new Set(["MEMBER_NOT_FOUND", "MEMBER_PHONE_REQUIRED", "ORDER_ALREADY_USED"]);

function nowIso(): string {
  return new Date().toISOString();
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }

  return undefined;
}

export function buildOrderVisitSettlementTaskDedupeKey(orderId: string): string {
  return `order-visit-settlement:${orderId}`;
}

export function classifyVisitSettlementFailure(error: unknown): {
  state: "RETRYABLE" | "MANUAL_REVIEW";
  code?: string;
  reason: string;
} {
  const code = getErrorCode(error);
  const reason = error instanceof Error ? error.message : "会员结算暂未完成";

  return {
    state: code && MANUAL_REVIEW_CODES.has(code) ? "MANUAL_REVIEW" : "RETRYABLE",
    code,
    reason
  };
}

export async function upsertOrderVisitSettlementTask(
  repository: RestaurantRepository,
  params: {
    orderId: string;
    orderNo: string;
    memberId?: string;
    memberCode?: string;
    sourceFunction: string;
    failure: {
      state: "RETRYABLE" | "MANUAL_REVIEW";
      code?: string;
      reason: string;
    };
    retryCountDelta?: number;
    triggeredAt?: string;
    lastRetriedAt?: string;
  }
): Promise<OpsTask> {
  const timestamp = params.triggeredAt ?? nowIso();
  const dedupeKey = buildOrderVisitSettlementTaskDedupeKey(params.orderId);
  const existing = await repository.getOpsTaskByDedupeKey(dedupeKey);
  const priority = params.failure.state === "MANUAL_REVIEW" ? "URGENT" : "HIGH";

  const task: OpsTask = {
    _id: existing?._id ?? createId("opstask"),
    storeId: repository.storeId,
    taskType: "ORDER_VISIT_SETTLEMENT",
    status: "OPEN",
    priority,
    title: "订单完成后会员结算未完成",
    description: params.failure.reason,
    dedupeKey,
    sourceFunction: params.sourceFunction,
    orderId: params.orderId,
    orderNo: params.orderNo,
    memberId: params.memberId ?? existing?.memberId,
    memberCode: params.memberCode ?? existing?.memberCode,
    lastErrorCode: params.failure.code,
    retryCount: Math.max(0, Number(existing?.retryCount || 0) + Number(params.retryCountDelta || 0)),
    lastTriggeredAt: timestamp,
    lastRetriedAt: params.lastRetriedAt ?? existing?.lastRetriedAt,
    resolvedAt: undefined,
    resolvedByStaffId: undefined,
    resolution: undefined,
    resolutionNote: undefined,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  return repository.saveOpsTask(task);
}

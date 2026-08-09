import { randomUUID } from "node:crypto";
import { DomainError } from "@restaurant/shared";
import { cloud } from "../runtime/cloud";
import { V2Application } from "./application";
import { createV2PaymentProvider } from "./payment";
import { CloudV2Repository } from "./repository";

export type V2ApiSuccess<T> = { ok: true; data: T; requestId: string };
export type V2ApiFailure = { ok: false; code: string; message: string; requestId: string };

function storeId(): string {
  const configured = process.env.STORE_ID?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "store-main";
  throw new DomainError("SYSTEM_NOT_READY", "服务端门店配置缺失");
}

export function createV2Runtime() {
  const repository = new CloudV2Repository(storeId());
  const application = new V2Application(repository, createV2PaymentProvider());
  return { repository, application };
}

export async function v2Response<T>(operation: () => Promise<T>): Promise<V2ApiSuccess<T> | V2ApiFailure> {
  const requestId = randomUUID();
  try {
    return { ok: true, data: await operation(), requestId };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, code: error.code, message: error.message, requestId };
    }
    if (error && typeof error === "object" && "issues" in error) {
      return { ok: false, code: "INVALID_INPUT", message: "提交内容不完整或格式不正确", requestId };
    }
    console.error("[v2] unexpected error", { requestId, error });
    return { ok: false, code: "INTERNAL_ERROR", message: "系统开小差了，请稍后重试", requestId };
  }
}

export function customerOpenId(): string {
  const value = cloud.getWXContext().OPENID?.trim();
  if (!value) throw new DomainError("UNAUTHORIZED", "无法识别微信账号");
  return value;
}

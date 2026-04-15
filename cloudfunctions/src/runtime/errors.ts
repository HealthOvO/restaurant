import { DomainError } from "@restaurant/shared";

function parseMissingCollectionName(message: string): string | undefined {
  const matched = message.match(/db or table not exist:\s*([a-zA-Z0-9_-]+)/i);
  return matched?.[1];
}

function isMissingCollectionError(error: unknown): boolean {
  const errCode = `${(error as { errCode?: string | number } | undefined)?.errCode ?? ""}`;
  const message = `${(error as { errMsg?: string; message?: string } | undefined)?.errMsg ?? (error as { message?: string } | undefined)?.message ?? ""}`.toLowerCase();

  return errCode === "-502005" || message.includes("database collection not exists") || message.includes("db or table not exist");
}

export function toErrorResponse(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof DomainError) {
    return {
      ok: false,
      code: error.code,
      message: error.message
    };
  }

  if (isMissingCollectionError(error)) {
    const rawMessage = `${(error as { errMsg?: string; message?: string } | undefined)?.errMsg ?? (error as { message?: string } | undefined)?.message ?? ""}`;
    const collectionName = parseMissingCollectionName(rawMessage);
    return {
      ok: false,
      code: "DATABASE_NOT_READY",
      message: collectionName
        ? `数据库未初始化，缺少集合 ${collectionName}`
        : "数据库未初始化，请先完成集合创建"
    };
  }

  console.error("[cloudfunctions] unexpected error", error);

  return {
    ok: false,
    code: "INTERNAL_ERROR",
    message: "系统错误，请稍后重试"
  };
}

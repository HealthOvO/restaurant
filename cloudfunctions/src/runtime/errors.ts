import { DomainError } from "@restaurant/shared";

export function toErrorResponse(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof DomainError) {
    return {
      ok: false,
      code: error.code,
      message: error.message
    };
  }

  console.error("[cloudfunctions] unexpected error", error);

  return {
    ok: false,
    code: "INTERNAL_ERROR",
    message: "系统错误，请稍后重试"
  };
}

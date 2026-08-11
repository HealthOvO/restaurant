import { describe, expect, it } from "vitest";
import { z } from "zod";
import { v2Response } from "../src/v2/handler";

describe("V2 API validation messages", () => {
  it("returns a concise domain validation message when one is available", async () => {
    const response = await v2Response(async () => z.object({ count: z.number().max(5, "单笔最多 5 份") }).parse({ count: 6 }));
    expect(response).toMatchObject({ ok: false, code: "INVALID_INPUT", message: "单笔最多 5 份" });
  });

  it("does not expose framework validation text", async () => {
    const response = await v2Response(async () => z.object({ count: z.number() }).parse({ count: "six" }));
    expect(response).toMatchObject({ ok: false, code: "INVALID_INPUT", message: "提交内容不完整或格式不正确" });
  });
});

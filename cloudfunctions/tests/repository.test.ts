import { describe, expect, it } from "vitest";
import { sanitizeUpdateData } from "../src/runtime/repository";

describe("repository update payload", () => {
  it("removes _id before sending update data to CloudBase", () => {
    expect(
      sanitizeUpdateData({
        _id: "member-1",
        nickname: "张三",
        phone: "13812345678",
        updatedAt: "2026-04-02T08:00:00.000Z"
      })
    ).toEqual({
      nickname: "张三",
      phone: "13812345678",
      updatedAt: "2026-04-02T08:00:00.000Z"
    });
  });
});

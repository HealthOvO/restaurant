import { describe, expect, it } from "vitest";
import { toErrorResponse } from "../src/runtime/errors";

describe("toErrorResponse", () => {
  it("maps missing collection errors to a deployment hint", () => {
    expect(
      toErrorResponse({
        errCode: -502005,
        errMsg: "collection.get:fail -502005 database collection not exists. [ResourceNotFound] Db or Table not exist: menu_items."
      })
    ).toEqual({
      ok: false,
      code: "DATABASE_NOT_READY",
      message: "数据库未初始化，缺少集合 menu_items"
    });
  });
});

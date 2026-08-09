import { describe, expect, it } from "vitest";
import { normalizeV2SystemEvent } from "../src/handlers/v2.system-api";

describe("system timer events", () => {
  it("unwraps the authenticated payload from an SCF timer message", () => {
    const payload = {
      action: "payments.reconcile",
      secret: "s".repeat(32),
      payload: {}
    };
    expect(normalizeV2SystemEvent({
      Type: "Timer",
      TriggerName: "v2-payments-reconcile",
      Message: JSON.stringify(payload)
    })).toEqual(payload);
  });

  it("leaves direct and malformed events for normal schema validation", () => {
    const direct = { action: "refunds.reconcile", secret: "s".repeat(32), payload: {} };
    expect(normalizeV2SystemEvent(direct)).toBe(direct);
    const malformed = { Type: "Timer", Message: "not-json" };
    expect(normalizeV2SystemEvent(malformed)).toBe(malformed);
  });
});

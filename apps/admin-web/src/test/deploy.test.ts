import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("merchant deployment", () => {
  it("rebuilds the site with the target CloudBase environment before publishing", () => {
    const script = readFileSync(resolve(process.cwd(), "../../scripts/deploy-admin-web.mjs"), "utf8");
    expect(script).toContain("VITE_TCB_ENV_ID: envId");
    expect(script.indexOf('"run", "build:admin"')).toBeLessThan(script.indexOf('"hosting", "deploy"'));
  });

  it("confirms CloudBase function updates in non-interactive deployments", () => {
    const script = readFileSync(resolve(process.cwd(), "../../scripts/deploy-cloudfunctions.mjs"), "utf8");
    expect(script).toContain('"--yes", "fn", "deploy"');
    expect(script).toContain('"v2-customer-api", 10');
    expect(script).toContain('"v2-system-api", 60');
    expect(script).toContain('"UpdateFunctionConfiguration"');
  });
});

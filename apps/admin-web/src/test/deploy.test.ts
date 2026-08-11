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
    expect(script).toContain('["fn", "list", "-e", envId, "--limit", "100", "--json"]');
    expect(script).toContain('"v2-customer-api", 15');
    expect(script).toContain('"v2-owner-api", 30');
    expect(script).toContain('"v2-system-api", 60');
    expect(script).toContain('"UpdateFunctionConfiguration"');
  });

  it("stops a release before deployment when review, build, worktree, or target checks fail", () => {
    const script = readFileSync(resolve(process.cwd(), "../../scripts/deploy-cloudfunctions.mjs"), "utf8");
    expect(script).toContain('"status", "--porcelain"');
    expect(script).toContain('"env", "list", "--json"');
    expect(script).toContain('["run", "review"]');
    expect(script).toContain('["run", "build:release"]');
    expect(script.indexOf('["run", "review"]')).toBeLessThan(script.indexOf('"--yes", "fn", "deploy"'));
    expect(script).toContain("JSON.stringify(actualNames) !== JSON.stringify(expectedNames)");
  });

  it("keeps PowerShell deployment entrypoints on the same Node scripts", () => {
    const functionsScript = readFileSync(resolve(process.cwd(), "../../scripts/deploy-cloudfunctions.ps1"), "utf8");
    const adminScript = readFileSync(resolve(process.cwd(), "../../scripts/deploy-admin-web.ps1"), "utf8");
    expect(functionsScript).toContain("npm run deploy:functions");
    expect(adminScript).toContain("npm run deploy:admin");
    expect(functionsScript).not.toContain("tcb fn deploy");
    expect(adminScript).not.toContain("tcb hosting deploy");
  });
});

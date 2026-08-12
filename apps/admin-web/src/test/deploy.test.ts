import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("merchant deployment", () => {
  it("rebuilds the site with the target CloudBase environment before publishing", () => {
    const script = readFileSync(resolve(process.cwd(), "../../scripts/deploy-admin-web.mjs"), "utf8");
    expect(script).toContain("VITE_TCB_ENV_ID: envId");
    expect(script.indexOf('"run", "build:admin"')).toBeLessThan(script.indexOf('"hosting", "deploy"'));
  });

  it("passes the configured region to every CloudBase environment and function command", async () => {
    const utilitiesPath = resolve(process.cwd(), "../../scripts/deploy-cloudfunctions-utils.mjs");
    const { createCloudbaseCommands } = await import(pathToFileURL(utilitiesPath).href);
    const commands = createCloudbaseCommands("env-guangzhou", "ap-guangzhou");

    expect(commands.envList).toEqual(["-r", "ap-guangzhou", "env", "list", "--json"]);
    expect(commands.functionList).toEqual([
      "-r", "ap-guangzhou", "fn", "list", "-e", "env-guangzhou", "--limit", "100", "--json"
    ]);
    expect(commands.deployFunction("v2-customer-api")).toEqual([
      "-r", "ap-guangzhou", "--yes", "fn", "deploy", "v2-customer-api",
      "-e", "env-guangzhou", "--force", "--deployMode", "zip"
    ]);
    expect(commands.updateFunctionTimeout("v2-customer-api", 15)).toEqual([
      "-r", "ap-guangzhou", "api", "scf", "UpdateFunctionConfiguration",
      "--body", JSON.stringify({ FunctionName: "v2-customer-api", Namespace: "env-guangzhou", Timeout: 15 }),
      "--json"
    ]);
  });

  it("accepts raw and localized CloudBase completion statuses", async () => {
    const utilitiesPath = resolve(process.cwd(), "../../scripts/deploy-cloudfunctions-utils.mjs");
    const { isFunctionDeploymentComplete } = await import(pathToFileURL(utilitiesPath).href);

    expect(isFunctionDeploymentComplete("Active")).toBe(true);
    expect(isFunctionDeploymentComplete("Deployment completed")).toBe(true);
    expect(isFunctionDeploymentComplete("部署完成")).toBe(true);
    expect(isFunctionDeploymentComplete("Updating")).toBe(false);
    expect(isFunctionDeploymentComplete("更新失败")).toBe(false);
  });

  it("confirms CloudBase function updates in non-interactive deployments", async () => {
    const script = readFileSync(resolve(process.cwd(), "../../scripts/deploy-cloudfunctions.mjs"), "utf8");
    const utilities = readFileSync(resolve(process.cwd(), "../../scripts/deploy-cloudfunctions-utils.mjs"), "utf8");
    expect(script).toContain("cloudbaseCommands.deployFunction(functionDir.name)");
    expect(script).toContain("cloudbaseCommands.functionList");
    expect(script).toContain('"v2-customer-api", 15');
    expect(script).toContain('"v2-owner-api", 30');
    expect(script).toContain('"v2-system-api", 60');
    expect(utilities).toContain('"UpdateFunctionConfiguration"');
    expect(script).toContain("waitForFunctionsCompleted()");
    expect(script).toContain("等待 CloudBase 完成异步更新");
  });

  it("stops a release before deployment when review, build, worktree, or target checks fail", () => {
    const script = readFileSync(resolve(process.cwd(), "../../scripts/deploy-cloudfunctions.mjs"), "utf8");
    expect(script).toContain('"status", "--porcelain"');
    expect(script).toContain("cloudbaseCommands.envList");
    expect(script).toContain('["run", "review"]');
    expect(script).toContain('["run", "build:release"]');
    expect(script.indexOf('["run", "review"]')).toBeLessThan(script.indexOf("cloudbaseCommands.deployFunction"));
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

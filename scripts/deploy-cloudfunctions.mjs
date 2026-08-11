import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const envId = process.argv[2]?.trim();
if (!envId) {
  console.error("用法：npm run deploy:functions -- <CloudBase 环境 ID>");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const functionsRoot = join(root, "cloudfunctions", "release");
const executable = process.platform === "win32" ? "tcb.cmd" : "tcb";
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const region = process.env.TCB_REGION?.trim() || "ap-shanghai";
const expectedFunctions = [
  "v2-payment-notify",
  "v2-refund-notify",
  "v2-system-api",
  "v2-owner-api",
  "v2-customer-api"
];
const functionTimeouts = new Map([
  ["v2-customer-api", 15],
  ["v2-owner-api", 30],
  ["v2-system-api", 60],
  ["v2-payment-notify", 15],
  ["v2-refund-notify", 15]
]);

function fail(message, status = 1) {
  console.error(message);
  process.exit(status || 1);
}

function run(command, args, options = {}) {
  const { failureMessage, ...spawnOptions } = options;
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...spawnOptions });
  if (result.error?.code === "ENOENT") fail(`未找到 ${command}，请先完成本机工具安装。`);
  if (result.error || result.status !== 0) fail(failureMessage || `${command} 执行失败。`, result.status || 1);
  return result;
}

function capture(command, args, failureMessage) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error?.code === "ENOENT") fail(`未找到 ${command}，请先完成本机工具安装。`);
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(failureMessage, result.status || 1);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function parseCliJson(output, label) {
  const objectStart = output.indexOf("{");
  const arrayStart = output.indexOf("[");
  const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  if (start === -1) fail(`${label}没有返回可解析的数据。`);
  const end = output[start] === "{" ? output.lastIndexOf("}") : output.lastIndexOf("]");
  if (end < start) fail(`${label}没有返回完整数据。`);
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    fail(`${label}返回格式异常，请升级 CloudBase CLI 后重试。`);
  }
}

function assertCleanWorktree() {
  if (process.env.ALLOW_DIRTY_DEPLOY === "1") {
    console.warn("已通过 ALLOW_DIRTY_DEPLOY=1 跳过工作区检查，请确认这是有意操作。");
    return;
  }
  const status = capture("git", ["status", "--porcelain", "--untracked-files=all"], "无法检查 Git 工作区状态。").trim();
  if (status) fail("工作区还有未提交改动，已停止部署。请先完成提交，紧急情况可显式设置 ALLOW_DIRTY_DEPLOY=1。");
}

function assertTargetEnvironment() {
  const output = capture(executable, ["env", "list", "--json"], "无法读取 CloudBase 环境，请先执行 tcb login。");
  const response = parseCliJson(output, "CloudBase 环境查询");
  const environments = Array.isArray(response) ? response : response.data;
  const target = Array.isArray(environments) ? environments.find((item) => item?.envId === envId) : undefined;
  if (!target) fail(`当前账号无权访问环境 ${envId}，已停止部署。`);
  if (target.status && target.status !== "NORMAL") fail(`环境 ${envId} 当前状态为 ${target.status}，已停止部署。`);
  console.log(`目标环境已确认：${envId}${target.packageName ? `（${target.packageName}）` : ""}`);
}

function collectFunctionDirs() {
  if (!existsSync(functionsRoot)) fail(`未找到云函数产物目录：${functionsRoot}`);
  const actualNames = readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedNames = [...expectedFunctions].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail(`云函数产物必须恰好包含：${expectedNames.join("、")}；当前为：${actualNames.join("、") || "空"}`);
  }
  return expectedFunctions.map((name) => {
    const path = join(functionsRoot, name);
    const entry = join(path, "index.js");
    const manifest = join(path, "package.json");
    if (!existsSync(entry) || !existsSync(manifest) || statSync(entry).size === 0) fail(`${name} 构建产物不完整。`);
    const hash = createHash("sha256").update(readFileSync(entry)).digest("hex").slice(0, 12);
    return { name, path, hash };
  });
}

function cloudFunctions() {
  const output = capture(executable, ["fn", "list", "-e", envId, "--limit", "100", "--json"], `无法读取环境 ${envId} 的云函数列表。`);
  const response = parseCliJson(output, "云函数查询");
  return Array.isArray(response) ? response : Array.isArray(response.data) ? response.data : [];
}

console.log("==> 发布前检查");
assertCleanWorktree();
capture(executable, ["--version"], "CloudBase CLI 不可用，请先安装并登录。");
assertTargetEnvironment();
const currentFunctions = cloudFunctions();
const existingNames = new Set(currentFunctions.map((item) => item?.name));
console.log(`目标函数：${expectedFunctions.map((name) => `${name}${existingNames.has(name) ? "（更新）" : "（新建）"}`).join("、")}`);

console.log("\n==> 运行完整审查与构建");
run(npmExecutable, ["run", "review"], { failureMessage: "完整审查未通过，已停止部署。" });
run(npmExecutable, ["run", "build:release"], { failureMessage: "发布构建未通过，已停止部署。" });
const functionDirs = collectFunctionDirs();
console.log(`构建校验通过：${functionDirs.map((item) => `${item.name}@${item.hash}`).join("、")}`);

console.log(`\n准备部署 ${functionDirs.length} 个云函数到环境 ${envId}`);
for (const functionDir of functionDirs) {
  console.log(`\n==> 部署云函数 ${functionDir.name}@${functionDir.hash}`);
  run(executable, [
    "--yes", "fn", "deploy", functionDir.name,
    "-e", envId,
    "--force",
    "--deployMode", "zip"
  ], { cwd: functionDir.path, failureMessage: `云函数 ${functionDir.name} 部署失败，后续函数未部署。` });

  const timeout = functionTimeouts.get(functionDir.name);
  console.log(`==> 设置 ${functionDir.name} 超时为 ${timeout} 秒`);
  run(executable, [
    "-r", region,
    "api", "scf", "UpdateFunctionConfiguration",
    "--body", JSON.stringify({ FunctionName: functionDir.name, Namespace: envId, Timeout: timeout }),
    "--json"
  ], { failureMessage: `云函数 ${functionDir.name} 超时配置失败。可通过 TCB_REGION 指定环境地域后重试。` });
}

const deployedFunctions = cloudFunctions();
for (const name of expectedFunctions) {
  const deployed = deployedFunctions.find((item) => item?.name === name);
  if (!deployed) fail(`部署后未找到函数 ${name}，请检查 CloudBase 控制台。`);
  if (deployed.status && !String(deployed.status).toLowerCase().includes("completed")) {
    fail(`函数 ${name} 部署后状态为 ${deployed.status}，请检查 CloudBase 控制台。`);
  }
}

console.log("\n云函数部署完成，五个目标函数状态正常。");

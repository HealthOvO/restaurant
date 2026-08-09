import { existsSync, readdirSync } from "node:fs";
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
if (!existsSync(functionsRoot)) {
  console.error(`未找到云函数产物目录：${functionsRoot}。请先执行 npm run build:cloudfunctions`);
  process.exit(1);
}

const functionDirs = readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ name: entry.name, path: join(functionsRoot, entry.name) }))
  .sort((left, right) => left.name.localeCompare(right.name));

if (!functionDirs.length) {
  console.error("未发现任何云函数目录，请先构建云函数。");
  process.exit(1);
}

console.log(`准备部署 ${functionDirs.length} 个云函数到环境 ${envId}`);
const executable = process.platform === "win32" ? "tcb.cmd" : "tcb";
for (const functionDir of functionDirs) {
  console.log(`\n==> 部署云函数 ${functionDir.name}`);
  const result = spawnSync(executable, [
    "fn", "deploy", functionDir.name,
    "-e", envId,
    "--force",
    "--deployMode", "zip"
  ], { cwd: functionDir.path, stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    console.error("未找到 tcb CLI。请先执行：npm install -g @cloudbase/cli");
    process.exit(1);
  }
  if (result.error || result.status !== 0) {
    console.error(`云函数 ${functionDir.name} 部署失败，请确认 tcb 登录状态和环境权限。`);
    process.exit(result.status || 1);
  }
}

console.log("\n云函数部署完成。");

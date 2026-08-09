import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const envId = process.argv[2]?.trim();
if (!envId) {
  console.error("用法：npm run deploy:admin -- <CloudBase 环境 ID>");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const adminDist = join(root, "apps", "admin-web", "dist");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

console.log(`正在为环境 ${envId} 构建商家后台`);
const buildResult = spawnSync(npmExecutable, ["run", "build:admin"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_TCB_ENV_ID: envId }
});
if (buildResult.error || buildResult.status !== 0) {
  console.error("商家后台构建失败，已停止部署。");
  process.exit(buildResult.status || 1);
}

if (!existsSync(adminDist)) {
  console.error(`未找到后台构建产物：${adminDist}`);
  process.exit(1);
}

console.log(`准备把后台静态站点部署到环境 ${envId}`);
const executable = process.platform === "win32" ? "tcb.cmd" : "tcb";
const result = spawnSync(executable, ["hosting", "deploy", adminDist, "-e", envId], {
  cwd: root,
  stdio: "inherit"
});
if (result.error?.code === "ENOENT") {
  console.error("未找到 tcb CLI。请先执行：npm install -g @cloudbase/cli");
  process.exit(1);
}
if (result.error || result.status !== 0) {
  console.error("后台静态站点部署失败，请确认 tcb 登录状态和环境权限。");
  process.exit(result.status || 1);
}

console.log("\n后台静态站点部署完成。");

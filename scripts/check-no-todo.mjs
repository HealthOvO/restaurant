import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = [
  "apps/admin-web/src",
  "apps/miniprogram/miniprogram",
  "cloudfunctions/src",
  "packages/shared/src",
  "scripts",
  "docs",
  "README.md"
];
const excludedRelativePaths = new Set(["scripts/check-no-todo.mjs"]);
const allowedExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".wxml",
  ".wxss",
  ".wxs",
  ".ps1"
]);
const todoPattern = /\b(TODO|FIXME)\b/;

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function walk(filePath, matches) {
  const relativePath = normalizeRelativePath(path.relative(rootDir, filePath));
  if (excludedRelativePaths.has(relativePath)) {
    return;
  }

  const stats = await fs.stat(filePath);
  if (stats.isDirectory()) {
    const entries = await fs.readdir(filePath, { withFileTypes: true });
    for (const entry of entries) {
      await walk(path.join(filePath, entry.name), matches);
    }
    return;
  }

  if (!allowedExtensions.has(path.extname(filePath))) {
    return;
  }

  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (todoPattern.test(line)) {
      matches.push(`${relativePath}:${index + 1}:${line.trim()}`);
    }
  });
}

async function main() {
  const matches = [];

  for (const relativePath of scanRoots) {
    const absolutePath = path.join(rootDir, relativePath);
    try {
      await fs.access(absolutePath);
      await walk(absolutePath, matches);
    } catch {
      // Skip paths that are not present in the current workspace.
    }
  }

  if (matches.length > 0) {
    console.error("Found unresolved TODO/FIXME markers:");
    matches.forEach((match) => {
      console.error(`- ${match}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log("No TODO/FIXME markers found in source and docs.");
}

await main();

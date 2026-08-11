import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dirname, "..", "miniprogram");

function javascriptFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const filename = resolve(directory, name);
    return statSync(filename).isDirectory()
      ? javascriptFiles(filename)
      : (name.endsWith(".js") ? [filename] : []);
  });
}

const failures = [];
for (const filename of javascriptFiles(sourceRoot)) {
  const result = spawnSync(process.execPath, ["--check", filename], { encoding: "utf8" });
  if (result.status !== 0) failures.push(result.stderr || result.stdout || filename);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Mini-program JavaScript syntax check passed.\n");
}

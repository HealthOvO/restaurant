import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = "release";

const entries = [
  { source: "v2.customer-api", deployName: "v2-customer-api" },
  { source: "v2.owner-api", deployName: "v2-owner-api" },
  { source: "v2.system-api", deployName: "v2-system-api" },
  { source: "v2.payment-notify", deployName: "v2-payment-notify" },
  { source: "v2.refund-notify", deployName: "v2-refund-notify" }
];

await rm(OUTPUT_DIR, {
  recursive: true,
  force: true
});

await Promise.all(
  entries.map(async ({ source, deployName }) => {
    const functionDir = path.join(OUTPUT_DIR, deployName);
    await mkdir(functionDir, { recursive: true });
    await build({
      entryPoints: [`src/handlers/${source}.ts`],
      outfile: path.join(functionDir, "index.js"),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      external: ["wx-server-sdk"],
      sourcemap: true
    });
    await writeFile(
      path.join(functionDir, "package.json"),
      JSON.stringify(
        {
          name: deployName,
          version: "0.1.0",
          main: "index.js",
          dependencies: {
            "wx-server-sdk": "^3.0.1"
          }
        },
        null,
        2
      )
    );
  })
);

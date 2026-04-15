import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = "release";

const entries = [
  { source: "auth.login", deployName: "auth-login" },
  { source: "staff.profile", deployName: "staff-profile" },
  { source: "bootstrap.storeOwner", deployName: "bootstrap-store-owner" },
  { source: "member.bootstrap", deployName: "member-bootstrap" },
  { source: "member.state", deployName: "member-state" },
  { source: "member.records", deployName: "member-records" },
  { source: "member.feedback.submit", deployName: "member-feedback-submit" },
  { source: "member.feedback.mine", deployName: "member-feedback-mine" },
  { source: "menu.catalog", deployName: "menu-catalog" },
  { source: "order.preview", deployName: "order-preview" },
  { source: "order.create", deployName: "order-create" },
  { source: "order.listMine", deployName: "order-list-mine" },
  { source: "order.detail", deployName: "order-detail" },
  { source: "invite.bind", deployName: "invite-bind" },
  { source: "invite.overview", deployName: "invite-overview" },
  { source: "visit.settleFirstVisit", deployName: "visit-settle-first-visit" },
  { source: "voucher.listMine", deployName: "voucher-list-mine" },
  { source: "voucher.redeem", deployName: "voucher-redeem" },
  { source: "points.redeem", deployName: "points-redeem" },
  { source: "staff.feedback.submit", deployName: "staff-feedback-submit" },
  { source: "staff.feedback.mine", deployName: "staff-feedback-mine" },
  { source: "staff.member.search", deployName: "staff-member-search" },
  { source: "staff.order.list", deployName: "staff-order-list" },
  { source: "staff.order.detail", deployName: "staff-order-detail" },
  { source: "staff.order.update", deployName: "staff-order-update" },
  { source: "admin.dashboard", deployName: "admin-dashboard" },
  { source: "admin.opsTasks.list", deployName: "admin-ops-tasks-list" },
  { source: "admin.opsTasks.retry", deployName: "admin-ops-tasks-retry" },
  { source: "admin.opsTasks.resolve", deployName: "admin-ops-tasks-resolve" },
  { source: "admin.menu.list", deployName: "admin-menu-list" },
  { source: "admin.menu.save", deployName: "admin-menu-save" },
  { source: "admin.orders.query", deployName: "admin-orders-query" },
  { source: "admin.rules.list", deployName: "admin-rules-list" },
  { source: "admin.members.query", deployName: "admin-members-query" },
  { source: "admin.rules.save", deployName: "admin-rules-save" },
  { source: "admin.feedback.list", deployName: "admin-feedback-list" },
  { source: "admin.feedback.update", deployName: "admin-feedback-update" },
  { source: "admin.binding.adjust", deployName: "admin-binding-adjust" },
  { source: "admin.points.adjust", deployName: "admin-points-adjust" },
  { source: "admin.staff.manage", deployName: "admin-staff-manage" },
  { source: "admin.audit.list", deployName: "admin-audit-list" },
  { source: "ops.initDatabase", deployName: "ops-init-database" }
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

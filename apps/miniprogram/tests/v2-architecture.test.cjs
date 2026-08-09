const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "miniprogram");

test("V2 manifest exposes only customer ordering pages", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  assert.deepEqual(manifest.pages, [
    "pages/home/home",
    "pages/orders/orders",
    "pages/benefits/benefits",
    "pages/profile/profile",
    "pages/checkout/checkout",
    "pages/payment-result/payment-result",
    "pages/coupon-use/coupon-use"
  ]);
  assert.equal(JSON.stringify(manifest).includes("staff"), false);
  assert.equal(JSON.stringify(manifest).includes("店员"), false);
});

test("V2 customer API uses one trusted cloud function and never submits storeId", () => {
  const source = fs.readFileSync(path.join(root, "services", "v2.js"), "utf8");
  assert.match(source, /name:\s*"v2-customer-api"/);
  assert.doesNotMatch(source, /storeId|STORE_ID|staff/);
  assert.match(source, /order\.mockPay/);
});

test("active customer pages contain no legacy staff or AI-assistant wording", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const source = manifest.pages.flatMap((page) => ["js", "wxml", "wxss", "json"].map((ext) => {
    const filename = path.join(root, `${page}.${ext}`);
    return fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "";
  })).join("\n");
  assert.doesNotMatch(source, /店员|staff|智能助手|机器人|大模型|AI\s*助手/i);
});

test("customer app uses the current Xiongfei brand and CloudBase project config", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const project = JSON.parse(fs.readFileSync(path.join(root, "..", "project.config.json"), "utf8"));
  const source = fs.readFileSync(path.join(root, "pages", "profile", "profile.js"), "utf8");
  assert.equal(manifest.window.navigationBarTitleText, "雄飞肉片");
  assert.equal(project.projectname, "xiongfei-ordering-v2");
  assert.equal(project.appid, "wx547edd316e3cb6b1");
  assert.match(source, /来雄飞肉片一起吃一碗/);
  assert.doesNotMatch(JSON.stringify({ manifest, project, source }), /阿福肉片/);
});

test("refunded orders do not claim that points are still earned", () => {
  const source = fs.readFileSync(path.join(root, "pages", "orders", "orders.wxml"), "utf8");
  assert.match(source, /item\.status !== 'REFUNDED'/);
  assert.match(source, /本单积分已退回/);
});

test("home refreshes points whenever the tab becomes visible", () => {
  const source = fs.readFileSync(path.join(root, "pages", "home", "home.js"), "utf8");
  assert.match(source, /onShow\(\)\s*\{[\s\S]*?this\.loadHome\(\);[\s\S]*?\}/);
});

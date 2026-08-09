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
    "pages/payment-result/payment-result"
  ]);
  assert.equal(JSON.stringify(manifest).includes("staff"), false);
  assert.equal(JSON.stringify(manifest).includes("店员"), false);
  assert.equal(manifest.lazyCodeLoading, "requiredComponents");
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
  const orders = fs.readFileSync(path.join(root, "pages", "orders", "orders.wxml"), "utf8");
  const result = fs.readFileSync(path.join(root, "pages", "payment-result", "payment-result.wxml"), "utf8");
  assert.match(orders, /item\.status !== 'REFUNDED'/);
  assert.match(orders, /本单积分已回收/);
  assert.match(result, /order\.status === 'WAITING_FULFILLMENT'.*order\.status === 'COMPLETED'/);
  assert.match(result, /本单.*积分已回收/);
});

test("all tab pages reuse fresh data instead of showing a loader on every switch", () => {
  for (const page of ["home", "orders", "benefits", "profile"]) {
    const source = fs.readFileSync(path.join(root, "pages", page, `${page}.js`), "utf8");
    assert.match(source, /isCacheFresh/);
    assert.match(source, /onShow\(\)/);
  }
});

test("tab pages avoid array destructuring helpers missing from the mini-program runtime", () => {
  for (const page of ["benefits", "profile", "home"]) {
    const source = fs.readFileSync(path.join(root, "pages", page, `${page}.js`), "utf8");
    assert.doesNotMatch(source, /then\s*\(\s*\(\s*\[/);
  }
});

test("checkout copy stays concise and does not promise a future pickup number", () => {
  const checkout = fs.readFileSync(path.join(root, "pages", "checkout", "checkout.wxml"), "utf8");
  const home = fs.readFileSync(path.join(root, "pages", "home", "home.wxml"), "utf8");
  assert.doesNotMatch(checkout, /生成取餐号|请留意取餐号|这单吃什么/);
  assert.doesNotMatch(`${checkout}\n${home}`, /预计/);
});

test("ordering page exposes merchant categories, coupons and an expandable cart", () => {
  const home = fs.readFileSync(path.join(root, "pages", "home", "home.wxml"), "utf8");
  const cart = fs.readFileSync(path.join(root, "utils", "v2-cart.js"), "utf8");
  assert.match(home, /category-rail/);
  assert.match(home, /商品券/);
  assert.match(home, /cart-sheet/);
  assert.match(cart, /COUPON_ALREADY_IN_CART/);
});

test("benefits coupon actions use a full-width layout without the clipped side rail", () => {
  const markup = fs.readFileSync(path.join(root, "pages", "benefits", "benefits.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(root, "pages", "benefits", "benefits.wxss"), "utf8");
  assert.match(markup, /coupon-use-button/);
  assert.match(markup, /还差.*pointsGap.*积分/);
  assert.doesNotMatch(`${markup}\n${styles}`, /coupon-side/);
});

test("closing paid ordering does not disable issued coupons", () => {
  const benefits = fs.readFileSync(path.join(root, "pages", "benefits", "benefits.wxml"), "utf8");
  const couponUse = fs.readFileSync(path.join(root, "pages", "coupon-use", "coupon-use.wxml"), "utf8");
  assert.doesNotMatch(`${benefits}\n${couponUse}`, /businessOpen|暂停接单|恢复营业后可使用商品券/);
  assert.match(benefits, />使用商品券<\/button>/);
  assert.match(couponUse, />确认使用<\/button>/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..", "miniprogram");

function mockModule(filename, exports, mocked) {
  const resolved = require.resolve(filename);
  mocked.push(resolved);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function createPage(definition) {
  const page = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(updates) { this.data = { ...this.data, ...updates }; }
  };
  Object.entries(definition).forEach(([key, value]) => {
    if (key !== "data") page[key] = value;
  });
  return page;
}

test("app preloads all tab caches into the generation created by payment invalidation", async () => {
  const appPath = path.join(root, "app.js");
  const apiPath = path.join(root, "services", "v2.js");
  const cartPath = path.join(root, "utils", "v2-cart.js");
  const cache = require(path.join(root, "utils", "v2-cache.js"));
  const mocked = [];
  const previousApp = global.App;
  let definition;
  const calls = new Map();
  const track = (name, value) => async () => {
    calls.set(name, (calls.get(name) || 0) + 1);
    return value;
  };
  mockModule(apiPath, {
    getHome: track("home", { member: { pointsBalance: 20 }, products: [] }),
    listOrders: track("orders", { rows: [{ _id: "order-new" }], nextCursor: "" }),
    listCoupons: track("coupons", [{ _id: "coupon-new" }]),
    listPoints: track("points", { balance: 20, rows: [{ _id: "point-new" }] }),
    getInviteOverview: track("profile", { inviteCode: "NEW001" })
  }, mocked);
  mockModule(cartPath, { loadCart: () => [] }, mocked);
  global.App = (value) => { definition = value; };
  cache.clearCache();
  cache.writeCache("home", { member: { pointsBalance: 10 } });
  cache.writeCache("orders", { rows: [{ _id: "order-old" }] });
  cache.writeCache("benefits", { home: { member: { pointsBalance: 10 } } });
  cache.writeCache("profile", { home: { member: { pointsBalance: 10 } } });
  cache.invalidateCache("home", "orders", "benefits", "profile");

  delete require.cache[require.resolve(appPath)];
  try {
    require(appPath);
    const app = { ...definition, globalData: { ...definition.globalData } };
    await app.preloadTabs();

    assert.equal(cache.readCache("home").member.pointsBalance, 20);
    assert.deepEqual(cache.readCache("orders").rows.map((item) => item._id), ["order-new"]);
    assert.equal(cache.readCache("benefits").points.balance, 20);
    assert.equal(cache.readCache("profile").home.member.pointsBalance, 20);
    assert.equal(app.globalData.home.member.pointsBalance, 20);
    assert.equal(app.globalData.tabPreloadPromise instanceof Promise, true);
    assert.deepEqual(Object.fromEntries(calls), { home: 1, orders: 1, coupons: 1, points: 1, profile: 1 });
  } finally {
    cache.clearCache();
    delete require.cache[require.resolve(appPath)];
    mocked.forEach((entry) => delete require.cache[entry]);
    if (previousApp === undefined) delete global.App; else global.App = previousApp;
  }
});

test("an invalidated preload cannot overwrite a newer cache generation", async () => {
  const appPath = path.join(root, "app.js");
  const apiPath = path.join(root, "services", "v2.js");
  const cartPath = path.join(root, "utils", "v2-cart.js");
  const cache = require(path.join(root, "utils", "v2-cache.js"));
  const mocked = [];
  const previousApp = global.App;
  let definition;
  let resolveHome;
  const homeRequest = new Promise((resolve) => { resolveHome = resolve; });
  mockModule(apiPath, {
    getHome: () => homeRequest,
    listOrders: async () => ({ rows: [] }),
    listCoupons: async () => [],
    listPoints: async () => ({ balance: 30, rows: [] }),
    getInviteOverview: async () => ({ inviteCode: "STALE" })
  }, mocked);
  mockModule(cartPath, { loadCart: () => [] }, mocked);
  global.App = (value) => { definition = value; };
  cache.clearCache();

  delete require.cache[require.resolve(appPath)];
  try {
    require(appPath);
    const app = { ...definition, globalData: { ...definition.globalData } };
    const preload = app.preloadTabs();
    cache.invalidateCache("home", "benefits", "profile");
    cache.writeCache("home", { member: { pointsBalance: 40 } });
    resolveHome({ member: { pointsBalance: 30 } });
    await preload;

    assert.equal(cache.readCache("home").member.pointsBalance, 40);
    assert.equal(cache.readCache("benefits"), undefined);
    assert.equal(cache.readCache("profile"), undefined);
  } finally {
    cache.clearCache();
    delete require.cache[require.resolve(appPath)];
    mocked.forEach((entry) => delete require.cache[entry]);
    if (previousApp === undefined) delete global.App; else global.App = previousApp;
  }
});

test("checkout cart refresh detaches a stale home read and reconciles with the latest product version", async () => {
  const pagePath = path.join(root, "pages", "checkout", "checkout.js");
  const apiPath = path.join(root, "services", "v2.js");
  const cache = require(path.join(root, "utils", "v2-cache.js"));
  const previous = { Page: global.Page, wx: global.wx, getApp: global.getApp };
  const pendingHome = [];
  const storage = new Map();
  const app = { globalData: { cart: [] } };
  let definition;
  let homeCalls = 0;

  const productAtVersion = (version) => ({
    _id: "product-1",
    version,
    name: version === 1 ? "旧名称肉片" : "新名称肉片",
    imageUrl: "",
    basePrice: 1500,
    enabled: true,
    soldOut: false,
    pointsEnabled: true,
    buyerPointsPerUnit: 10,
    inviterPointsPerUnit: 1,
    specGroups: []
  });
  const resolveHome = (product) => {
    const resolve = pendingHome.shift();
    assert.ok(resolve, "expected a pending home.get call");
    resolve({ result: { ok: true, data: { products: [product], coupons: [] } } });
  };

  global.wx = {
    cloud: {
      callFunction({ data }) {
        assert.equal(data.action, "home.get");
        homeCalls += 1;
        return new Promise((resolve) => pendingHome.push(resolve));
      }
    },
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    showModal: () => {}
  };
  global.getApp = () => app;
  global.Page = (value) => { definition = value; };
  cache.clearCache();
  delete require.cache[require.resolve(apiPath)];
  delete require.cache[require.resolve(pagePath)];

  try {
    const api = require(apiPath);
    const bootstrap = api.getHome();
    resolveHome(productAtVersion(1));
    await bootstrap;

    const staleHome = api.getHome();
    assert.equal(homeCalls, 2);
    require(pagePath);
    const page = createPage(definition);
    const rawCart = [{
      kind: "PAID",
      key: "paid|product-1|",
      productId: "product-1",
      productVersion: 1,
      productName: "旧名称肉片",
      basePrice: 1500,
      unitPrice: 1500,
      buyerPointsPerUnit: 10,
      quantity: 1,
      selections: [],
      selectedChoices: []
    }];
    const generationBefore = cache.cacheGeneration("home");
    const refresh = page.refreshChangedCart(rawCart);
    await Promise.resolve();

    assert.equal(homeCalls, 3);
    assert.equal(cache.cacheGeneration("home"), generationBefore + 1);
    resolveHome(productAtVersion(1));
    await staleHome;
    const joinedFreshHome = api.getHome();
    assert.equal(homeCalls, 3);
    resolveHome(productAtVersion(2));
    await Promise.all([refresh, joinedFreshHome]);

    assert.equal(page.rawCart[0].productVersion, 2);
    assert.equal(page.rawCart[0].productName, "新名称肉片");
    assert.equal(storage.get("fuding-cart-v2")[0].productVersion, 2);
    assert.equal(app.globalData.cart[0].productVersion, 2);
  } finally {
    cache.clearCache();
    delete require.cache[require.resolve(apiPath)];
    delete require.cache[require.resolve(pagePath)];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  }
});

test("payment invalidation detaches old single-flight reads and preloads fresh tab data immediately", async () => {
  const appPath = path.join(root, "app.js");
  const pagePath = path.join(root, "pages", "payment-result", "payment-result.js");
  const apiPath = path.join(root, "services", "v2.js");
  const cartPath = path.join(root, "utils", "v2-cart.js");
  const cache = require(path.join(root, "utils", "v2-cache.js"));
  const mocked = [];
  const previous = { App: global.App, Page: global.Page, wx: global.wx, getApp: global.getApp };
  const pending = new Map();
  const callCounts = new Map();
  let appDefinition;
  let pageDefinition;

  function resolveNext(action, data) {
    const queue = pending.get(action) || [];
    assert.ok(queue.length, `expected a pending ${action} call`);
    queue.shift()({ result: { ok: true, data } });
  }

  global.wx = {
    cloud: {
      callFunction({ data }) {
        callCounts.set(data.action, (callCounts.get(data.action) || 0) + 1);
        return new Promise((resolve) => {
          const queue = pending.get(data.action) || [];
          queue.push(resolve);
          pending.set(data.action, queue);
        });
      }
    },
    removeStorageSync: () => {}
  };
  mockModule(cartPath, { loadCart: () => [], clearCart: () => {} }, mocked);
  delete require.cache[require.resolve(apiPath)];
  delete require.cache[require.resolve(appPath)];
  delete require.cache[require.resolve(pagePath)];
  cache.clearCache();

  try {
    const api = require(apiPath);
    const bootstrap = api.getHome();
    resolveNext("home.get", { member: { pointsBalance: 10 } });
    await bootstrap;

    global.App = (value) => { appDefinition = value; };
    require(appPath);
    const app = { ...appDefinition, globalData: { ...appDefinition.globalData } };
    global.getApp = () => app;
    global.Page = (value) => { pageDefinition = value; };
    require(pagePath);
    const page = createPage(pageDefinition);

    cache.writeCache("home", { member: { pointsBalance: 10 } });
    cache.writeCache("orders", { rows: [{ _id: "order-old" }] });
    cache.writeCache("benefits", { home: { member: { pointsBalance: 10 } } });
    cache.writeCache("profile", { home: { member: { pointsBalance: 10 } } });

    const oldGenerations = {
      home: cache.cacheGeneration("home"), orders: cache.cacheGeneration("orders"),
      benefits: cache.cacheGeneration("benefits"), profile: cache.cacheGeneration("profile")
    };
    const oldHome = api.getHome();
    const oldOrders = api.listOrders();
    const oldCoupons = api.listCoupons();
    const oldPoints = api.listPoints();
    const oldProfile = api.getInviteOverview();
    const oldWrites = [
      oldHome.then((home) => cache.writeCacheIfCurrent("home", home, oldGenerations.home)),
      oldOrders.then((orders) => cache.writeCacheIfCurrent("orders", orders, oldGenerations.orders)),
      Promise.all([oldHome, oldCoupons, oldPoints]).then(([home, coupons, points]) => (
        cache.writeCacheIfCurrent("benefits", { home, coupons, points }, oldGenerations.benefits)
      )),
      Promise.all([oldHome, oldProfile]).then(([home, overview]) => (
        cache.writeCacheIfCurrent("profile", { home, overview }, oldGenerations.profile)
      ))
    ];
    await Promise.resolve();
    page.finishSuccess({ _id: "order-new", status: "WAITING_FULFILLMENT", buyerPoints: 10 });
    await Promise.resolve();

    assert.deepEqual(Object.fromEntries(callCounts), {
      "home.get": 3,
      "order.listMinePage": 2,
      "coupon.listMine": 2,
      "points.list": 2,
      "invite.overview": 2
    });

    resolveNext("home.get", { member: { pointsBalance: 10 } });
    resolveNext("order.listMinePage", { rows: [{ _id: "order-old" }] });
    resolveNext("coupon.listMine", []);
    resolveNext("points.list", { balance: 10, rows: [] });
    resolveNext("invite.overview", { inviteCode: "OLD001" });
    await Promise.all(oldWrites);

    const joinedFreshReads = [
      api.getHome(), api.listOrders(), api.listCoupons(), api.listPoints(), api.getInviteOverview()
    ];
    await Promise.resolve();
    assert.deepEqual(Object.fromEntries(callCounts), {
      "home.get": 3,
      "order.listMinePage": 2,
      "coupon.listMine": 2,
      "points.list": 2,
      "invite.overview": 2
    });

    resolveNext("home.get", { member: { pointsBalance: 20 } });
    resolveNext("order.listMinePage", { rows: [{ _id: "order-new" }] });
    resolveNext("coupon.listMine", [{ _id: "coupon-new" }]);
    resolveNext("points.list", { balance: 20, rows: [{ _id: "point-new" }] });
    resolveNext("invite.overview", { inviteCode: "NEW001" });
    await Promise.all([page.tabPreloadRequest, ...joinedFreshReads]);

    assert.equal(cache.readCache("home").member.pointsBalance, 20);
    assert.deepEqual(cache.readCache("orders").rows.map((item) => item._id), ["order-new"]);
    assert.equal(cache.readCache("benefits").points.balance, 20);
    assert.equal(cache.readCache("profile").home.member.pointsBalance, 20);
  } finally {
    cache.clearCache();
    delete require.cache[require.resolve(apiPath)];
    delete require.cache[require.resolve(appPath)];
    delete require.cache[require.resolve(pagePath)];
    mocked.forEach((entry) => delete require.cache[entry]);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  }
});

test("payment success invalidates caches and read single-flights only once", async () => {
  const pagePath = path.join(root, "pages", "payment-result", "payment-result.js");
  const apiPath = path.join(root, "services", "v2.js");
  const cachePath = path.join(root, "utils", "v2-cache.js");
  const cartPath = path.join(root, "utils", "v2-cart.js");
  const mocked = [];
  const previous = { Page: global.Page, wx: global.wx, getApp: global.getApp };
  const invalidations = [];
  let definition;
  let preloadCalls = 0;
  let readInvalidations = 0;
  mockModule(apiPath, {
    invalidateCurrentReads: () => { readInvalidations += 1; },
    queryPayment: async () => ({ status: "WAITING_FULFILLMENT" })
  }, mocked);
  mockModule(cachePath, { invalidateCache: (...keys) => invalidations.push(keys) }, mocked);
  mockModule(cartPath, { clearCart: () => {} }, mocked);
  global.Page = (value) => { definition = value; };
  global.wx = { removeStorageSync: () => {} };
  global.getApp = () => ({
    preloadTabs() {
      preloadCalls += 1;
      return Promise.resolve();
    }
  });

  delete require.cache[require.resolve(pagePath)];
  try {
    require(pagePath);
    const page = createPage(definition);
    page.finishSuccess({ _id: "order-new", status: "WAITING_FULFILLMENT" });
    page.finishTerminal({ _id: "order-new", status: "REFUNDING" }, "退款处理中");
    await page.tabPreloadRequest;

    assert.deepEqual(invalidations, [["home", "orders", "benefits", "profile"]]);
    assert.equal(readInvalidations, 1);
    assert.equal(preloadCalls, 1);
    assert.equal(page.terminal, true);
  } finally {
    delete require.cache[require.resolve(pagePath)];
    mocked.forEach((entry) => delete require.cache[entry]);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  }
});

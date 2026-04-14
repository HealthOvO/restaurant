const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const storeContextPath = path.join(__dirname, "..", "miniprogram", "utils", "store-context.js");

test("resolveStoreLaunchContext reads storeId and inviteCode from query and scene", async () => {
  delete require.cache[require.resolve(storeContextPath)];
  const { resolveStoreLaunchContext } = require(storeContextPath);

  assert.deepEqual(
    resolveStoreLaunchContext({
      scene: "storeId=branch-01&inviteCode=m0008"
    }),
    {
      storeId: "branch-01",
      inviteCode: "M0008"
    }
  );

  assert.deepEqual(
    resolveStoreLaunchContext({
      storeId: "branch-02",
      inviteCode: "ab12"
    }),
    {
      storeId: "branch-02",
      inviteCode: "AB12"
    }
  );
});

test("applyStoreLaunchContext switches scoped store and clears cached staff session", async () => {
  const storage = new Map([
    ["storeId", "default-store"],
    ["staffSessionToken", "token-1"],
    ["staffProfile", { username: "staff01" }]
  ]);

  const previousWx = global.wx;
  const previousGetApp = global.getApp;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key);
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      removeStorageSync(key) {
        storage.delete(key);
      }
    };
    const app = {
      globalData: {
        storeId: "default-store",
        inviteCode: "",
        member: { _id: "member-1" },
        relation: { _id: "rel-1" },
        staffProfile: { username: "staff01" },
        staffSessionToken: "token-1"
      }
    };
    global.getApp = () => app;

    delete require.cache[require.resolve(storeContextPath)];
    const { applyStoreLaunchContext } = require(storeContextPath);
    const result = applyStoreLaunchContext({
      scene: "storeId=branch-03&inviteCode=cd98"
    });

    assert.deepEqual(result, {
      storeId: "branch-03",
      inviteCode: "CD98",
      storeChanged: true
    });
    assert.equal(app.globalData.storeId, "branch-03");
    assert.equal(app.globalData.inviteCode, "CD98");
    assert.equal(app.globalData.member, null);
    assert.equal(app.globalData.relation, null);
    assert.equal(app.globalData.staffProfile, null);
    assert.equal(app.globalData.staffSessionToken, "");
    assert.equal(storage.get("storeId"), "branch-03");
    assert.equal(storage.has("staffSessionToken"), false);
  } finally {
    delete require.cache[require.resolve(storeContextPath)];
    if (typeof previousWx === "undefined") {
      delete global.wx;
    } else {
      global.wx = previousWx;
    }

    if (typeof previousGetApp === "undefined") {
      delete global.getApp;
    } else {
      global.getApp = previousGetApp;
    }
  }
});

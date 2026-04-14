const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const cloudServicePath = path.join(__dirname, "..", "miniprogram", "services", "cloud.js");

test("callFunction injects current storeId into cloud function payloads", async () => {
  const previousWx = global.wx;
  const previousGetApp = global.getApp;

  try {
    global.getApp = () => ({
      globalData: {
        storeId: "branch-01"
      }
    });
    global.wx = {
      cloud: {
        callFunction: async (payload) => ({
          result: {
            ok: true,
            echoed: payload.data
          }
        })
      }
    };

    delete require.cache[require.resolve(cloudServicePath)];
    const { callFunction } = require(cloudServicePath);
    const response = await callFunction("member-state", {
      scene: "test-scene"
    });

    assert.deepEqual(response.echoed, {
      scene: "test-scene",
      storeId: "branch-01"
    });
  } finally {
    delete require.cache[require.resolve(cloudServicePath)];
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

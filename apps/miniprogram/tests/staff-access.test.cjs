const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const miniProgramRoot = path.join(__dirname, "..", "miniprogram");

function loadStaffAccess(moduleMocks, globals) {
  const modulePath = path.join(miniProgramRoot, "utils", "staff-access.js");
  const mockedModules = [];
  const previousWx = global.wx;
  const previousGetCurrentPages = global.getCurrentPages;

  if (globals && Object.prototype.hasOwnProperty.call(globals, "wx")) {
    global.wx = globals.wx;
  } else {
    delete global.wx;
  }

  if (globals && Object.prototype.hasOwnProperty.call(globals, "getCurrentPages")) {
    global.getCurrentPages = globals.getCurrentPages;
  } else {
    delete global.getCurrentPages;
  }

  Object.entries(moduleMocks || {}).forEach(([request, exports]) => {
    const resolved = require.resolve(path.resolve(path.dirname(modulePath), request));
    mockedModules.push(resolved);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports
    };
  });

  delete require.cache[require.resolve(modulePath)];
  const api = require(modulePath);

  return {
    api,
    restore() {
      delete require.cache[require.resolve(modulePath)];
      mockedModules.forEach((resolved) => {
        delete require.cache[resolved];
      });

      if (typeof previousWx === "undefined") {
        delete global.wx;
      } else {
        global.wx = previousWx;
      }

      if (typeof previousGetCurrentPages === "undefined") {
        delete global.getCurrentPages;
      } else {
        global.getCurrentPages = previousGetCurrentPages;
      }
    }
  };
}

function createWxMock() {
  return {
    toastCalls: [],
    redirectToCalls: [],
    showToast(options) {
      this.toastCalls.push(options);
    },
    redirectTo(options) {
      this.redirectToCalls.push(options);
    }
  };
}

test("requireStaffAccess preserves page query params when redirecting to login", async () => {
  const wx = createWxMock();
  const savedRedirects = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => {
    if (typeof callback === "function") {
      callback();
    }
    return 1;
  };

  const moduleRef = loadStaffAccess(
    {
      "../services/staff": {
        fetchStaffProfile: async () => ({})
      },
      "./session": {
        getAppState: () => ({
          staffSessionToken: ""
        }),
        saveStaffSession: () => {},
        saveStaffRedirectPath: (value) => {
          savedRedirects.push(value);
        },
        clearStaffSession: () => {}
      }
    },
    {
      wx,
      getCurrentPages: () => [
        {
          route: "pages/staff-order-detail/staff-order-detail",
          options: {
            orderId: "order-1",
            from: "board"
          }
        }
      ]
    }
  );

  try {
    const result = await moduleRef.api.requireStaffAccess();

    assert.equal(result, null);
    assert.deepEqual(savedRedirects, ["/pages/staff-order-detail/staff-order-detail?orderId=order-1&from=board"]);
    assert.equal(wx.toastCalls.length, 1);
    assert.equal(wx.toastCalls[0].title, "请先登录店员账号");
    assert.equal(wx.redirectToCalls.length, 1);
    assert.equal(wx.redirectToCalls[0].url, "/pages/staff-login/staff-login");
  } finally {
    global.setTimeout = originalSetTimeout;
    moduleRef.restore();
  }
});

test("requireStaffAccess keeps page query params when session becomes invalid", async () => {
  const wx = createWxMock();
  const savedRedirects = [];
  let clearCount = 0;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => {
    if (typeof callback === "function") {
      callback();
    }
    return 1;
  };

  const moduleRef = loadStaffAccess(
    {
      "../services/staff": {
        fetchStaffProfile: async () => {
          throw {
            code: "INVALID_SESSION_SCOPE",
            message: "当前登录环境无效，请重新登录"
          };
        }
      },
      "./session": {
        getAppState: () => ({
          staffSessionToken: "token-expired"
        }),
        saveStaffSession: () => {},
        saveStaffRedirectPath: (value) => {
          savedRedirects.push(value);
        },
        clearStaffSession: () => {
          clearCount += 1;
        }
      }
    },
    {
      wx,
      getCurrentPages: () => [
        {
          route: "pages/staff-visit/staff-visit",
          options: {
            query: "M0008"
          }
        }
      ]
    }
  );

  try {
    const result = await moduleRef.api.requireStaffAccess();

    assert.equal(result, null);
    assert.equal(clearCount, 1);
    assert.deepEqual(savedRedirects, ["/pages/staff-visit/staff-visit?query=M0008"]);
    assert.equal(wx.toastCalls.length, 1);
    assert.equal(wx.toastCalls[0].title, "当前登录环境无效，请重新登录");
    assert.equal(wx.redirectToCalls.length, 1);
    assert.equal(wx.redirectToCalls[0].url, "/pages/staff-login/staff-login");
  } finally {
    global.setTimeout = originalSetTimeout;
    moduleRef.restore();
  }
});

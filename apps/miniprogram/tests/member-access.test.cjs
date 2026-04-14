const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "miniprogram", "utils", "member-access.js");

function loadMemberAccess(moduleMocks, globals) {
  const mockedModules = [];
  const previousGetApp = global.getApp;

  if (globals && Object.prototype.hasOwnProperty.call(globals, "getApp")) {
    global.getApp = globals.getApp;
  } else {
    delete global.getApp;
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
  const memberAccess = require(modulePath);

  return {
    memberAccess,
    restore() {
      delete require.cache[require.resolve(modulePath)];
      mockedModules.forEach((resolved) => {
        delete require.cache[resolved];
      });

      if (typeof previousGetApp === "undefined") {
        delete global.getApp;
      } else {
        global.getApp = previousGetApp;
      }
    }
  };
}

test("refreshMemberState prefers the lightweight member-state read path for existing members", async () => {
  const appState = {
    inviteCode: "",
    member: null,
    relation: null
  };
  let bootstrapCalls = 0;
  let memberStateCalls = 0;
  const loader = loadMemberAccess(
    {
      "../services/member": {
        fetchMemberState: async () => {
          memberStateCalls += 1;
          return {
            member: {
              _id: "member-1",
              memberCode: "M0001"
            },
            relation: {
              inviterMemberId: "member-2",
              status: "PENDING"
            }
          };
        },
        bootstrapMember: async () => {
          bootstrapCalls += 1;
          return {};
        }
      },
      "./session": {
        getAppState: () => appState
      }
    },
    {
      getApp: () => ({
        globalData: appState
      })
    }
  );

  try {
    const result = await loader.memberAccess.refreshMemberState();

    assert.equal(memberStateCalls, 1);
    assert.equal(bootstrapCalls, 0);
    assert.equal(result.member._id, "member-1");
    assert.equal(appState.member._id, "member-1");
    assert.equal(appState.relation.status, "PENDING");
  } finally {
    loader.restore();
  }
});

test("refreshMemberState falls back to bootstrap when the member record does not exist yet", async () => {
  const appState = {
    inviteCode: "",
    member: null,
    relation: null
  };
  let bootstrapPayload = null;
  const loader = loadMemberAccess(
    {
      "../services/member": {
        fetchMemberState: async () => ({
          member: null,
          relation: null
        }),
        bootstrapMember: async (payload) => {
          bootstrapPayload = payload;
          return {
            member: {
              _id: "member-2",
              memberCode: "M0002"
            },
            relation: null
          };
        }
      },
      "./session": {
        getAppState: () => appState
      }
    },
    {
      getApp: () => ({
        globalData: appState
      })
    }
  );

  try {
    const result = await loader.memberAccess.refreshMemberState();

    assert.deepEqual(bootstrapPayload, {
      inviteCode: undefined
    });
    assert.equal(result.member._id, "member-2");
    assert.equal(appState.member.memberCode, "M0002");
    assert.equal(appState.relation, null);
  } finally {
    loader.restore();
  }
});

test("refreshMemberState replays the invite code through bootstrap until the relation is created", async () => {
  const appState = {
    inviteCode: "M0099",
    member: null,
    relation: null
  };
  let bootstrapPayload = null;
  const loader = loadMemberAccess(
    {
      "../services/member": {
        fetchMemberState: async () => ({
          member: {
            _id: "member-3",
            memberCode: "M0003"
          },
          relation: null
        }),
        bootstrapMember: async (payload) => {
          bootstrapPayload = payload;
          return {
            member: {
              _id: "member-3",
              memberCode: "M0003"
            },
            relation: {
              inviterMemberId: "member-99",
              status: "PENDING"
            }
          };
        }
      },
      "./session": {
        getAppState: () => appState
      }
    },
    {
      getApp: () => ({
        globalData: appState
      })
    }
  );

  try {
    const result = await loader.memberAccess.refreshMemberState();

    assert.deepEqual(bootstrapPayload, {
      inviteCode: "M0099"
    });
    assert.equal(result.relation.status, "PENDING");
    assert.equal(appState.inviteCode, "");
  } finally {
    loader.restore();
  }
});

test("refreshMemberState clears the cached invite code and raises a friendly error on self-invite", async () => {
  const appState = {
    inviteCode: "M0003",
    member: null,
    relation: null
  };
  const loader = loadMemberAccess(
    {
      "../services/member": {
        fetchMemberState: async () => ({
          member: {
            _id: "member-3",
            memberCode: "M0003"
          },
          relation: null
        }),
        bootstrapMember: async () => {
          const error = new Error("会员不能邀请自己");
          error.code = "SELF_INVITE_FORBIDDEN";
          throw error;
        }
      },
      "./session": {
        getAppState: () => appState
      }
    },
    {
      getApp: () => ({
        globalData: appState
      })
    }
  );

  try {
    await assert.rejects(() => loader.memberAccess.refreshMemberState(), {
      code: "SELF_INVITE_FORBIDDEN",
      message: "不能填写自己的邀请码，请换一个邀请码"
    });
    assert.equal(appState.inviteCode, "");
    assert.equal(appState.member._id, "member-3");
    assert.equal(appState.relation, null);
  } finally {
    loader.restore();
  }
});

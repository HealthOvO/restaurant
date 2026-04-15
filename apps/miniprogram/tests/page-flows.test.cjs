const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildVoucherQrPayload } = require("../miniprogram/utils/voucher-qrcode");

const miniProgramRoot = path.join(__dirname, "..", "miniprogram");

function createWxMock() {
  const storage = new Map();
  return {
    toastCalls: [],
    modalCalls: [],
    redirectToCalls: [],
    navigateToCalls: [],
    navigateBackCalls: 0,
    clipboardCalls: [],
    showToast(options) {
      this.toastCalls.push(options);
    },
    showModal(options) {
      this.modalCalls.push(options);
    },
    setClipboardData(options) {
      this.clipboardCalls.push(options);
      if (options && typeof options.success === "function") {
        options.success();
      }
    },
    nextTick(callback) {
      if (typeof callback === "function") {
        callback();
      }
    },
    redirectTo(options) {
      this.redirectToCalls.push(options);
    },
    navigateTo(options) {
      this.navigateToCalls.push(options);
    },
    navigateBack() {
      this.navigateBackCalls += 1;
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    getStorageSync(key) {
      return storage.get(key);
    },
    removeStorageSync(key) {
      storage.delete(key);
    }
  };
}

function createPageInstance(definition) {
  const page = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(updates, callback) {
      this.data = {
        ...this.data,
        ...updates
      };
      if (typeof callback === "function") {
        callback();
      }
    }
  };

  Object.keys(definition).forEach((key) => {
    if (key !== "data") {
      page[key] = definition[key];
    }
  });

  return page;
}

function loadPage(pageRelativePath, moduleMocks, globals) {
  const pagePath = path.join(miniProgramRoot, pageRelativePath);
  const mockedModules = [];
  const previousPage = global.Page;
  const previousWx = global.wx;
  const previousGetApp = global.getApp;
  let capturedDefinition = null;

  global.Page = (definition) => {
    capturedDefinition = definition;
  };

  if (globals && Object.prototype.hasOwnProperty.call(globals, "wx")) {
    global.wx = globals.wx;
  } else {
    delete global.wx;
  }

  if (globals && Object.prototype.hasOwnProperty.call(globals, "getApp")) {
    global.getApp = globals.getApp;
  } else {
    delete global.getApp;
  }

  Object.entries(moduleMocks || {}).forEach(([request, exports]) => {
    const resolved = require.resolve(path.resolve(path.dirname(pagePath), request));
    mockedModules.push(resolved);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports
    };
  });

  delete require.cache[require.resolve(pagePath)];
  require(pagePath);

  assert.ok(capturedDefinition, `Page definition not captured for ${pageRelativePath}`);

  return {
    definition: capturedDefinition,
    restore() {
      delete require.cache[require.resolve(pagePath)];
      mockedModules.forEach((resolved) => {
        delete require.cache[resolved];
      });

      if (typeof previousPage === "undefined") {
        delete global.Page;
      } else {
        global.Page = previousPage;
      }

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
  };
}

const verifiedMemberAccessMocks = {
  "../../utils/member-access": {
    refreshMemberState: async () => ({
      member: {
        _id: "member-1",
        phone: "13800000000",
        phoneVerifiedAt: "2026-04-05T10:00:00.000Z"
      },
      relation: null,
      pendingInviteCode: "",
      inviterSummary: null,
      canBindInvite: false
    })
  }
};

test("miniprogram page flows keep key feedback and guard behavior", async (t) => {
  await t.test("invite page blocks locked binding with an explicit toast", async () => {
    const wx = createWxMock();
    const bindInviteByCode = async () => {
      throw new Error("bindInviteByCode should not be called when binding is locked");
    };
    const pageModule = loadPage(
      "pages/invite/invite.js",
      {
        "../../services/member": {
          bindInviteByCode,
          fetchInviteOverview: async () => ({ overview: null })
        },
        "../../utils/member-access": {
          refreshMemberState: async () => ({ member: null, relation: null })
        },
        "../../utils/session": {
          getAppState: () => ({ member: null, relation: null })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        member: { _id: "member-1" },
        relation: { inviterMemberId: "member-2", status: "PENDING" },
        canBindInviteCode: false,
        inviteCodeInput: "ABCD1234"
      });

      await page.bindInviteCode();

      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "邀请关系已锁定");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("invite page writes relation state after a successful bind", async () => {
    const wx = createWxMock();
    const appState = { member: null, relation: null };
    const relation = {
      _id: "rel-1",
      storeId: "default-store",
      inviterMemberId: "member-2",
      inviteeMemberId: "member-1",
      status: "PENDING",
      createdAt: "2026-04-05T12:00:00.000Z",
      updatedAt: "2026-04-05T12:00:00.000Z"
    };
    const pageModule = loadPage(
      "pages/invite/invite.js",
      {
        "../../services/member": {
          bindInviteByCode: async (inviteCode) => {
            assert.equal(inviteCode, "ABCD1234");
            return { relation };
          },
          fetchInviteOverview: async () => ({ overview: null })
        },
        "../../utils/member-access": {
          refreshMemberState: async () => ({ member: null, relation: null })
        },
        "../../utils/session": {
          getAppState: () => appState
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      let refreshCount = 0;
      page.refresh = async () => {
        refreshCount += 1;
      };
      page.setData({
        member: { _id: "member-1" },
        relation: null,
        canBindInviteCode: true,
        inviteCodeInput: "ABCD1234"
      });

      await page.bindInviteCode();

      assert.equal(refreshCount, 1);
      assert.equal(appState.relation, relation);
      assert.equal(page.data.relation, relation);
      assert.equal(page.data.inviteCodeInput, "");
      assert.equal(page.data.canBindInviteCode, false);
      assert.equal(wx.toastCalls[0].title, "绑定成功");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("invite share path keeps storeId and inviteCode together", async () => {
    const wx = createWxMock();
    const appState = {
      storeId: "branch-05"
    };
    const pageModule = loadPage(
      "pages/invite/invite.js",
      {
        "../../services/member": {
          bindInviteByCode: async () => ({ relation: null }),
          fetchInviteOverview: async () => ({ overview: null })
        },
        "../../utils/member-access": {
          refreshMemberState: async () => ({ member: null, relation: null })
        },
        "../../utils/session": {
          getAppState: () => appState
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        member: {
          memberCode: "M0088"
        }
      });

      assert.deepEqual(page.onShareAppMessage(), {
        title: "来店里吃饭，一起攒积分换菜",
        path: "/pages/index/index?storeId=branch-05&inviteCode=M0088"
      });
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff visit search auto-selects an exact member match", async () => {
    const wx = createWxMock();
    const row = {
      member: {
        _id: "member-1",
        memberCode: "M0001",
        phone: "13800000000",
        phoneVerifiedAt: "2026-04-05T10:00:00.000Z",
        hasCompletedFirstVisit: false
      },
      relationStatus: null,
      readyVoucherCount: 0,
      totalVoucherCount: 0,
      totalVisitCount: 0
    };
    const pageModule = loadPage(
      "pages/staff-visit/staff-visit.js",
      {
        "../../services/staff": {
          searchMembers: async (sessionToken, query) => {
            assert.equal(sessionToken, "token-1");
            assert.equal(query, "M0001");
            return { rows: [row] };
          },
          settleFirstVisit: async () => {
            throw new Error("settleFirstVisit should not be called during search");
          }
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-1" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.search({
        queryOverride: "M0001",
        autoSelectExact: true
      });

      assert.equal(page.data.query, "M0001");
      assert.equal(page.data.rows.length, 1);
      assert.equal(page.data.hasSearched, true);
      assert.equal(page.data.selectedMemberId, "member-1");
      assert.equal(page.data.selectedMember.member._id, "member-1");
      assert.equal(wx.toastCalls.length, 0);
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff visit auto-searches when opened from member shortcuts", async () => {
    const wx = createWxMock();
    let searchPayload = null;
    const row = {
      member: {
        _id: "member-quick",
        memberCode: "M0099",
        phone: "13800009999",
        phoneVerifiedAt: "2026-04-05T10:00:00.000Z",
        hasCompletedFirstVisit: false
      },
      relationStatus: null,
      readyVoucherCount: 0,
      totalVoucherCount: 0,
      totalVisitCount: 0
    };
    const pageModule = loadPage(
      "pages/staff-visit/staff-visit.js",
      {
        "../../services/staff": {
          searchMembers: async (sessionToken, query) => {
            searchPayload = { sessionToken, query };
            return { rows: [row] };
          },
          settleFirstVisit: async () => ({})
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-entry" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.onLoad({
        query: encodeURIComponent("M0099")
      });

      await page.onShow();

      assert.deepEqual(searchPayload, {
        sessionToken: "token-entry",
        query: "M0099"
      });
      assert.equal(page.data.selectedMemberId, "member-quick");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff visit settle blocks members without verified phone", async () => {
    const wx = createWxMock();
    let settleCalled = false;
    const pageModule = loadPage(
      "pages/staff-visit/staff-visit.js",
      {
        "../../services/staff": {
          searchMembers: async () => ({ rows: [] }),
          settleFirstVisit: async () => {
            settleCalled = true;
            return {};
          }
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-2" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        selectedMemberId: "member-2",
        selectedMember: {
          member: {
            _id: "member-2",
            phoneVerifiedAt: ""
          }
        },
        orderNo: "ORDER-1"
      });

      await page.settle();

      assert.equal(settleCalled, false);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "该会员需先完成微信手机号验证");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff visit blocks mini program orders from being manually backfilled", async () => {
    const wx = createWxMock();
    let settleCalled = false;
    const pageModule = loadPage(
      "pages/staff-visit/staff-visit.js",
      {
        "../../services/staff": {
          searchMembers: async () => ({ rows: [] }),
          settleFirstVisit: async () => {
            settleCalled = true;
            return {};
          }
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-2" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        selectedMemberId: "member-2",
        selectedMember: {
          member: {
            _id: "member-2",
            phoneVerifiedAt: "2026-04-05T10:00:00.000Z"
          }
        },
        orderNo: "OD20260415093000ABCD"
      });

      await page.settle();

      assert.equal(settleCalled, false);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "小程序订单请去订单看板完成");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff visit copies verification guidance for unverified members", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/staff-visit/staff-visit.js",
      {
        "../../services/staff": {
          searchMembers: async () => ({ rows: [] }),
          settleFirstVisit: async () => ({})
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-copy" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        selectedMember: {
          member: {
            memberCode: "M0008",
            phoneVerifiedAt: ""
          }
        }
      });

      page.copyVerificationGuide();

      assert.equal(wx.clipboardCalls.length, 1);
      assert.match(wx.clipboardCalls[0].data, /M0008/);
      assert.equal(wx.toastCalls.at(-1).title, "提示已复制");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff voucher submit normalizes QR payloads and keeps a redeemed result", async () => {
    const wx = createWxMock();
    const voucherId = "entity_12345678-abcd-efgh";
    let redeemPayload = null;
    let previewPayload = null;
    const pageModule = loadPage(
      "pages/staff-voucher/staff-voucher.js",
      {
        "../../services/staff": {
          previewVoucher: async (payload) => {
            previewPayload = payload;
            return {
              voucher: {
                _id: voucherId,
                dishName: "招牌肥牛",
                status: "READY"
              },
              member: {
                _id: "member-1",
                memberCode: "M0001",
                nickname: "张三"
              }
            };
          },
          redeemVoucher: async (payload) => {
            redeemPayload = payload;
            return {
              voucher: {
                _id: voucherId,
                dishName: "招牌肥牛"
              }
            };
          }
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-3" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.loadPreview({
        voucherId: buildVoucherQrPayload(voucherId)
      });
      await page.submit();

      assert.deepEqual(previewPayload, {
        sessionToken: "token-3",
        voucherId
      });
      assert.deepEqual(redeemPayload, {
        sessionToken: "token-3",
        voucherId
      });
      assert.equal(page.data.voucherId, "");
      assert.equal(page.data.lastRedeemed._id, voucherId);
      assert.equal(wx.modalCalls.length, 1);
      assert.equal(wx.modalCalls[0].title, "核销完成");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff voucher submit explains repeated redemption requests", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/staff-voucher/staff-voucher.js",
      {
        "../../services/staff": {
          previewVoucher: async () => ({
            voucher: {
              _id: "voucher-1",
              dishName: "招牌肥牛",
              status: "READY"
            },
            member: {
              _id: "member-1",
              memberCode: "M0001"
            }
          }),
          redeemVoucher: async () => ({
            isIdempotent: true,
            voucher: {
              _id: "voucher-1",
              dishName: "招牌肥牛"
            }
          })
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-3" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.loadPreview({
        voucherId: "voucher-1"
      });
      await page.submit();

      assert.equal(wx.modalCalls.length, 1);
      assert.match(wx.modalCalls[0].content, /已经核销过/);
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff visit settle refreshes the current member list after success", async () => {
    const wx = createWxMock();
    let searchCallCount = 0;
    const pageModule = loadPage(
      "pages/staff-visit/staff-visit.js",
      {
        "../../services/staff": {
          searchMembers: async () => {
            searchCallCount += 1;
            return {
              rows: [
                {
                  member: {
                    _id: "member-1",
                    memberCode: "M0001",
                    phone: "13800000000",
                    phoneVerifiedAt: "2026-04-05T10:00:00.000Z",
                    hasCompletedFirstVisit: true
                  },
                  relationStatus: "ACTIVATED",
                  readyVoucherCount: 0,
                  totalVoucherCount: 0,
                  totalVisitCount: 1
                }
              ]
            };
          },
          settleFirstVisit: async () => ({
            settlement: {
              isIdempotent: false,
              welcomeVoucher: null,
              milestonePointAwards: []
            }
          })
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => ({ sessionToken: "token-refresh" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        query: "M0001",
        selectedMemberId: "member-1",
        selectedMember: {
          member: {
            _id: "member-1",
            phoneVerifiedAt: "2026-04-05T10:00:00.000Z"
          }
        },
        orderNo: "ORDER-REFRESH"
      });

      await page.settle();

      assert.equal(searchCallCount, 1);
      assert.equal(page.data.rows.length, 1);
      assert.equal(page.data.selectedMemberId, "member-1");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member card exposes QR fallback text when code rendering fails", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/member-card/member-card.js",
      {
        "../../utils/member-access": {
          refreshMemberState: async () => ({
            member: {
              memberCode: "M0008"
            }
          })
        },
        "../../utils/session": {
          getAppState: () => ({ member: null })
        },
        "../../utils/voucher-qrcode": {
          buildMemberQrPayload: () => "restaurant-member://card?memberCode=M0008",
          drawMemberQrCode: async () => {
            throw new Error("canvas failed");
          }
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.renderMemberQr({
        memberCode: "M0008"
      });

      assert.equal(page.data.qrReady, false);
      assert.equal(page.data.qrError, "会员二维码生成失败，请直接出示会员号");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("register page keeps explicit feedback when phone is not verified", async () => {
    const wx = createWxMock();
    let bootstrapCalled = false;
    const pageModule = loadPage(
      "pages/register/register.js",
      {
        "../../services/member": {
          bootstrapMember: async () => {
            bootstrapCalled = true;
            return {};
          }
        },
        "../../utils/session": {
          getAppState: () => ({ inviteCode: "" })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        hasVerifiedPhone: false
      });

      await page.submitProfile();

      assert.equal(bootstrapCalled, false);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "请先授权微信手机号");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member home feedback entry opens the feedback page", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/index/index.js",
      {
        "../../utils/member-access": {
          refreshMemberState: async () => ({ member: null, relation: null })
        },
        "../../utils/session": {
          getAppState: () => ({ staffSessionToken: "" }),
          resolveStaffEntryPath: () => "/pages/staff-login/staff-login"
        },
        "../../utils/format": {
          formatDateTime: () => ""
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.goFeedback();

      assert.equal(wx.navigateToCalls.length, 1);
      assert.equal(wx.navigateToCalls[0].url, "/pages/feedback/feedback");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member feedback page preloads member contact info and shows owner replies", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/feedback/feedback.js",
      {
        "../../services/member": {
          fetchMemberState: async () => ({
            member: {
              _id: "member-1",
              memberCode: "M0001",
              nickname: "张三",
              phone: "13800000000"
            }
          }),
          fetchMyFeedback: async () => ({
            tickets: [
              {
                _id: "feedback-1",
                feedbackCode: "F00000001",
                sourceType: "MEMBER",
                sourceChannel: "MINIPROGRAM_MEMBER",
                status: "RESOLVED",
                priority: "HIGH",
                category: "POINTS",
                title: "积分没有到账",
                content: "昨天首单完成后，积分还没有到账。",
                ownerReply: "已经补发，请你重新进入小程序查看。",
                handledAt: "2026-04-08T12:00:00.000Z",
                createdAt: "2026-04-08T10:00:00.000Z",
                updatedAt: "2026-04-08T12:00:00.000Z"
              }
            ]
          }),
          submitFeedback: async () => ({ ok: true })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.refresh();

      assert.equal(page.data.contactName, "张三");
      assert.equal(page.data.contactInfo, "13800000000");
      assert.equal(page.data.tickets.length, 1);
      assert.equal(page.data.tickets[0].ownerReplyText, "已经补发，请你重新进入小程序查看。");
      assert.equal(page.data.tickets[0].statusLabel, "已解决");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member feedback page clears stale data when refresh fails", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/feedback/feedback.js",
      {
        "../../services/member": {
          fetchMemberState: async () => ({
            member: {
              _id: "member-1",
              nickname: "张三"
            }
          }),
          fetchMyFeedback: async () => {
            throw new Error("加载失败");
          },
          submitFeedback: async () => ({ ok: true })
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        member: {
          _id: "member-1"
        },
        tickets: [
          {
            _id: "feedback-old"
          }
        ]
      });

      await page.refresh();

      assert.equal(page.data.loading, false);
      assert.equal(page.data.member, null);
      assert.deepEqual(page.data.tickets, []);
      assert.equal(page.data.errorMessage, "加载失败");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member feedback page submits a new ticket and refreshes the list", async () => {
    const wx = createWxMock();
    let submittedPayload = null;
    const pageModule = loadPage(
      "pages/feedback/feedback.js",
      {
        "../../services/member": {
          fetchMemberState: async () => ({ member: null }),
          fetchMyFeedback: async () => ({ tickets: [] }),
          submitFeedback: async (payload) => {
            submittedPayload = payload;
            return { ok: true };
          }
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      let refreshCount = 0;
      page.refresh = async () => {
        refreshCount += 1;
      };
      page.setData({
        categoryIndex: 1,
        title: "积分没有到账",
        content: "昨天首单完成后，今天积分还是没有变化。",
        contactName: "王女士",
        contactInfo: "13800000000"
      });

      await page.submit();

      assert.deepEqual(submittedPayload, {
        title: "积分没有到账",
        content: "昨天首单完成后，今天积分还是没有变化。",
        category: "POINTS",
        contactName: "王女士",
        contactInfo: "13800000000",
        sourcePage: "/pages/feedback/feedback"
      });
      assert.equal(page.data.title, "");
      assert.equal(page.data.content, "");
      assert.equal(refreshCount, 1);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "反馈已提交");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member home opens the feedback page from the main entrance", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/index/index.js",
      {
        "../../utils/member-access": {
          refreshMemberState: async () => ({ member: null, relation: null })
        },
        "../../utils/session": {
          getAppState: () => ({}),
          resolveStaffEntryPath: () => "/pages/staff-login/staff-login"
        },
        "../../utils/format": {
          formatDateTime: () => ""
        },
        "../../utils/store-context": {
          applyStoreLaunchContext: () => {}
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.goFeedback();

      assert.equal(wx.navigateToCalls.length, 1);
      assert.equal(wx.navigateToCalls[0].url, "/pages/feedback/feedback");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff feedback page preloads staff contact info and submits with the current session", async () => {
    const wx = createWxMock();
    let submittedPayload = null;
    const access = {
      sessionToken: "token-feedback",
      staffProfile: {
        username: "cashier01",
        displayName: "前台小王",
        role: "STAFF"
      }
    };
    const pageModule = loadPage(
      "pages/staff-feedback/staff-feedback.js",
      {
        "../../services/staff": {
          fetchMyFeedback: async (sessionToken) => {
            assert.equal(sessionToken, "token-feedback");
            return {
              tickets: [
                {
                  _id: "feedback-staff-1",
                  feedbackCode: "F00001001",
                  sourceType: "STAFF",
                  sourceChannel: "MINIPROGRAM_STAFF",
                  status: "PROCESSING",
                  priority: "HIGH",
                  category: "STAFF_TOOL",
                  title: "核销页卡住了",
                  content: "扫完券以后页面一直转圈。",
                  ownerReply: "已经定位到问题，今晚修复。",
                  handledAt: "2026-04-08T12:00:00.000Z",
                  createdAt: "2026-04-08T10:00:00.000Z",
                  updatedAt: "2026-04-08T12:00:00.000Z"
                }
              ]
            };
          },
          submitFeedback: async (payload) => {
            submittedPayload = payload;
            return { ok: true };
          }
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => access
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.refresh();

      assert.equal(page.data.contactName, "前台小王");
      assert.equal(page.data.contactInfo, "cashier01");
      assert.equal(page.data.tickets[0].ownerReplyText, "已经定位到问题，今晚修复。");

      let refreshCount = 0;
      page.refresh = async () => {
        refreshCount += 1;
      };
      page.setData({
        categoryIndex: 3,
        title: "核销页卡住了",
        content: "扫完券以后页面一直转圈，顾客无法完成核销。",
        contactName: "前台小王",
        contactInfo: "cashier01"
      });

      await page.submit();

      assert.deepEqual(submittedPayload, {
        sessionToken: "token-feedback",
        title: "核销页卡住了",
        content: "扫完券以后页面一直转圈，顾客无法完成核销。",
        category: "STAFF_TOOL",
        contactName: "前台小王",
        contactInfo: "cashier01",
        sourcePage: "/pages/staff-feedback/staff-feedback"
      });
      assert.equal(page.data.title, "");
      assert.equal(page.data.content, "");
      assert.equal(refreshCount, 1);
      assert.equal(wx.toastCalls[0].title, "反馈已提交");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff home opens the feedback page from the workbench", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/staff-home/staff-home.js",
      {
        "../../utils/session": {
          clearStaffSession: () => {},
          saveStaffRedirectPath: () => {}
        },
        "../../utils/staff-access": {
          refreshStaffAccess: async () => null
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.goFeedback();

      assert.equal(wx.navigateToCalls.length, 1);
      assert.equal(wx.navigateToCalls[0].url, "/pages/staff-feedback/staff-feedback");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member home sends staff to the login page when no staff session exists", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/index/index.js",
      {
        "../../utils/member-access": {
          refreshMemberState: async () => ({ member: null, relation: null })
        },
        "../../utils/session": {
          getAppState: () => ({ staffSessionToken: "" }),
          resolveStaffEntryPath: () => "/pages/staff-login/staff-login"
        },
        "../../utils/format": {
          formatDateTime: () => ""
        },
        "../../utils/store-context": {
          applyStoreLaunchContext: () => {}
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.goStaffEntry();

      assert.equal(wx.navigateToCalls.length, 1);
      assert.equal(wx.navigateToCalls[0].url, "/pages/staff-login/staff-login");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("member feedback page refreshes history and submits a new ticket", async () => {
    const wx = createWxMock();
    let fetchMemberStateCount = 0;
    let fetchMyFeedbackCount = 0;
    let submitPayload = null;
    const pageModule = loadPage(
      "pages/feedback/feedback.js",
      {
        "../../services/member": {
          fetchMemberState: async () => {
            fetchMemberStateCount += 1;
            return {
              member: {
                nickname: "张三",
                phone: "13800000000"
              }
            };
          },
          fetchMyFeedback: async () => {
            fetchMyFeedbackCount += 1;
            return {
              tickets: [
                {
                  _id: "feedback-1",
                  feedbackCode: "F00000001",
                  status: "PROCESSING",
                  priority: "HIGH",
                  category: "POINTS",
                  title: "积分没有到账",
                  content: "昨天到店后积分没有变化。",
                  ownerReply: "已经补发积分，请刷新再看。",
                  createdAt: "2026-04-08T08:00:00.000Z"
                }
              ]
            };
          },
          submitFeedback: async (payload) => {
            submitPayload = payload;
            return { ok: true };
          }
        },
        "../../utils/feedback": {
          decorateFeedbackTicket: (ticket) => ({
            ...ticket,
            ownerReplyText: ticket.ownerReply || "老板还在处理中，处理后会在这里回复。"
          }),
          getFeedbackCategoryOptions: () => [
            { value: "POINTS", label: "积分问题" },
            { value: "OTHER", label: "其他问题" }
          ]
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.refresh();

      assert.equal(fetchMemberStateCount, 1);
      assert.equal(fetchMyFeedbackCount, 1);
      assert.equal(page.data.contactName, "张三");
      assert.equal(page.data.contactInfo, "13800000000");
      assert.equal(page.data.tickets[0].ownerReplyText, "已经补发积分，请刷新再看。");

      page.setData({
        title: "积分没有到账",
        content: "昨天首单之后积分还是 0 分",
        contactName: "张三",
        contactInfo: "13800000000",
        categoryIndex: 0
      });

      await page.submit();

      assert.deepEqual(submitPayload, {
        title: "积分没有到账",
        content: "昨天首单之后积分还是 0 分",
        category: "POINTS",
        contactName: "张三",
        contactInfo: "13800000000",
        sourcePage: "/pages/feedback/feedback"
      });
      assert.equal(page.data.title, "");
      assert.equal(page.data.content, "");
      assert.equal(fetchMemberStateCount, 2);
      assert.equal(fetchMyFeedbackCount, 2);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "反馈已提交");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff home feedback entry opens the staff feedback page", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/staff-home/staff-home.js",
      {
        "../../utils/session": {
          clearStaffSession: () => undefined,
          saveStaffRedirectPath: () => undefined
        },
        "../../utils/staff-access": {
          refreshStaffAccess: async () => null
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.goFeedback();

      assert.equal(wx.navigateToCalls.length, 1);
      assert.equal(wx.navigateToCalls[0].url, "/pages/staff-feedback/staff-feedback");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff feedback page refreshes history and submits a new ticket", async () => {
    const wx = createWxMock();
    let fetchMyFeedbackCount = 0;
    let requireStaffAccessCount = 0;
    let submitPayload = null;
    const access = {
      sessionToken: "token-staff-feedback",
      staffProfile: {
        displayName: "前台小李",
        username: "cashier01"
      }
    };
    const pageModule = loadPage(
      "pages/staff-feedback/staff-feedback.js",
      {
        "../../services/staff": {
          fetchMyFeedback: async (sessionToken) => {
            assert.equal(sessionToken, "token-staff-feedback");
            fetchMyFeedbackCount += 1;
            return {
              tickets: [
                {
                  _id: "feedback-staff-1",
                  feedbackCode: "F00001001",
                  status: "RESOLVED",
                  priority: "NORMAL",
                  category: "STAFF_TOOL",
                  title: "核销页卡住了",
                  content: "扫完券以后页面一直转圈。",
                  ownerReply: "已经修复扫码超时问题。",
                  createdAt: "2026-04-08T08:30:00.000Z"
                }
              ]
            };
          },
          submitFeedback: async (payload) => {
            submitPayload = payload;
            return { ok: true };
          }
        },
        "../../utils/feedback": {
          decorateFeedbackTicket: (ticket) => ({
            ...ticket,
            ownerReplyText: ticket.ownerReply || "老板还在处理中，处理后会在这里回复。"
          }),
          getFeedbackCategoryOptions: () => [
            { value: "STAFF_TOOL", label: "店员工具" },
            { value: "OTHER", label: "其他问题" }
          ]
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => {
            requireStaffAccessCount += 1;
            return access;
          }
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.refresh();

      assert.equal(fetchMyFeedbackCount, 1);
      assert.equal(page.data.contactName, "前台小李");
      assert.equal(page.data.contactInfo, "cashier01");
      assert.equal(page.data.tickets[0].ownerReplyText, "已经修复扫码超时问题。");

      page.setData({
        title: "核销页卡住了",
        content: "扫券后页面一直转圈无法返回",
        contactName: "前台小李",
        contactInfo: "cashier01",
        categoryIndex: 0
      });

      await page.submit();

      assert.deepEqual(submitPayload, {
        sessionToken: "token-staff-feedback",
        title: "核销页卡住了",
        content: "扫券后页面一直转圈无法返回",
        category: "STAFF_TOOL",
        contactName: "前台小李",
        contactInfo: "cashier01",
        sourcePage: "/pages/staff-feedback/staff-feedback"
      });
      assert.equal(page.data.title, "");
      assert.equal(page.data.content, "");
      assert.equal(fetchMyFeedbackCount, 2);
      assert.equal(requireStaffAccessCount, 3);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "反馈已提交");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff feedback page leaves loading state when staff access is unavailable", async () => {
    const wx = createWxMock();
    let fetchMyFeedbackCalled = false;
    const pageModule = loadPage(
      "pages/staff-feedback/staff-feedback.js",
      {
        "../../services/staff": {
          fetchMyFeedback: async () => {
            fetchMyFeedbackCalled = true;
            return { tickets: [] };
          },
          submitFeedback: async () => ({ ok: true })
        },
        "../../utils/staff-access": {
          requireStaffAccess: async () => null
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      await page.refresh();

      assert.equal(fetchMyFeedbackCalled, false);
      assert.equal(page.data.loading, false);
      assert.deepEqual(page.data.tickets, []);
    } finally {
      pageModule.restore();
    }
  });

  await t.test("menu page blocks adding a dish when a required option is still missing", async () => {
    const wx = createWxMock();
    let addCartItemCalled = false;
    const pageModule = loadPage(
      "pages/menu/menu.js",
      {
        "../../services/order": {
          fetchMenuCatalog: async () => ({
            storeConfig: null,
            categories: [],
            items: []
          })
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        "../../utils/store-context": {
          applyStoreLaunchContext: () => ({})
        },
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          buildCartLineId: () => "line-1",
          addCartItem: () => {
            addCartItemCalled = true;
          },
          updateCartItemQuantity: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        activeMenuItem: {
          _id: "dish-1",
          name: "精品肥牛",
          price: 32,
          optionGroups: [
            {
              _id: "group-1",
              name: "辣度",
              required: true,
              multiSelect: false,
              choices: [
                {
                  _id: "choice-1",
                  name: "微辣",
                  priceDelta: 0,
                  isEnabled: true,
                  isDefault: false
                }
              ]
            }
          ]
        },
        optionSelectionMap: {}
      });

      page.confirmOptionSelection();

      assert.equal(addCartItemCalled, false);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "请先选择辣度");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("menu page blocks tapping a disabled option choice", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/menu/menu.js",
      {
        "../../services/order": {
          fetchMenuCatalog: async () => ({
            storeConfig: null,
            categories: [],
            items: []
          })
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        "../../utils/store-context": {
          applyStoreLaunchContext: () => ({})
        },
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          buildCartLineId: () => "line-1",
          addCartItem: () => undefined,
          updateCartItemQuantity: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        activeMenuItem: {
          _id: "dish-1",
          optionGroups: [
            {
              _id: "group-1",
              name: "加料",
              required: false,
              multiSelect: false,
              choices: [
                {
                  _id: "choice-1",
                  name: "加芝士",
                  isEnabled: false
                }
              ]
            }
          ]
        },
        optionSelectionMap: {}
      });

      page.toggleOption({
        currentTarget: {
          dataset: {
            groupId: "group-1",
            choiceId: "choice-1"
          }
        }
      });

      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "这个规格暂时不可选");
      assert.deepEqual(page.data.optionSelectionMap, {});
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout page requires a table number before submitting a dine-in order", async () => {
    const wx = createWxMock();
    let createOrderCalled = false;
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          previewOrder: async () => ({
            preview: {
              payableAmount: 32
            },
            storeConfig: {}
          }),
          createOrder: async () => {
            createOrderCalled = true;
            return {
              order: {
                _id: "order-1"
              }
            };
          }
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        ...verifiedMemberAccessMocks,
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        cartItems: [
          {
            menuItemId: "dish-1",
            quantity: 1,
            selectedOptions: []
          }
        ],
        fulfillmentMode: "DINE_IN",
        tableNo: "   "
      });

      await page.submitOrder();

      assert.equal(createOrderCalled, false);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "堂食请先填写桌号");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout page asks unverified members to verify their phone before participating in member benefits", async () => {
    const wx = createWxMock();
    let createOrderCalled = false;
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          createOrder: async () => {
            createOrderCalled = true;
            return {
              order: {
                _id: "order-unverified"
              }
            };
          }
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        cartItems: [
          {
            menuItemId: "dish-1",
            quantity: 1,
            selectedOptions: []
          }
        ],
        fulfillmentMode: "DINE_IN",
        tableNo: "A01",
        memberBenefitsRequiresChoice: true,
        memberBenefitsChoice: "VERIFY_AND_PARTICIPATE"
      });

      await page.submitOrder();

      assert.equal(createOrderCalled, false);
      assert.equal(wx.modalCalls.length, 1);
      assert.equal(wx.modalCalls[0].title, "先验证手机号");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout page exposes a direct verify action before submit", async () => {
    const wx = createWxMock();
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          createOrder: async () => ({
            order: {
              _id: "order-direct-verify"
            }
          })
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        memberBenefitsRequiresChoice: true,
        memberBenefitsChoice: "SKIP_THIS_ORDER"
      });

      page.goVerifyMemberBenefits();

      assert.equal(page.data.memberBenefitsChoice, "VERIFY_AND_PARTICIPATE");
      assert.equal(wx.navigateToCalls.length, 1);
      assert.equal(wx.navigateToCalls[0].url, "/pages/register/register");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout page submits skip choice for unverified members when they choose not to join benefits", async () => {
    const wx = createWxMock();
    let createOrderPayload = null;
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          createOrder: async (payload) => {
            createOrderPayload = payload;
            return {
              order: {
                _id: "order-skip"
              }
            };
          }
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        cartItems: [
          {
            menuItemId: "dish-1",
            quantity: 1,
            selectedOptions: []
          }
        ],
        fulfillmentMode: "DINE_IN",
        tableNo: "A01",
        memberBenefitsRequiresChoice: true,
        memberBenefitsChoice: "SKIP_THIS_ORDER"
      });

      await page.submitOrder();

      assert.ok(createOrderPayload);
      assert.equal(createOrderPayload.memberBenefitsChoice, "SKIP_THIS_ORDER");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout page reuses the same requestId when the same order is retried after a transient failure", async () => {
    const wx = createWxMock();
    const requestIds = [];
    let clearCartCount = 0;
    let submitCount = 0;
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          previewOrder: async () => ({
            preview: {
              payableAmount: 32
            },
            storeConfig: {}
          }),
          createOrder: async (payload) => {
            submitCount += 1;
            requestIds.push(payload.requestId);
            if (submitCount === 1) {
              throw new Error("网络超时");
            }

            return {
              order: {
                _id: "order-retry"
              }
            };
          }
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        ...verifiedMemberAccessMocks,
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          clearCart: () => {
            clearCartCount += 1;
          }
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        cartItems: [
          {
            menuItemId: "dish-1",
            quantity: 1,
            selectedOptions: []
          }
        ],
        fulfillmentMode: "DINE_IN",
        tableNo: "A01"
      });

      await page.submitOrder();
      await page.submitOrder();

      assert.equal(requestIds.length, 2);
      assert.equal(requestIds[0], requestIds[1]);
      assert.equal(clearCartCount, 1);
      assert.equal(wx.toastCalls[0].title, "网络超时");
      assert.equal(wx.toastCalls[1].title, "下单成功");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout page clears stale table info when a pickup order is submitted", async () => {
    const wx = createWxMock();
    let createOrderPayload = null;
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          previewOrder: async () => ({
            preview: {
              payableAmount: 32
            },
            storeConfig: {}
          }),
          createOrder: async (payload) => {
            createOrderPayload = payload;
            return {
              order: {
                _id: "order-2"
              }
            };
          }
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        ...verifiedMemberAccessMocks,
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        cartItems: [
          {
            menuItemId: "dish-1",
            quantity: 1,
            selectedOptions: []
          }
        ],
        fulfillmentMode: "PICKUP",
        tableNo: "A08",
        contactName: "张三",
        contactPhone: "13800000000",
        remark: "少辣"
      });

      await page.submitOrder();

      assert.ok(createOrderPayload);
      assert.equal(createOrderPayload.tableNo, "");
      assert.equal(createOrderPayload.contactName, "张三");
      assert.equal(createOrderPayload.contactPhone, "13800000000");
      assert.equal(createOrderPayload.remark, "少辣");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout page blocks disabled fulfillment modes", async () => {
    const wx = createWxMock();
    let createOrderCalled = false;
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          previewOrder: async () => ({
            preview: {
              payableAmount: 32
            },
            storeConfig: {
              dineInEnabled: false,
              pickupEnabled: true
            }
          }),
          createOrder: async () => {
            createOrderCalled = true;
            return {
              order: {
                _id: "order-disabled"
              }
            };
          },
          fetchMenuCatalog: async () => ({
            storeConfig: {
              dineInEnabled: false,
              pickupEnabled: true
            }
          })
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        ...verifiedMemberAccessMocks,
        "../../utils/cart": {
          loadCart: () => [],
          summarizeCart: () => ({
            itemCount: 0,
            totalAmount: 0
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        cartItems: [
          {
            menuItemId: "dish-1",
            quantity: 1,
            selectedOptions: []
          }
        ],
        storeConfig: {
          dineInEnabled: false,
          pickupEnabled: true
        },
        fulfillmentMode: "DINE_IN",
        tableNo: "A08"
      });

      await page.submitOrder();

      assert.equal(createOrderCalled, false);
      assert.equal(wx.toastCalls.length, 1);
      assert.equal(wx.toastCalls[0].title, "堂食暂未开启");
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout refresh falls back to the supported mode from store config", async () => {
    const wx = createWxMock();
    let previewPayload = null;
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          fetchMenuCatalog: async () => ({
            storeConfig: {
              dineInEnabled: false,
              pickupEnabled: true
            }
          }),
          previewOrder: async (payload) => {
            previewPayload = payload;
            return {
              preview: {
                payableAmount: 48
              },
              storeConfig: {
                dineInEnabled: false,
                pickupEnabled: true
              }
            };
          },
          createOrder: async () => ({
            order: {
              _id: "order-3"
            }
          })
        },
        "../../utils/session": {
          getAppState: () => ({
            storeId: "default-store",
            activeTableNo: ""
          })
        },
        ...verifiedMemberAccessMocks,
        "../../utils/cart": {
          loadCart: () => [
            {
              lineId: "line-1",
              menuItemId: "dish-1",
              quantity: 1,
              unitPrice: 48,
              lineTotal: 48,
              selectedOptions: []
            }
          ],
          summarizeCart: () => ({
            itemCount: 1,
            totalAmount: 48
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.setData({
        fulfillmentMode: "DINE_IN"
      });

      await page.refresh();

      assert.ok(previewPayload);
      assert.equal(previewPayload.fulfillmentMode, "PICKUP");
      assert.equal(page.data.fulfillmentMode, "PICKUP");
      assert.equal(page.data.supportDineIn, false);
      assert.equal(page.data.supportPickup, true);
    } finally {
      pageModule.restore();
    }
  });

  await t.test("checkout refresh reuses cached store config to avoid reloading the catalog", async () => {
    const wx = createWxMock();
    let fetchCatalogCount = 0;
    let previewPayload = null;
    const appState = {
      storeId: "default-store",
      activeTableNo: "",
      storeConfigCache: {
        "default-store": {
          dineInEnabled: true,
          pickupEnabled: true
        }
      }
    };
    const pageModule = loadPage(
      "pages/checkout/checkout.js",
      {
        "../../services/order": {
          fetchMenuCatalog: async () => {
            fetchCatalogCount += 1;
            return {
              storeConfig: {
                dineInEnabled: true,
                pickupEnabled: true
              }
            };
          },
          previewOrder: async (payload) => {
            previewPayload = payload;
            return {
              preview: {
                payableAmount: 36
              },
              storeConfig: {
                dineInEnabled: true,
                pickupEnabled: true
              }
            };
          },
          createOrder: async () => ({
            order: {
              _id: "order-4"
            }
          })
        },
        "../../utils/session": {
          getAppState: () => appState
        },
        ...verifiedMemberAccessMocks,
        "../../utils/cart": {
          loadCart: () => [
            {
              lineId: "line-1",
              menuItemId: "dish-1",
              quantity: 1,
              unitPrice: 36,
              lineTotal: 36,
              selectedOptions: []
            }
          ],
          summarizeCart: () => ({
            itemCount: 1,
            totalAmount: 36
          }),
          clearCart: () => undefined
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);

      await page.refresh();

      assert.equal(fetchCatalogCount, 0);
      assert.ok(previewPayload);
      assert.equal(previewPayload.fulfillmentMode, "DINE_IN");
      assert.deepEqual(appState.storeConfigCache["default-store"], {
        dineInEnabled: true,
        pickupEnabled: true
      });
    } finally {
      pageModule.restore();
    }
  });

  await t.test("staff login returns to the original page after a successful login", async () => {
    const wx = createWxMock();
    let savedSession = null;
    let savedRedirect = "";
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (callback) => {
      if (typeof callback === "function") {
        callback();
      }
      return 1;
    };

    const pageModule = loadPage(
      "pages/staff-login/staff-login.js",
      {
        "../../services/staff": {
          loginStaff: async (payload) => {
            assert.equal(payload.username, "staff01");
            assert.equal(payload.password, "secret");
            return {
              sessionToken: "token-login",
              staff: {
                username: "staff01",
                displayName: "店员一号"
              }
            };
          }
        },
        "../../utils/session": {
          saveStaffSession: (sessionToken, staff) => {
            savedSession = { sessionToken, staff };
          },
          saveStaffRedirectPath: (path) => {
            savedRedirect = path;
          },
          consumeStaffRedirectPath: () => savedRedirect
        },
        "../../utils/staff-access": {
          refreshStaffAccess: async () => null
        }
      },
      { wx }
    );

    try {
      const page = createPageInstance(pageModule.definition);
      page.onLoad({
        redirect: "/pages/staff-voucher/staff-voucher"
      });
      page.setData({
        username: "staff01",
        password: "secret"
      });

      await page.submit();

      assert.deepEqual(savedSession, {
        sessionToken: "token-login",
        staff: {
          username: "staff01",
          displayName: "店员一号"
        }
      });
      assert.equal(wx.redirectToCalls.length, 1);
      assert.equal(wx.redirectToCalls[0].url, "/pages/staff-voucher/staff-voucher");
    } finally {
      global.setTimeout = originalSetTimeout;
      pageModule.restore();
    }
  });
});

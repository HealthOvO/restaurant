const { STORE_ID } = require("../config");

function normalizeStoreId(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeInviteCode(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
}

function normalizeTableNo(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function decodeScene(scene) {
  if (!scene || typeof scene !== "string") {
    return "";
  }

  try {
    return decodeURIComponent(scene);
  } catch {
    return scene;
  }
}

function parseKeyValueString(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return {};
  }

  return rawValue
    .split("&")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce((result, segment) => {
      const [rawKey, ...rawRest] = segment.split("=");
      const key = (rawKey || "").trim();
      const value = rawRest.join("=").trim();
      if (!key) {
        return result;
      }

      result[key] = value;
      return result;
    }, {});
}

function withOptionalTableNo(payload, tableNo) {
  if (!tableNo) {
    return payload;
  }

  return {
    ...payload,
    tableNo
  };
}

function resolveStoreLaunchContext(query) {
  const normalizedQuery = query && typeof query === "object" ? query : {};
  const directStoreId = normalizeStoreId(normalizedQuery.storeId || normalizedQuery.s || "");
  const directInviteCode = normalizeInviteCode(normalizedQuery.inviteCode || normalizedQuery.i || "");
  const directTableNo = normalizeTableNo(normalizedQuery.tableNo || normalizedQuery.t || "");
  const sceneQuery = parseKeyValueString(decodeScene(normalizedQuery.scene));
  const sceneStoreId = normalizeStoreId(sceneQuery.storeId || sceneQuery.s || "");
  const sceneInviteCode = normalizeInviteCode(sceneQuery.inviteCode || sceneQuery.i || "");
  const sceneTableNo = normalizeTableNo(sceneQuery.tableNo || sceneQuery.t || "");

  return withOptionalTableNo({
    storeId: directStoreId || sceneStoreId || "",
    inviteCode: directInviteCode || sceneInviteCode || ""
  }, directTableNo || sceneTableNo || "");
}

function clearScopedCache(appState) {
  appState.member = null;
  appState.relation = null;
  appState.staffProfile = null;
  appState.staffSessionToken = "";
  appState.activeTableNo = "";
  wx.removeStorageSync("staffSessionToken");
  wx.removeStorageSync("staffProfile");
  wx.removeStorageSync("activeTableNo");
}

function applyStoreLaunchContext(query) {
  const app = typeof getApp === "function" ? getApp() : null;
  const appState = app && app.globalData
    ? app.globalData
    : {
        storeId: normalizeStoreId(wx.getStorageSync("storeId")) || STORE_ID,
        activeTableNo: normalizeTableNo(wx.getStorageSync("activeTableNo")),
        inviteCode: "",
        member: null,
        relation: null,
        staffProfile: null,
        staffSessionToken: ""
      };
  const launchContext = resolveStoreLaunchContext(query);
  const previousStoreId = normalizeStoreId(appState.storeId) || normalizeStoreId(wx.getStorageSync("storeId")) || STORE_ID;
  const nextStoreId = launchContext.storeId || previousStoreId || STORE_ID;
  const storeChanged = previousStoreId !== nextStoreId;

  if (storeChanged) {
    clearScopedCache(appState);
  }

  appState.storeId = nextStoreId;
  wx.setStorageSync("storeId", nextStoreId);

  if (launchContext.inviteCode) {
    appState.inviteCode = launchContext.inviteCode;
  } else if (storeChanged) {
    appState.inviteCode = "";
  }

  if (launchContext.tableNo) {
    appState.activeTableNo = launchContext.tableNo;
    wx.setStorageSync("activeTableNo", launchContext.tableNo);
  } else if (storeChanged) {
    appState.activeTableNo = "";
    wx.removeStorageSync("activeTableNo");
  }

  return withOptionalTableNo({
    storeId: nextStoreId,
    inviteCode: appState.inviteCode || "",
    storeChanged
  }, appState.activeTableNo || "");
}

module.exports = {
  resolveStoreLaunchContext,
  applyStoreLaunchContext
};

function getAppState() {
  return getApp().globalData;
}

function normalizePath(path) {
  if (!path || typeof path !== "string") {
    return "";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function saveStaffSession(sessionToken, staffProfile) {
  const app = getAppState();
  app.staffSessionToken = sessionToken;
  app.staffProfile = staffProfile;
  wx.setStorageSync("staffSessionToken", sessionToken);
  wx.setStorageSync("staffProfile", staffProfile);
}

function saveStaffRedirectPath(path) {
  const app = getAppState();
  const nextPath = normalizePath(path);
  app.staffRedirectPath = nextPath;

  if (nextPath) {
    wx.setStorageSync("staffRedirectPath", nextPath);
    return;
  }

  wx.removeStorageSync("staffRedirectPath");
}

function consumeStaffRedirectPath(fallbackPath) {
  const app = getAppState();
  const cachedPath = app.staffRedirectPath || wx.getStorageSync("staffRedirectPath");
  const nextPath = normalizePath(cachedPath || fallbackPath);
  saveStaffRedirectPath("");
  return nextPath;
}

function resolveStaffEntryPath() {
  const app = getAppState();
  return app.staffSessionToken ? "/pages/staff-home/staff-home" : "/pages/staff-login/staff-login";
}

function clearStaffSession() {
  const app = getAppState();
  app.staffSessionToken = "";
  app.staffProfile = null;
  wx.removeStorageSync("staffSessionToken");
  wx.removeStorageSync("staffProfile");
}

module.exports = {
  getAppState,
  saveStaffSession,
  saveStaffRedirectPath,
  consumeStaffRedirectPath,
  resolveStaffEntryPath,
  clearStaffSession
};

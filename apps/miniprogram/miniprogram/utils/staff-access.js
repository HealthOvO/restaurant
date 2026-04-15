const { fetchStaffProfile } = require("../services/staff");
const { getAppState, saveStaffSession, saveStaffRedirectPath, clearStaffSession } = require("./session");

function isSessionInvalidError(error) {
  return !!(error && (error.code === "UNAUTHORIZED" || error.code === "INVALID_SESSION_SCOPE"));
}

function buildQueryString(options) {
  if (!options || typeof options !== "object") {
    return "";
  }

  const parts = Object.keys(options)
    .filter((key) => options[key] !== undefined && options[key] !== null && `${options[key]}` !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(`${options[key]}`)}`);

  return parts.length ? `?${parts.join("&")}` : "";
}

function getCurrentPagePath() {
  if (typeof getCurrentPages !== "function") {
    return "";
  }

  const pages = getCurrentPages();
  if (!pages || !pages.length) {
    return "";
  }

  const currentPage = pages[pages.length - 1];
  if (!currentPage || !currentPage.route) {
    return "";
  }

  const route = currentPage.route.startsWith("/") ? currentPage.route : `/${currentPage.route}`;
  return `${route}${buildQueryString(currentPage.options)}`;
}

function redirectToStaffLogin(redirectPath) {
  saveStaffRedirectPath(redirectPath || getCurrentPagePath());
  setTimeout(() => {
    wx.redirectTo({ url: "/pages/staff-login/staff-login" });
  }, 280);
}

async function refreshStaffAccess() {
  const appState = getAppState();
  const sessionToken = appState.staffSessionToken;
  if (!sessionToken) {
    return null;
  }

  try {
    const response = await fetchStaffProfile(sessionToken);
    saveStaffSession(sessionToken, response.staff);
    return {
      sessionToken,
      staffProfile: response.staff
    };
  } catch (error) {
    if (isSessionInvalidError(error)) {
      clearStaffSession();
    }
    throw error;
  }
}

async function requireStaffAccess(options) {
  const redirectPath =
    options && Object.prototype.hasOwnProperty.call(options, "redirectPath")
      ? options.redirectPath
      : getCurrentPagePath();
  const appState = getAppState();
  if (!appState.staffSessionToken) {
    wx.showToast({
      icon: "none",
      title: "请先登录店员账号"
    });
    redirectToStaffLogin(redirectPath);
    return null;
  }

  return refreshStaffAccess().catch((error) => {
    if (isSessionInvalidError(error)) {
      wx.showToast({
        icon: "none",
        title: error.message || "登录已失效，请重新登录"
      });
      redirectToStaffLogin(redirectPath);
      return null;
    }

    wx.showToast({
      icon: "none",
      title: error.message || "当前网络异常，请稍后重试"
    });
    return null;
  });
}

module.exports = {
  refreshStaffAccess,
  requireStaffAccess
};

const { STORE_ID } = require("../config");

function createCloudFunctionError(name, message, code) {
  const error = new Error(message);
  error.name = "CloudFunctionError";
  error.code = code;
  error.functionName = name;
  return error;
}

function resolveStoreId(data) {
  if (data && typeof data.storeId === "string" && data.storeId.trim()) {
    return data.storeId.trim();
  }

  const app = typeof getApp === "function" ? getApp() : null;
  const globalStoreId = app && app.globalData && typeof app.globalData.storeId === "string" ? app.globalData.storeId.trim() : "";
  return globalStoreId || STORE_ID;
}

function callFunction(name, data = {}) {
  const payload = {
    ...data,
    storeId: resolveStoreId(data)
  };

  return wx.cloud
    .callFunction({
      name,
      data: payload
    })
    .then((response) => {
      const result = response.result || null;
      if (!result) {
        return Promise.reject(createCloudFunctionError(name, "云函数无返回结果", "EMPTY_RESPONSE"));
      }
      if (result.ok === false) {
        return Promise.reject(createCloudFunctionError(name, result.message || "云函数执行失败", result.code));
      }
      return result;
    })
    .catch((error) => {
      if (error && error.name === "CloudFunctionError") {
        return Promise.reject(error);
      }
      return Promise.reject(createCloudFunctionError(name, error && error.message ? error.message : `调用云函数 ${name} 失败`));
    });
}

module.exports = {
  callFunction
};

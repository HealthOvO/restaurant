function createApiError(message, code, requestId) {
  const error = new Error(message || "操作失败，请稍后重试");
  error.name = "V2ApiError";
  error.code = code || "API_ERROR";
  error.requestId = requestId || "";
  return error;
}

const readRequests = new Map();
let memberReady = false;
let memberBootstrapRequest = null;

function readRequestKey(action, payload = {}) {
  return `${action}:${JSON.stringify(payload)}`;
}

function callCustomer(action, payload = {}) {
  return wx.cloud.callFunction({
    name: "v2-customer-api",
    data: { action, payload }
  }).then((response) => {
    const result = response.result;
    if (!result) throw createApiError("服务没有返回结果", "EMPTY_RESPONSE");
    if (!result.ok) throw createApiError(result.message, result.code, result.requestId);
    return result.data;
  }).catch((error) => {
    if (error && error.name === "V2ApiError") throw error;
    throw createApiError(error && error.message ? error.message : "网络连接失败");
  });
}

function callCustomerRead(action, payload = {}) {
  const key = readRequestKey(action, payload);
  const existing = readRequests.get(key);
  if (existing) return existing;
  const request = callCustomer(action, payload).finally(() => {
    if (readRequests.get(key) === request) readRequests.delete(key);
  });
  readRequests.set(key, request);
  return request;
}

function invalidateRead(action, payload = {}) {
  readRequests.delete(readRequestKey(action, payload));
}

function invalidateCurrentReads() {
  readRequests.clear();
}

function rememberMember(request) {
  memberBootstrapRequest = request.then((value) => {
    memberReady = true;
    return value;
  }).catch((error) => {
    memberReady = false;
    memberBootstrapRequest = null;
    throw error;
  });
  return memberBootstrapRequest;
}

function ensureMember() {
  if (memberReady) return Promise.resolve();
  if (memberBootstrapRequest) return memberBootstrapRequest.then(() => undefined);
  return rememberMember(callCustomerRead("member.bootstrap")).then(() => undefined);
}

function getHome() {
  const request = callCustomerRead("home.get");
  if (!memberReady && !memberBootstrapRequest) return rememberMember(request);
  return request.then((home) => {
    memberReady = true;
    return home;
  });
}

function callForMember(action, payload = {}, readOnly = false, retried = false) {
  return ensureMember().then(() => (readOnly ? callCustomerRead(action, payload) : callCustomer(action, payload))).catch((error) => {
    if (retried || !error || error.code !== "MEMBER_NOT_FOUND") throw error;
    memberReady = false;
    memberBootstrapRequest = null;
    return ensureMember().then(() => callForMember(action, payload, readOnly, true));
  });
}

module.exports = {
  bootstrap: ensureMember,
  invalidateRead,
  invalidateCurrentReads,
  getHome,
  createOrder: (payload) => callForMember("order.create", payload),
  cancelPayment: (orderId) => callForMember("order.cancelPayment", { orderId }),
  queryPayment: (orderId) => callForMember("order.queryPayment", { orderId }, true),
  mockPay: (orderId) => callForMember("order.mockPay", { orderId }),
  listOrders: (cursor, limit = 20) => callForMember("order.listMinePage", { cursor, limit }, true),
  listPoints: (cursor, limit = 20) => callForMember("points.list", { cursor, limit }, true),
  exchangeCoupon: (payload) => callForMember("coupon.exchange", payload),
  listCoupons: () => callForMember("coupon.listMine", {}, true),
  resolveInvite: (inviteCode) => callForMember("invite.resolve", { inviteCode }, true),
  bindInvite: (inviteCode) => callForMember("invite.bind", { inviteCode }),
  getInviteOverview: () => callForMember("invite.overview", {}, true)
};

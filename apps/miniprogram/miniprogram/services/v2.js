function createApiError(message, code, requestId) {
  const error = new Error(message || "操作失败，请稍后重试");
  error.name = "V2ApiError";
  error.code = code || "API_ERROR";
  error.requestId = requestId || "";
  return error;
}

const readRequests = new Map();

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
  const key = `${action}:${JSON.stringify(payload)}`;
  const existing = readRequests.get(key);
  if (existing) return existing;
  const request = callCustomer(action, payload).finally(() => readRequests.delete(key));
  readRequests.set(key, request);
  return request;
}

module.exports = {
  bootstrap: () => callCustomerRead("member.bootstrap"),
  getHome: () => callCustomerRead("home.get"),
  createOrder: (payload) => callCustomer("order.create", payload),
  cancelPayment: (orderId) => callCustomer("order.cancelPayment", { orderId }),
  queryPayment: (orderId) => callCustomerRead("order.queryPayment", { orderId }),
  mockPay: (orderId) => callCustomer("order.mockPay", { orderId }),
  listOrders: () => callCustomerRead("order.listMine"),
  listPoints: () => callCustomerRead("points.list"),
  exchangeCoupon: (payload) => callCustomer("coupon.exchange", payload),
  listCoupons: () => callCustomerRead("coupon.listMine"),
  useCoupon: (payload) => callCustomer("coupon.use", payload),
  bindInvite: (inviteCode) => callCustomer("invite.bind", { inviteCode }),
  getInviteOverview: () => callCustomerRead("invite.overview")
};

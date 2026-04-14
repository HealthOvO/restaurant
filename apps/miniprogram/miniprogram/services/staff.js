const { callFunction } = require("./cloud");

module.exports = {
  loginStaff(data) {
    return callFunction("auth-login", data);
  },
  fetchStaffProfile(sessionToken) {
    return callFunction("staff-profile", { sessionToken });
  },
  searchMembers(sessionToken, query) {
    return callFunction("staff-member-search", { sessionToken, query, limit: 12 });
  },
  fetchMyFeedback(sessionToken) {
    return callFunction("staff-feedback-mine", { sessionToken });
  },
  submitFeedback(data) {
    return callFunction("staff-feedback-submit", data);
  },
  settleFirstVisit(data) {
    return callFunction("visit-settle-first-visit", data);
  },
  redeemVoucher(data) {
    return callFunction("voucher-redeem", data);
  }
};

const { callFunction } = require("./cloud");

module.exports = {
  bootstrapMember(data) {
    return callFunction("member-bootstrap", data);
  },
  fetchMemberState() {
    return callFunction("member-state");
  },
  fetchInviteOverview() {
    return callFunction("invite-overview");
  },
  bindInviteByCode(inviteCode) {
    return callFunction("invite-bind", { inviteCode });
  },
  fetchMyVouchers() {
    return callFunction("voucher-list-mine");
  },
  redeemPoints(exchangeItemId, requestId) {
    return callFunction("points-redeem", { exchangeItemId, requestId });
  },
  fetchMyRecords() {
    return callFunction("member-records");
  },
  fetchMyFeedback() {
    return callFunction("member-feedback-mine");
  },
  submitFeedback(data) {
    return callFunction("member-feedback-submit", data);
  }
};

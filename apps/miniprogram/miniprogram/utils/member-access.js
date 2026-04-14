const { bootstrapMember, fetchMemberState } = require("../services/member");
const { getAppState } = require("./session");

function createInviteStateError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function refreshMemberState() {
  const appState = getAppState();
  const inviteCode = appState.inviteCode || undefined;
  let response = await fetchMemberState();
  const fallbackState = {
    member: response.member || null,
    relation: response.relation || null
  };

  try {
    if (!response.member || (inviteCode && !response.relation)) {
      response = await bootstrapMember({
        inviteCode
      });
    }
  } catch (error) {
    if (error && error.code === "SELF_INVITE_FORBIDDEN") {
      appState.inviteCode = "";
      appState.member = fallbackState.member;
      appState.relation = fallbackState.relation;
      throw createInviteStateError("不能填写自己的邀请码，请换一个邀请码", "SELF_INVITE_FORBIDDEN");
    }

    throw error;
  }

  appState.member = response.member;
  appState.relation = response.relation || null;
  if (
    appState.inviteCode &&
    (response.relation || (response.member && response.member.memberCode === appState.inviteCode))
  ) {
    appState.inviteCode = "";
  }

  return {
    member: response.member,
    relation: response.relation || null
  };
}

module.exports = {
  refreshMemberState
};

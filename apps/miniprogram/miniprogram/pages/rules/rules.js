const { getAppState } = require("../../utils/session");
const { refreshMemberState } = require("../../utils/member-access");

Page({
  data: {
    memberCode: ""
  },
  async onShow() {
    const member = await refreshMemberState()
      .then((result) => result.member)
      .catch(() => getAppState().member || null);
    this.setData({
      memberCode: member && member.memberCode ? member.memberCode : ""
    });
  }
});

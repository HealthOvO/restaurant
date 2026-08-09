const api = require("../../services/v2");
const { dateTime } = require("../../utils/v2-format");

Page({
  data: { loading: true, error: "", home: null, overview: null, inviteInput: "", binding: false },

  onShow() { this.loadProfile(); },
  onPullDownRefresh() { this.loadProfile().finally(() => wx.stopPullDownRefresh()); },

  loadProfile() {
    this.setData({ loading: true, error: "" });
    return Promise.all([api.getHome(), api.getInviteOverview()]).then(([home, overview]) => {
      this.setData({
        loading: false,
        home,
        overview: { ...overview, invitees: (overview.invitees || []).map((item) => ({ ...item, boundText: dateTime(item.boundAt) })) }
      });
    }).catch((error) => this.setData({ loading: false, error: error.message || "个人信息加载失败" }));
  },

  onInviteInput(event) { this.setData({ inviteInput: String(event.detail.value || "").trim().toUpperCase() }); },

  async bindInvite() {
    if (this.data.binding || !this.data.inviteInput || (this.data.overview && this.data.overview.inviter)) return;
    this.setData({ binding: true });
    try {
      await api.bindInvite(this.data.inviteInput);
      this.setData({ inviteInput: "" });
      wx.showToast({ title: "绑定成功", icon: "success" });
      await this.loadProfile();
    } catch (error) {
      wx.showToast({ title: error.message || "绑定失败", icon: "none" });
    } finally {
      this.setData({ binding: false });
    }
  },

  copyInviteCode() {
    const code = this.data.overview && this.data.overview.inviteCode;
    if (code) wx.setClipboardData({ data: code });
  },

  onShareAppMessage() {
    return { title: "来雄飞肉片一起吃一碗", path: "/pages/home/home?source=friend" };
  }
});

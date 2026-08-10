const api = require("../../services/v2");
const { invalidateCache, isCacheFresh, readCache, writeCache } = require("../../utils/v2-cache");
const { dateTime } = require("../../utils/v2-format");

const PROFILE_CACHE_KEY = "profile";
const PROFILE_CACHE_MS = 30_000;

Page({
  data: { loading: true, error: "", home: null, overview: null, inviteInput: "", binding: false },

  onLoad() {
    const cached = readCache(PROFILE_CACHE_KEY);
    if (cached) this.applyProfile(cached);
  },

  onShow() {
    if (!isCacheFresh(PROFILE_CACHE_KEY, PROFILE_CACHE_MS)) this.loadProfile();
  },
  onPullDownRefresh() { this.loadProfile().finally(() => wx.stopPullDownRefresh()); },

  loadProfile() {
    if (this.profileRequest) return this.profileRequest;
    const hasData = this.hasProfileData || Boolean(readCache(PROFILE_CACHE_KEY));
    this.setData({ loading: !hasData, error: "" });
    this.profileRequest = Promise.all([api.getHome(), api.getInviteOverview()]).then((results) => {
      const home = results[0];
      const overview = results[1];
      const value = { home, overview };
      writeCache(PROFILE_CACHE_KEY, value);
      this.applyProfile(value);
    }).catch((error) => {
      if (this.hasProfileData) wx.showToast({ title: "个人信息刷新失败", icon: "none" });
      else this.setData({ loading: false, error: error.message || "个人信息加载失败" });
    }).finally(() => {
      this.profileRequest = null;
    });
    return this.profileRequest;
  },

  applyProfile({ home, overview }) {
      this.hasProfileData = true;
      this.setData({
        loading: false,
        error: "",
        home,
        overview: { ...overview, invitees: (overview.invitees || []).map((item) => ({ ...item, boundText: dateTime(item.boundAt) })) }
      });
  },

  onInviteInput(event) { this.setData({ inviteInput: String(event.detail.value || "").trim().toUpperCase() }); },

  async bindInvite() {
    if (this.data.binding || !this.data.inviteInput || (this.data.overview && this.data.overview.inviter)) return;
    this.setData({ binding: true });
    try {
      await api.bindInvite(this.data.inviteInput);
      this.setData({ inviteInput: "" });
      invalidateCache(PROFILE_CACHE_KEY);
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
    return { title: "来祯好七福鼎肉片一起吃一碗", path: "/pages/home/home?source=friend" };
  }
});

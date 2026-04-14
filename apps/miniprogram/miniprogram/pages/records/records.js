const { fetchMyRecords } = require("../../services/member");
const { getAppState } = require("../../utils/session");
const { refreshMemberState } = require("../../utils/member-access");
const { formatDateTime } = require("../../utils/format");

Page({
  data: {
    ready: false,
    hasMember: false,
    loadError: "",
    visits: [],
    loading: false,
    firstVisitCount: 0,
    totalCount: 0
  },
  onShow() {
    this.refresh();
  },
  async refresh() {
    this.setData({
      loading: true,
      ready: false,
      loadError: ""
    });

    try {
      await refreshMemberState();
      const response = await fetchMyRecords();
      const visits = response.visits
        .slice()
        .sort((left, right) => new Date(right.verifiedAt).getTime() - new Date(left.verifiedAt).getTime())
        .map((item) => ({
          ...item,
          verifiedAtLabel: formatDateTime(item.verifiedAt),
          visitTypeText: item.isFirstValidVisit ? "首次有效消费" : "到店核销",
          visitTagClass: item.isFirstValidVisit ? "status-ready" : "status-used"
        }));
      this.setData({
        ready: true,
        hasMember: true,
        visits,
        firstVisitCount: visits.filter((item) => item.isFirstValidVisit).length,
        totalCount: visits.length
      });
    } catch (error) {
      const member = getAppState().member || null;
      const message = error.message || "加载消费记录失败";
      this.setData({
        ready: true,
        hasMember: !!member,
        loadError: message,
        visits: member ? this.data.visits : [],
        firstVisitCount: member ? this.data.firstVisitCount : 0,
        totalCount: member ? this.data.totalCount : 0
      });
      if (member) {
        wx.showToast({
          icon: "none",
          title: message
        });
      }
    } finally {
      this.setData({ loading: false });
    }
  }
});

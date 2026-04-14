const { fetchMyFeedback, submitFeedback } = require("../../services/staff");
const { decorateFeedbackTicket, getFeedbackCategoryOptions } = require("../../utils/feedback");
const { requireStaffAccess } = require("../../utils/staff-access");

const CATEGORY_OPTIONS = getFeedbackCategoryOptions("STAFF");

Page({
  data: {
    loading: true,
    submitting: false,
    tickets: [],
    categoryOptions: CATEGORY_OPTIONS,
    categoryIndex: 0,
    title: "",
    content: "",
    contactName: "",
    contactInfo: "",
    errorMessage: ""
  },
  onShow() {
    this.refresh();
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [field]: event.detail.value
    });
  },
  onCategoryChange(event) {
    this.setData({
      categoryIndex: Number(event.detail.value) || 0
    });
  },
  async refresh() {
    const access = await requireStaffAccess();
    if (!access) {
      this.setData({
        loading: false,
        tickets: []
      });
      return;
    }

    this.setData({
      loading: true,
      errorMessage: ""
    });
    try {
      const response = await fetchMyFeedback(access.sessionToken);
      this.setData({
        tickets: (response.tickets || []).map(decorateFeedbackTicket),
        contactName: this.data.contactName || access.staffProfile.displayName || "",
        contactInfo: this.data.contactInfo || access.staffProfile.username || ""
      });
    } catch (error) {
      this.setData({
        tickets: [],
        errorMessage: error.message || "加载门店反馈失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  async submit() {
    if (this.data.submitting) {
      return;
    }

    const access = await requireStaffAccess();
    if (!access) {
      return;
    }

    const title = `${this.data.title || ""}`.trim();
    const content = `${this.data.content || ""}`.trim();
    if (title.length < 4 || content.length < 8) {
      wx.showToast({
        icon: "none",
        title: "标题至少 4 个字，描述至少 8 个字"
      });
      return;
    }

    const category = CATEGORY_OPTIONS[this.data.categoryIndex] || CATEGORY_OPTIONS[0];
    this.setData({ submitting: true });
    try {
      await submitFeedback({
        sessionToken: access.sessionToken,
        title,
        content,
        category: category.value,
        contactName: `${this.data.contactName || ""}`.trim(),
        contactInfo: `${this.data.contactInfo || ""}`.trim(),
        sourcePage: "/pages/staff-feedback/staff-feedback"
      });
      wx.showToast({
        icon: "success",
        title: "反馈已提交"
      });
      this.setData({
        title: "",
        content: ""
      });
      await this.refresh();
    } catch (error) {
      wx.showToast({
        icon: "none",
        title: error.message || "提交失败"
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

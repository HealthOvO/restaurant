const { fetchMemberState, fetchMyFeedback, submitFeedback } = require("../../services/member");
const { decorateFeedbackTicket, getFeedbackCategoryOptions } = require("../../utils/feedback");

const CATEGORY_OPTIONS = getFeedbackCategoryOptions("MEMBER");

Page({
  data: {
    loading: true,
    submitting: false,
    member: null,
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
    this.setData({
      loading: true,
      errorMessage: ""
    });

    try {
      const [stateResponse, feedbackResponse] = await Promise.all([
        fetchMemberState().catch(() => ({ member: null })),
        fetchMyFeedback()
      ]);
      const member = stateResponse.member || null;
      this.setData({
        member,
        tickets: (feedbackResponse.tickets || []).map(decorateFeedbackTicket),
        contactName: this.data.contactName || (member && member.nickname) || "",
        contactInfo: this.data.contactInfo || (member && member.phone) || ""
      });
    } catch (error) {
      this.setData({
        member: null,
        tickets: [],
        errorMessage: error.message || "加载反馈记录失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  async submit() {
    if (this.data.submitting) {
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
        title,
        content,
        category: category.value,
        contactName: `${this.data.contactName || ""}`.trim(),
        contactInfo: `${this.data.contactInfo || ""}`.trim(),
        sourcePage: "/pages/feedback/feedback"
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

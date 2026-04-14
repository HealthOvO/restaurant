const { formatDateTime } = require("./format");

const CATEGORY_LABELS = {
  BUG: "页面异常",
  POINTS: "积分问题",
  VOUCHER: "菜品券问题",
  VISIT: "到店核销",
  INVITE: "邀请关系",
  STAFF_TOOL: "店员工具",
  SUGGESTION: "建议优化",
  OTHER: "其他问题"
};

const STATUS_META = {
  OPEN: {
    label: "待处理",
    tagClass: "tag"
  },
  PROCESSING: {
    label: "处理中",
    tagClass: "tag"
  },
  RESOLVED: {
    label: "已解决",
    tagClass: "tag tag-success"
  }
};

const PRIORITY_LABELS = {
  NORMAL: "普通",
  HIGH: "优先",
  URGENT: "紧急"
};

const MEMBER_CATEGORY_OPTIONS = [
  "BUG",
  "POINTS",
  "VOUCHER",
  "VISIT",
  "INVITE",
  "SUGGESTION",
  "OTHER"
];

const STAFF_CATEGORY_OPTIONS = ["BUG", "VISIT", "VOUCHER", "STAFF_TOOL", "SUGGESTION", "OTHER"];

function createCategoryOption(value) {
  return {
    value,
    label: CATEGORY_LABELS[value] || value
  };
}

function getFeedbackCategoryOptions(sourceType) {
  const values = sourceType === "STAFF" ? STAFF_CATEGORY_OPTIONS : MEMBER_CATEGORY_OPTIONS;
  return values.map(createCategoryOption);
}

function getFeedbackCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category || "未分类";
}

function getFeedbackStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.OPEN;
}

function getFeedbackPriorityLabel(priority) {
  return PRIORITY_LABELS[priority] || priority || "普通";
}

function decorateFeedbackTicket(ticket) {
  const statusMeta = getFeedbackStatusMeta(ticket.status);
  return {
    ...ticket,
    categoryLabel: getFeedbackCategoryLabel(ticket.category),
    statusLabel: statusMeta.label,
    statusTagClass: statusMeta.tagClass,
    priorityLabel: getFeedbackPriorityLabel(ticket.priority),
    createdAtLabel: formatDateTime(ticket.createdAt),
    handledAtLabel: ticket.handledAt ? formatDateTime(ticket.handledAt) : "",
    ownerReplyText: ticket.ownerReply || "老板还在处理中，处理后会在这里回复。"
  };
}

module.exports = {
  decorateFeedbackTicket,
  getFeedbackCategoryOptions,
  getFeedbackCategoryLabel,
  getFeedbackPriorityLabel,
  getFeedbackStatusMeta
};

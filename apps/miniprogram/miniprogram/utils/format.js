function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatInviteRelationStatus(status) {
  if (!status) {
    return "未绑定邀请关系";
  }

  if (status === "ACTIVATED") {
    return "邀请已激活";
  }

  if (status === "PENDING") {
    return "邀请待激活";
  }

  if (status === "ADJUSTED") {
    return "邀请关系已调整";
  }

  return status;
}

module.exports = {
  formatDateTime,
  formatInviteRelationStatus
};

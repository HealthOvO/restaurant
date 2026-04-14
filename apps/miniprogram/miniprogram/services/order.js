const { callFunction } = require("./cloud");

module.exports = {
  fetchMenuCatalog() {
    return callFunction("menu-catalog", {});
  },
  previewOrder(data) {
    return callFunction("order-preview", data);
  },
  createOrder(data) {
    return callFunction("order-create", data);
  },
  fetchMyOrders() {
    return callFunction("order-list-mine", {});
  },
  fetchOrderDetail(orderId) {
    return callFunction("order-detail", { orderId });
  },
  fetchStaffOrders(data) {
    return callFunction("staff-order-list", data);
  },
  fetchStaffOrderDetail(data) {
    return callFunction("staff-order-detail", data);
  },
  updateStaffOrderStatus(data) {
    return callFunction("staff-order-update", data);
  }
};

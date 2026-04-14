export const DEFAULT_STORE_ID = "default-store";
export const DEFAULT_RULE_VERSION = 1;
export const DEFAULT_VOUCHER_VALID_DAYS = 30;

export const COLLECTIONS = {
  members: "members",
  inviteRelations: "invite_relations",
  visitRecords: "visit_records",
  rewardRules: "reward_rules",
  pointExchangeItems: "point_exchange_items",
  memberPointTransactions: "member_point_transactions",
  dishVouchers: "dish_vouchers",
  voucherRedemptions: "voucher_redemptions",
  menuCategories: "menu_categories",
  menuItems: "menu_items",
  storeConfigs: "store_configs",
  orderRecords: "order_records",
  orderStatusLogs: "order_status_logs",
  feedbackTickets: "feedback_tickets",
  opsTasks: "ops_tasks",
  staffUsers: "staff_users",
  auditLogs: "audit_logs"
} as const;

export const ACTIVITY_SWITCH_KEYS = {
  globalEnabled: "GLOBAL_ACTIVITY_ENABLED",
  welcomeRewardEnabled: "WELCOME_REWARD_ENABLED",
  voucherAlertEnabled: "VOUCHER_ALERT_ENABLED"
} as const;

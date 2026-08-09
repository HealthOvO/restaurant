import type {
  V2DashboardStats,
  V2ExchangeItem,
  V2ExchangeItemSaveInput,
  V2Member,
  V2MemberDetail,
  V2Order,
  V2OwnerSession,
  V2Product,
  V2ProductSaveInput,
  V2StoreConfig,
  V2StoreConfigSaveInput
} from "@restaurant/shared";

export interface MerchantApi {
  login(username: string, password: string): Promise<V2OwnerSession>;
  profile(token: string): Promise<V2OwnerSession["owner"]>;
  getDashboard(token: string): Promise<V2DashboardStats>;
  listOrders(token: string, status?: V2Order["status"]): Promise<V2Order[]>;
  completeOrder(token: string, orderId: string): Promise<V2Order>;
  cancelCouponOrder(token: string, orderId: string): Promise<V2Order>;
  refundOrder(token: string, orderId: string): Promise<V2Order>;
  listProducts(token: string): Promise<V2Product[]>;
  saveProduct(token: string, input: V2ProductSaveInput): Promise<V2Product>;
  listExchangeItems(token: string): Promise<V2ExchangeItem[]>;
  saveExchangeItem(token: string, input: V2ExchangeItemSaveInput): Promise<V2ExchangeItem>;
  searchMembers(token: string, query: string): Promise<V2Member[]>;
  getMemberDetail(token: string, memberId: string): Promise<V2MemberDetail>;
  getStoreConfig(token: string): Promise<V2StoreConfig>;
  saveStoreConfig(token: string, input: V2StoreConfigSaveInput): Promise<V2StoreConfig>;
}

export class MerchantApiError extends Error {
  constructor(message: string, readonly code = "API_ERROR", readonly requestId?: string) {
    super(message);
    this.name = "MerchantApiError";
  }
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
  requestId?: string;
}

const cloudEnv = import.meta.env.VITE_TCB_ENV_ID?.trim();
let cloudAppPromise: Promise<any> | undefined;
let anonymousReady = false;

async function cloudApp() {
  if (!cloudEnv) throw new MerchantApiError("后台尚未配置云开发环境", "SYSTEM_NOT_READY");
  cloudAppPromise ??= import("@cloudbase/js-sdk").then(({ default: cloudbase }) => cloudbase.init({ env: cloudEnv }));
  const app = await cloudAppPromise;
  if (!anonymousReady) {
    const auth = app.auth({ persistence: "session" });
    const state = await auth.getLoginState?.();
    if (!state) await auth.anonymousAuthProvider().signIn();
    anonymousReady = true;
  }
  return app;
}

async function callOwner<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  try {
    const app = await cloudApp();
    const response = await app.callFunction({ name: "v2-owner-api", data: { action, payload } });
    const result = response?.result as ApiResponse<T> | undefined;
    if (!result) throw new MerchantApiError("请求没有成功，请重试", "EMPTY_RESPONSE");
    if (!result.ok || result.data === undefined) {
      throw new MerchantApiError(result.message || "操作失败", result.code, result.requestId);
    }
    return result.data;
  } catch (error) {
    if (error instanceof MerchantApiError) throw error;
    throw new MerchantApiError(error instanceof Error ? error.message : "网络连接失败");
  }
}

const cloudApi: MerchantApi = {
  login: (username, password) => callOwner("auth.login", { username, password }),
  profile: (sessionToken) => callOwner("auth.profile", { sessionToken }),
  getDashboard: (sessionToken) => callOwner("dashboard.get", { sessionToken }),
  listOrders: (sessionToken, status) => callOwner("orders.list", { sessionToken, status }),
  completeOrder: (sessionToken, orderId) => callOwner("orders.complete", { sessionToken, orderId }),
  cancelCouponOrder: (sessionToken, orderId) => callOwner("orders.cancelCoupon", { sessionToken, orderId }),
  refundOrder: (sessionToken, orderId) => callOwner("orders.refund", { sessionToken, orderId }),
  listProducts: (sessionToken) => callOwner("products.list", { sessionToken }),
  saveProduct: (sessionToken, input) => callOwner("products.save", { sessionToken, ...input }),
  listExchangeItems: (sessionToken) => callOwner("exchange.list", { sessionToken }),
  saveExchangeItem: (sessionToken, input) => callOwner("exchange.save", { sessionToken, ...input }),
  searchMembers: (sessionToken, query) => callOwner("members.search", { sessionToken, query }),
  getMemberDetail: (sessionToken, memberId) => callOwner("members.detail", { sessionToken, memberId }),
  getStoreConfig: (sessionToken) => callOwner("config.get", { sessionToken }),
  saveStoreConfig: (sessionToken, input) => callOwner("config.save", { sessionToken, ...input })
};

export async function createMerchantApi(): Promise<MerchantApi> {
  if (import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock") {
    const { mockMerchantApi } = await import("../mocks/mockApi");
    return mockMerchantApi;
  }
  return cloudApi;
}

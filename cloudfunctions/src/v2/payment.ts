import { createDecipheriv, createSign, createVerify, randomBytes } from "node:crypto";
import { DomainError, type V2Order } from "@restaurant/shared";

export interface V2PayParams {
  mode: "MOCK" | "WECHAT";
  timeStamp?: string;
  nonceStr?: string;
  package?: string;
  signType?: "RSA";
  paySign?: string;
  mockOrderId?: string;
}

export interface V2PaymentQueryResult {
  status: "SUCCESS" | "NOTPAY" | "CLOSED";
  transactionId?: string;
}

export interface V2RefundProviderResult {
  status: "PROCESSING" | "SUCCESS" | "CLOSED" | "ABNORMAL";
  refundId?: string;
}

export interface V2PaymentProvider {
  readonly mode: "MOCK" | "WECHAT";
  prepare(order: V2Order): Promise<V2PayParams>;
  query(outTradeNo: string): Promise<V2PaymentQueryResult>;
  close(outTradeNo: string): Promise<void>;
  refund(order: V2Order, outRefundNo: string): Promise<V2RefundProviderResult>;
  queryRefund(outRefundNo: string): Promise<V2RefundProviderResult>;
  markMockPaid?(outTradeNo: string): string;
}

export interface WeChatPayConfig {
  appId: string;
  mchId: string;
  merchantCertificateSerial: string;
  merchantPrivateKey: string;
  wechatPayPublicKeyId: string;
  wechatPayPublicKey: string;
  apiV3Key: string;
  paymentNotifyUrl: string;
  refundNotifyUrl: string;
}

interface WeChatEncryptedResource {
  algorithm: string;
  ciphertext: string;
  associated_data?: string;
  nonce: string;
}

export interface WeChatNotificationEnvelope {
  id: string;
  event_type: string;
  resource_type: string;
  resource: WeChatEncryptedResource;
}

export interface WeChatNotificationHeaders {
  serial: string;
  signature: string;
  timestamp: string;
  nonce: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DomainError("WECHAT_PAY_NOT_CONFIGURED", `微信支付配置缺失：${name}`);
  return value;
}

function pemValue(name: string): string {
  const value = requiredEnv(name);
  if (value.includes("BEGIN ")) return value.replace(/\\n/g, "\n");
  const decoded = Buffer.from(value, "base64").toString("utf8");
  if (!decoded.includes("BEGIN ")) throw new DomainError("WECHAT_PAY_NOT_CONFIGURED", `微信支付密钥格式错误：${name}`);
  return decoded;
}

export function loadWeChatPayConfig(): WeChatPayConfig {
  const apiV3Key = requiredEnv("WECHAT_PAY_API_V3_KEY");
  if (Buffer.byteLength(apiV3Key) !== 32) {
    throw new DomainError("WECHAT_PAY_NOT_CONFIGURED", "WECHAT_PAY_API_V3_KEY 必须是 32 字节");
  }
  return {
    appId: requiredEnv("WECHAT_PAY_APP_ID"),
    mchId: requiredEnv("WECHAT_PAY_MCH_ID"),
    merchantCertificateSerial: requiredEnv("WECHAT_PAY_CERT_SERIAL"),
    merchantPrivateKey: pemValue("WECHAT_PAY_PRIVATE_KEY"),
    wechatPayPublicKeyId: requiredEnv("WECHAT_PAY_PUBLIC_KEY_ID"),
    wechatPayPublicKey: pemValue("WECHAT_PAY_PUBLIC_KEY"),
    apiV3Key,
    paymentNotifyUrl: requiredEnv("WECHAT_PAY_NOTIFY_URL"),
    refundNotifyUrl: requiredEnv("WECHAT_REFUND_NOTIFY_URL")
  };
}

function rsaSign(message: string, privateKey: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(privateKey, "base64");
}

export function verifyWeChatSignature(message: string, signature: string, publicKey: string): boolean {
  if (signature.startsWith("WECHATPAY/SIGNTEST/")) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(message);
  verifier.end();
  return verifier.verify(publicKey, signature, "base64");
}

export function decryptWeChatResource(resource: WeChatEncryptedResource, apiV3Key: string): unknown {
  if (resource.algorithm !== "AEAD_AES_256_GCM") throw new DomainError("WECHAT_CALLBACK_INVALID", "不支持的微信支付回调加密算法");
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  if (encrypted.length <= 16) throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付回调密文无效");
  try {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(resource.nonce));
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    decipher.setAAD(Buffer.from(resource.associated_data || ""));
    const plain = Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - 16)), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as unknown;
  } catch {
    throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付回调解密失败");
  }
}

export function parseWeChatNotification(
  rawBody: string,
  headers: WeChatNotificationHeaders,
  config: WeChatPayConfig = loadWeChatPayConfig()
): { envelope: WeChatNotificationEnvelope; data: unknown } {
  if (headers.serial !== config.wechatPayPublicKeyId) {
    throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付验签公钥不匹配");
  }
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付回调时间戳无效");
  }
  const message = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`;
  if (!verifyWeChatSignature(message, headers.signature, config.wechatPayPublicKey)) {
    throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付回调验签失败");
  }
  let envelope: WeChatNotificationEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WeChatNotificationEnvelope;
  } catch {
    throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付回调格式错误");
  }
  if (!envelope.resource || envelope.resource_type !== "encrypt-resource") {
    throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付回调资源无效");
  }
  return { envelope, data: decryptWeChatResource(envelope.resource, config.apiV3Key) };
}

export class MockV2PaymentProvider implements V2PaymentProvider {
  readonly mode = "MOCK" as const;
  private paymentStates = new Map<string, V2PaymentQueryResult>();
  private refundStates = new Map<string, V2RefundProviderResult>();

  constructor(private readonly autoRefundSuccess = true) {}

  async prepare(order: V2Order): Promise<V2PayParams> {
    if (process.env.NODE_ENV === "production") {
      throw new DomainError("MOCK_PAYMENT_DISABLED", "正式环境不能使用模拟支付");
    }
    this.paymentStates.set(order.orderNo, this.paymentStates.get(order.orderNo) ?? { status: "NOTPAY" });
    return { mode: "MOCK", mockOrderId: order._id };
  }

  async query(outTradeNo: string) {
    return this.paymentStates.get(outTradeNo) ?? { status: "NOTPAY" as const };
  }

  async close(outTradeNo: string) {
    const current = await this.query(outTradeNo);
    if (current.status === "SUCCESS") {
      throw new DomainError("ORDER_ALREADY_PAID", "订单已经支付，不能关单");
    }
    this.paymentStates.set(outTradeNo, { status: "CLOSED" });
  }

  async refund(_order: V2Order, outRefundNo: string) {
    const result: V2RefundProviderResult = this.autoRefundSuccess
      ? { status: "SUCCESS", refundId: `mock-${outRefundNo}` }
      : { status: "PROCESSING", refundId: `mock-${outRefundNo}` };
    this.refundStates.set(outRefundNo, result);
    return result;
  }

  async queryRefund(outRefundNo: string) {
    return this.refundStates.get(outRefundNo) ?? { status: "PROCESSING" as const };
  }

  markPaid(outTradeNo: string, transactionId = `mock-${outTradeNo}`) {
    this.paymentStates.set(outTradeNo, { status: "SUCCESS", transactionId });
  }

  markMockPaid(outTradeNo: string) {
    const transactionId = `mock-${outTradeNo}`;
    this.markPaid(outTradeNo, transactionId);
    return transactionId;
  }

  markRefunded(outRefundNo: string, refundId = `mock-${outRefundNo}`) {
    this.refundStates.set(outRefundNo, { status: "SUCCESS", refundId });
  }
}

export class WeChatV2PaymentProvider implements V2PaymentProvider {
  readonly mode = "WECHAT" as const;
  private loadedConfig?: WeChatPayConfig;

  constructor(config?: WeChatPayConfig, private readonly request: typeof fetch = fetch) {
    this.loadedConfig = config;
  }

  private config(): WeChatPayConfig {
    this.loadedConfig ??= loadWeChatPayConfig();
    return this.loadedConfig;
  }

  private async api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const config = this.config();
    const url = new URL(path, "https://api.mch.weixin.qq.com");
    const rawBody = body === undefined ? "" : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const canonical = `${method}\n${url.pathname}${url.search}\n${timestamp}\n${nonce}\n${rawBody}\n`;
    const signature = rsaSign(canonical, config.merchantPrivateKey);
    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.merchantCertificateSerial}",signature="${signature}"`;
    let response: Response;
    try {
      response = await this.request(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          Authorization: authorization,
          "Wechatpay-Serial": config.wechatPayPublicKeyId
        },
        body: body === undefined ? undefined : rawBody,
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      throw new DomainError("WECHAT_PAY_UNAVAILABLE", "微信支付服务暂时不可用，请稍后重试");
    }
    const responseBody = await response.text();
    const responseTimestamp = response.headers.get("wechatpay-timestamp") || "";
    const responseNonce = response.headers.get("wechatpay-nonce") || "";
    const responseSignature = response.headers.get("wechatpay-signature") || "";
    const responseSerial = response.headers.get("wechatpay-serial") || "";
    if (responseSerial !== config.wechatPayPublicKeyId || !responseTimestamp || !responseNonce || !responseSignature ||
      !verifyWeChatSignature(`${responseTimestamp}\n${responseNonce}\n${responseBody}\n`, responseSignature, config.wechatPayPublicKey)) {
      throw new DomainError("WECHAT_PAY_INVALID_RESPONSE", "微信支付应答验签失败");
    }
    if (!response.ok) {
      let code = "";
      try { code = String((JSON.parse(responseBody) as { code?: string }).code || ""); } catch { code = ""; }
      throw new DomainError("WECHAT_PAY_API_ERROR", `微信支付请求失败${code ? `（${code}）` : ""}`);
    }
    return (responseBody ? JSON.parse(responseBody) : undefined) as T;
  }

  async prepare(order: V2Order): Promise<V2PayParams> {
    const config = this.config();
    const result = await this.api<{ prepay_id: string }>("POST", "/v3/pay/transactions/jsapi", {
      appid: config.appId,
      mchid: config.mchId,
      description: order.lineItems.map((item) => item.productName).join("、").slice(0, 40) || "小吃点餐",
      out_trade_no: order.orderNo,
      notify_url: config.paymentNotifyUrl,
      amount: { total: order.payableAmount, currency: "CNY" },
      payer: { openid: order.memberOpenId }
    });
    if (!result.prepay_id) throw new DomainError("WECHAT_PAY_INVALID_RESPONSE", "微信支付未返回预支付单号");
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = randomBytes(16).toString("hex");
    const packageValue = `prepay_id=${result.prepay_id}`;
    return {
      mode: "WECHAT",
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: "RSA",
      paySign: rsaSign(`${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, config.merchantPrivateKey)
    };
  }

  async query(outTradeNo: string): Promise<V2PaymentQueryResult> {
    const config = this.config();
    const result = await this.api<{ trade_state: string; transaction_id?: string }>(
      "GET",
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.mchId)}`
    );
    if (result.trade_state === "SUCCESS") return { status: "SUCCESS", transactionId: result.transaction_id };
    if (result.trade_state === "CLOSED") return { status: "CLOSED" };
    return { status: "NOTPAY" };
  }

  async close(outTradeNo: string): Promise<void> {
    await this.api<void>("POST", `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, { mchid: this.config().mchId });
  }

  async refund(order: V2Order, outRefundNo: string): Promise<V2RefundProviderResult> {
    const config = this.config();
    const payment = await this.query(order.orderNo);
    if (payment.status !== "SUCCESS") throw new DomainError("ORDER_NOT_REFUNDABLE", "微信支付订单状态不允许退款");
    const result = await this.api<{ status: V2RefundProviderResult["status"]; refund_id?: string }>("POST", "/v3/refund/domestic/refunds", {
      out_trade_no: order.orderNo,
      out_refund_no: outRefundNo,
      reason: "商家整单退款",
      notify_url: config.refundNotifyUrl,
      amount: { refund: order.paidAmount, total: order.paidAmount, currency: "CNY" }
    });
    return { status: result.status, refundId: result.refund_id };
  }

  async queryRefund(outRefundNo: string): Promise<V2RefundProviderResult> {
    const result = await this.api<{ status: V2RefundProviderResult["status"]; refund_id?: string }>(
      "GET",
      `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`
    );
    return { status: result.status, refundId: result.refund_id };
  }
}

export function createV2PaymentProvider(): V2PaymentProvider {
  if (process.env.PAYMENT_PROVIDER === "mock" && process.env.NODE_ENV !== "production") {
    return new MockV2PaymentProvider();
  }
  return new WeChatV2PaymentProvider();
}

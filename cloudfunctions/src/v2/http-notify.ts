import { DomainError } from "@restaurant/shared";
import { createV2Runtime } from "./handler";
import { loadWeChatPayConfig, parseWeChatNotification, type WeChatNotificationHeaders } from "./payment";

interface HttpEvent {
  body?: string;
  rawBody?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
}

function rawBody(event: HttpEvent): string {
  const body = event.rawBody ?? event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

function notificationHeaders(headers: HttpEvent["headers"]): WeChatNotificationHeaders {
  const normalized = new Map(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value || ""]));
  return {
    serial: normalized.get("wechatpay-serial") || "",
    signature: normalized.get("wechatpay-signature") || "",
    timestamp: normalized.get("wechatpay-timestamp") || "",
    nonce: normalized.get("wechatpay-nonce") || ""
  };
}

function success() {
  return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
}

function failure(error: unknown) {
  const known = error instanceof DomainError;
  if (!known) console.error("[v2] wechat callback failed", error);
  return {
    statusCode: known ? 400 : 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "FAIL", message: known ? error.message : "回调处理失败" })
  };
}

export async function handlePaymentNotification(event: HttpEvent) {
  try {
    const config = loadWeChatPayConfig();
    const parsed = parseWeChatNotification(rawBody(event), notificationHeaders(event.headers), config);
    if (parsed.envelope.event_type !== "TRANSACTION.SUCCESS") {
      throw new DomainError("WECHAT_CALLBACK_INVALID", "不是支付成功通知");
    }
    const data = parsed.data as {
      appid?: string; mchid?: string; out_trade_no?: string; transaction_id?: string; trade_state?: string;
      payer?: { openid?: string }; amount?: { total?: number };
    };
    if (data.appid !== config.appId || data.mchid !== config.mchId || data.trade_state !== "SUCCESS" ||
      !data.out_trade_no || !data.transaction_id || !data.payer?.openid || !Number.isInteger(data.amount?.total)) {
      throw new DomainError("WECHAT_CALLBACK_INVALID", "微信支付通知业务数据不完整");
    }
    const { application } = createV2Runtime();
    await application.confirmWeChatPayment({
      outTradeNo: data.out_trade_no,
      transactionId: data.transaction_id,
      openId: data.payer.openid,
      amount: data.amount!.total!
    });
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function handleRefundNotification(event: HttpEvent) {
  try {
    const config = loadWeChatPayConfig();
    const parsed = parseWeChatNotification(rawBody(event), notificationHeaders(event.headers), config);
    if (parsed.envelope.event_type !== "REFUND.SUCCESS" && parsed.envelope.event_type !== "REFUND.CLOSED" && parsed.envelope.event_type !== "REFUND.ABNORMAL") {
      throw new DomainError("WECHAT_CALLBACK_INVALID", "不是退款状态通知");
    }
    const data = parsed.data as {
      mchid?: string; out_refund_no?: string; refund_id?: string; refund_status?: "SUCCESS" | "CLOSED" | "ABNORMAL";
      amount?: { refund?: number };
    };
    if (data.mchid !== config.mchId || !data.out_refund_no || !data.refund_status || !Number.isInteger(data.amount?.refund)) {
      throw new DomainError("WECHAT_CALLBACK_INVALID", "微信退款通知业务数据不完整");
    }
    const { application } = createV2Runtime();
    await application.recordWeChatRefund({
      outRefundNo: data.out_refund_no,
      status: data.refund_status,
      refundId: data.refund_id,
      amount: data.amount!.refund!
    });
    return success();
  } catch (error) {
    return failure(error);
  }
}

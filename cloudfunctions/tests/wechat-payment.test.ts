import { createCipheriv, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classifyV2RefundSubmissionError, parseWeChatNotification, WeChatV2PaymentProvider, type WeChatPayConfig } from "../src/v2/payment";
import { DomainError, type V2Order } from "@restaurant/shared";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const apiV3Key = "12345678901234567890123456789012";

const config: WeChatPayConfig = {
  appId: "wx-test-app",
  mchId: "1900000001",
  merchantCertificateSerial: "MERCHANT-SERIAL",
  merchantPrivateKey: privatePem,
  wechatPayPublicKeyId: "PUB_KEY_ID_0111111111",
  wechatPayPublicKey: publicPem,
  apiV3Key,
  paymentNotifyUrl: "https://example.com/payment-notify",
  refundNotifyUrl: "https://example.com/refund-notify"
};

function sign(message: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(privatePem, "base64");
}

function encryptResource(data: unknown) {
  const nonce = randomBytes(12).toString("base64url").slice(0, 12);
  const associatedData = "transaction";
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
  return { algorithm: "AEAD_AES_256_GCM", ciphertext: encrypted.toString("base64"), associated_data: associatedData, nonce };
}

describe("WeChat Pay API v3 adapter", () => {
  it("verifies and decrypts a signed payment callback", () => {
    const envelope = {
      id: "notice-1",
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "encrypt-resource",
      resource: encryptResource({ out_trade_no: "V2ORDER", transaction_id: "WX001", trade_state: "SUCCESS" })
    };
    const body = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = "callback-nonce";
    const parsed = parseWeChatNotification(body, {
      serial: config.wechatPayPublicKeyId,
      signature: sign(`${timestamp}\n${nonce}\n${body}\n`),
      timestamp,
      nonce
    }, config);
    expect(parsed.data).toMatchObject({ out_trade_no: "V2ORDER", trade_state: "SUCCESS" });
  });

  it("rejects callback tampering", () => {
    const body = JSON.stringify({ id: "notice-1", event_type: "TRANSACTION.SUCCESS", resource_type: "encrypt-resource", resource: encryptResource({ ok: true }) });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    expect(() => parseWeChatNotification(`${body} `, {
      serial: config.wechatPayPublicKeyId,
      signature: sign(`${timestamp}\nnonce\n${body}\n`),
      timestamp,
      nonce: "nonce"
    }, config)).toThrow("验签失败");
  });

  it("creates signed mini-program payment parameters from a verified API response", async () => {
    const request = async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String((init?.headers as Record<string, string>).Authorization)).toContain("WECHATPAY2-SHA256-RSA2048");
      expect(JSON.parse(String(init?.body))).toMatchObject({ time_expire: "2026-08-09T10:15:00.000Z" });
      const body = JSON.stringify({ prepay_id: "wx-prepay-001" });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = "response-nonce";
      return new Response(body, {
        status: 200,
        headers: {
          "wechatpay-timestamp": timestamp,
          "wechatpay-nonce": nonce,
          "wechatpay-serial": config.wechatPayPublicKeyId,
          "wechatpay-signature": sign(`${timestamp}\n${nonce}\n${body}\n`)
        }
      });
    };
    const provider = new WeChatV2PaymentProvider(config, request as typeof fetch);
    const order = {
      _id: "order-1", storeId: "store-main", orderNo: "V2ORDER001", requestKey: "request-1",
      memberId: "member-1", memberOpenId: "openid-1", source: "WECHAT_PAY", status: "PENDING_PAYMENT",
      payableAmount: 1500, paidAmount: 0, itemCount: 1, buyerPoints: 10, inviterPoints: 0,
      lineItems: [{ productName: "祯好七福鼎肉片" }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    } as V2Order;
    const result = await provider.prepare(order, "2026-08-09T10:15:00.000Z");
    expect(result).toMatchObject({ mode: "WECHAT", package: "prepay_id=wx-prepay-001", signType: "RSA" });
    expect(result.paySign).toBeTruthy();
  });

  it("preserves signed WeChat business errors and maps a missing transaction explicitly", async () => {
    const signedErrorResponse = (code: string, message = "not found") => {
      const body = JSON.stringify({ code, message });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = "error-response-nonce";
      return new Response(body, {
        status: 404,
        headers: {
          "wechatpay-timestamp": timestamp,
          "wechatpay-nonce": nonce,
          "wechatpay-serial": config.wechatPayPublicKeyId,
          "wechatpay-signature": sign(`${timestamp}\n${nonce}\n${body}\n`)
        }
      });
    };
    const missingProvider = new WeChatV2PaymentProvider(config, (async () => signedErrorResponse("ORDER_NOT_EXIST")) as typeof fetch);
    await expect(missingProvider.query("missing-order")).resolves.toEqual({ status: "NOT_FOUND" });

    const failedProvider = new WeChatV2PaymentProvider(config, (async () => signedErrorResponse("SYSTEM_ERROR")) as typeof fetch);
    await expect(failedProvider.query("failed-order")).rejects.toMatchObject({
      code: "WECHAT_PAY_API_ERROR",
      meta: { wechatCode: "SYSTEM_ERROR", wechatMessage: "not found", httpStatus: 404 }
    });
  });

  it("classifies retryable and definitive refund submission failures", () => {
    expect(classifyV2RefundSubmissionError(new DomainError("WECHAT_PAY_API_ERROR", "limited", {
      wechatCode: "FREQUENCY_LIMITED"
    }))).toMatchObject({ kind: "RETRYABLE", code: "FREQUENCY_LIMITED" });
    expect(classifyV2RefundSubmissionError(new DomainError("WECHAT_PAY_API_ERROR", "no auth", {
      wechatCode: "NO_AUTH"
    }))).toMatchObject({ kind: "REJECTED_RETRY_AFTER_FIX", code: "NO_AUTH" });
    expect(classifyV2RefundSubmissionError(new DomainError("WECHAT_PAY_API_ERROR", "account closed", {
      wechatCode: "USER_ACCOUNT_ABNORMAL"
    }))).toMatchObject({ kind: "REJECTED_PERMANENT", code: "USER_ACCOUNT_ABNORMAL" });
    expect(classifyV2RefundSubmissionError(new DomainError("WECHAT_PAY_API_ERROR", "missing payment", {
      wechatCode: "RESOURCE_NOT_EXISTS"
    }))).toMatchObject({ kind: "REJECTED_PERMANENT", code: "RESOURCE_NOT_EXISTS" });
    expect(classifyV2RefundSubmissionError(new DomainError("WECHAT_PAY_API_ERROR", "bad parameter", {
      wechatCode: "PARAM_ERROR"
    }))).toMatchObject({ kind: "REJECTED_PERMANENT", code: "PARAM_ERROR" });
  });
});

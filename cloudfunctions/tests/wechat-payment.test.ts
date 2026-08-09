import { createCipheriv, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWeChatNotification, WeChatV2PaymentProvider, type WeChatPayConfig } from "../src/v2/payment";
import type { V2Order } from "@restaurant/shared";

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
      lineItems: [{ productName: "雄飞肉片" }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    } as V2Order;
    const result = await provider.prepare(order);
    expect(result).toMatchObject({ mode: "WECHAT", package: "prepay_id=wx-prepay-001", signType: "RSA" });
    expect(result.paySign).toBeTruthy();
  });
});

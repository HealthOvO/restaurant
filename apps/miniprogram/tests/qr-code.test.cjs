const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildMemberQrPayload,
  buildVoucherQrPayload,
  extractMemberCodeFromQr,
  extractVoucherIdFromQr
} = require("../miniprogram/utils/voucher-qrcode");

test("extractVoucherIdFromQr reads voucher ids from protocol payloads", () => {
  const payload = buildVoucherQrPayload("entity_12345678-abcd-efgh");

  assert.equal(payload, "restaurant-voucher://redeem?voucherId=entity_12345678-abcd-efgh");
  assert.equal(extractVoucherIdFromQr(payload), "entity_12345678-abcd-efgh");
});

test("extractVoucherIdFromQr reads nested scene payloads and rejects malformed values", () => {
  const sceneWrapped =
    "/pages/index/index?scene=restaurant-voucher%3A%2F%2Fredeem%3FvoucherId%3Dentity_abcdef12-1234-5678";

  assert.equal(extractVoucherIdFromQr(sceneWrapped), "entity_abcdef12-1234-5678");
  assert.equal(extractVoucherIdFromQr("restaurant-voucher://redeem?foo=bar"), "");
  assert.equal(extractVoucherIdFromQr("/pages/index/index?foo=bar"), "");
});

test("extractMemberCodeFromQr reads member codes from protocol payloads and plain text", () => {
  const payload = buildMemberQrPayload("m00000008");

  assert.equal(payload, "restaurant-member://card?memberCode=M00000008");
  assert.equal(extractMemberCodeFromQr(payload), "M00000008");
  assert.equal(extractMemberCodeFromQr("m00000009"), "M00000009");
});

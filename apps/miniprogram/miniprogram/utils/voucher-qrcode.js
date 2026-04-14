const qrcode = require("./vendor/qrcode");

const VOUCHER_QR_PROTOCOL = "restaurant-voucher://redeem";
const MEMBER_QR_PROTOCOL = "restaurant-member://card";
const SAFE_RAW_VALUE_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const MEMBER_CODE_PATTERN = /^[A-Z][A-Z0-9_-]{3,127}$/;

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function extractQueryValue(rawValue, key) {
  const value = `${rawValue || ""}`.trim();
  if (!value) {
    return "";
  }

  const queryIndex = value.indexOf("?");
  const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : value;
  if (!query) {
    return "";
  }

  const fragments = query.split(/[&#]/);
  for (let index = 0; index < fragments.length; index += 1) {
    const fragment = fragments[index];
    if (!fragment) {
      continue;
    }

    const separatorIndex = fragment.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const currentKey = safeDecode(fragment.slice(0, separatorIndex));
    if (currentKey !== key) {
      continue;
    }

    return safeDecode(fragment.slice(separatorIndex + 1));
  }

  return "";
}

function normalizeRawValue(rawValue) {
  const value = `${rawValue || ""}`.trim();
  if (!value || !SAFE_RAW_VALUE_PATTERN.test(value)) {
    return "";
  }

  return value;
}

function extractSceneValue(rawValue, extractor) {
  const sceneValue = extractQueryValue(rawValue, "scene");
  if (!sceneValue) {
    return "";
  }

  return extractor(sceneValue);
}

function extractPayloadValue(rawValue, options) {
  const value = `${rawValue || ""}`.trim();
  if (!value) {
    return "";
  }

  const sceneValue = extractSceneValue(value, (sceneRawValue) => extractPayloadValue(sceneRawValue, options));
  if (sceneValue) {
    return sceneValue;
  }

  const directValue = extractQueryValue(value, options.key);
  if (directValue) {
    return options.normalize(directValue);
  }

  if (Array.isArray(options.fallbackKeys)) {
    for (let index = 0; index < options.fallbackKeys.length; index += 1) {
      const fallbackValue = extractQueryValue(value, options.fallbackKeys[index]);
      if (fallbackValue) {
        return options.normalize(fallbackValue);
      }
    }
  }

  if (value.indexOf(options.protocol) === 0) {
    return "";
  }

  return options.normalize(value);
}

function buildVoucherQrPayload(voucherId) {
  const normalizedVoucherId = `${voucherId || ""}`.trim();
  if (!normalizedVoucherId) {
    return "";
  }
  return `${VOUCHER_QR_PROTOCOL}?voucherId=${encodeURIComponent(normalizedVoucherId)}`;
}

function buildMemberQrPayload(memberCode) {
  const normalizedMemberCode = `${memberCode || ""}`.trim().toUpperCase();
  if (!normalizedMemberCode) {
    return "";
  }

  return `${MEMBER_QR_PROTOCOL}?memberCode=${encodeURIComponent(normalizedMemberCode)}`;
}

function extractVoucherIdFromQr(rawValue) {
  return extractPayloadValue(rawValue, {
    protocol: VOUCHER_QR_PROTOCOL,
    key: "voucherId",
    fallbackKeys: ["id"],
    normalize: normalizeRawValue
  });
}

function normalizeMemberCode(rawValue) {
  const value = `${rawValue || ""}`.trim().toUpperCase();
  if (!MEMBER_CODE_PATTERN.test(value)) {
    return "";
  }

  return value;
}

function extractMemberCodeFromQr(rawValue) {
  return extractPayloadValue(rawValue, {
    protocol: MEMBER_QR_PROTOCOL,
    key: "memberCode",
    fallbackKeys: ["code"],
    normalize: normalizeMemberCode
  });
}

function drawQrCode(page, canvasId, payload, size) {
  if (!payload) {
    return Promise.resolve();
  }

  const qr = qrcode(0, "M");
  qr.addData(payload, "Byte");
  qr.make();

  const ctx = wx.createCanvasContext(canvasId, page);
  const moduleCount = qr.getModuleCount();
  const quietZone = 4;
  const cellSize = size / (moduleCount + quietZone * 2);
  const offset = quietZone * cellSize;

  ctx.setFillStyle("#ffffff");
  ctx.fillRect(0, 0, size, size);
  ctx.setFillStyle("#1f2330");

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }

      const left = Math.round(offset + col * cellSize);
      const top = Math.round(offset + row * cellSize);
      const right = Math.round(offset + (col + 1) * cellSize);
      const bottom = Math.round(offset + (row + 1) * cellSize);
      ctx.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
    }
  }

  return new Promise((resolve) => {
    ctx.draw(false, resolve);
  });
}

function drawVoucherQrCode(page, canvasId, payload, size) {
  return drawQrCode(page, canvasId, payload, size);
}

function drawMemberQrCode(page, canvasId, payload, size) {
  return drawQrCode(page, canvasId, payload, size);
}

module.exports = {
  buildVoucherQrPayload,
  buildMemberQrPayload,
  extractVoucherIdFromQr,
  extractMemberCodeFromQr,
  drawQrCode,
  drawVoucherQrCode,
  drawMemberQrCode
};

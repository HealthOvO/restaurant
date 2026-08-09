# 阿福肉片点餐积分系统 V2

顾客使用原生微信小程序点餐、支付、取号、赚积分和使用商品券；老板使用独立 Web 后台收单并配置商品、规格和积分。V1 的店员端、手工录单和扫码核销流程已移除。

## 目录

- `apps/miniprogram`：顾客微信小程序
- `apps/admin-web`：商家 Web 后台
- `packages/shared/src/v2`：领域类型、校验、计价和状态机
- `cloudfunctions/src/v2`：订单、积分、邀请、商品券、支付和老板认证
- `docs/deployment.md`：上线配置

## 本地运行

```bash
npm install
npm run review
npm run build:release
VITE_API_MODE=mock npm run dev --workspace @restaurant/admin-web
```

本地商家后台账号：`owner` / `demo12345`。模拟支付只在非生产环境且 `PAYMENT_PROVIDER=mock` 时可用。

## 核心约束

- 金额和积分全部使用整数；金额单位为分。
- 商品单价、辣度、小料、本人积分、邀请奖励积分均由商家配置，订单保存配置快照。
- 一个微信 OpenID 对应一个用户；每人只能永久绑定一个直接邀请人，服务端阻止邀请环。
- 微信支付回调、主动查单和定时对账共用同一幂等结算入口。
- 商品券只能用于配置的指定商品，用券下单实付 0 元并正常生成取餐号。

上线步骤见 [部署说明](docs/deployment.md)。

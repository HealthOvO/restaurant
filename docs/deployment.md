# V2 部署说明

## 1. 准备

- 已认证的小程序 AppID 与 CloudBase 环境
- CloudBase CLI、Node.js 18+
- 正式收款前准备微信支付普通商户号、API 证书私钥、微信支付公钥和 32 字节 APIv3 密钥

建议开发、体验、生产使用不同 CloudBase 环境和不同密钥。

## 2. 构建与数据库

```bash
npm install
npm run review
npm run build:release
```

在 CloudBase 创建 `docs/cloudbase-indexes.json` 中列出的 `v2_` 集合和索引。所有集合关闭客户端直接读写，只允许云函数访问。

## 3. 云函数

构建后部署 `cloudfunctions/release` 中的五个函数：

- `v2-customer-api`
- `v2-owner-api`
- `v2-system-api`
- `v2-payment-notify`
- `v2-refund-notify`

所有函数配置：

```text
NODE_ENV=production
STORE_ID=store-main
SESSION_SECRET=<至少 32 字节随机值>
BOOTSTRAP_SECRET=<独立随机值，仅初始化和账号恢复使用>
SYSTEM_JOB_SECRET=<独立随机值，仅定时任务使用>
PAYMENT_PROVIDER=wechat
```

给 `v2-payment-notify`、`v2-refund-notify` 开通公网 HTTP 访问，将所得 HTTPS 地址分别填入以下变量，并同步到需要调用支付的函数：

```text
WECHAT_PAY_APP_ID=<小程序 AppID>
WECHAT_PAY_MCH_ID=<普通商户号>
WECHAT_PAY_CERT_SERIAL=<商户 API 证书序列号>
WECHAT_PAY_PRIVATE_KEY=<PEM 原文或 PEM 的 Base64>
WECHAT_PAY_PUBLIC_KEY_ID=<PUB_KEY_ID_xxx>
WECHAT_PAY_PUBLIC_KEY=<微信支付公钥 PEM 原文或 Base64>
WECHAT_PAY_API_V3_KEY=<32 字节 APIv3 密钥>
WECHAT_PAY_NOTIFY_URL=<v2-payment-notify HTTPS 地址>
WECHAT_REFUND_NOTIFY_URL=<v2-refund-notify HTTPS 地址>
```

定时器每分钟调用 `v2-system-api` 两次，事件分别为：

```json
{"action":"payments.reconcile","secret":"<SYSTEM_JOB_SECRET>","payload":{}}
```

```json
{"action":"refunds.reconcile","secret":"<SYSTEM_JOB_SECRET>","payload":{}}
```

回调与主动查询都会进入相同幂等事务；定时任务用于处理回调延迟或丢失。

## 4. 首次初始化与账号恢复

在 CloudBase 控制台调用一次 `v2-system-api`：

```json
{
  "action": "setup.initialize",
  "secret": "<BOOTSTRAP_SECRET>",
  "payload": {
    "storeName": "雄飞肉片",
    "announcement": "新鲜现做，叫号取餐",
    "username": "owner",
    "password": "<至少 8 位强密码>",
    "displayName": "老板"
  }
}
```

初始化后默认暂停营业，并生成一份福鼎肉片、辣度、小料以及一项 100 积分商品券。老板登录后台检查价格和积分后再开启营业。

忘记密码或更换老板微信不影响后台账号。使用 `setup.resetOwner` 和 `BOOTSTRAP_SECRET` 重设账号，旧登录会立即失效：

```json
{"action":"setup.resetOwner","secret":"<BOOTSTRAP_SECRET>","payload":{"username":"owner","password":"<新强密码>","displayName":"老板"}}
```

## 5. 商家网站

构建前设置：

```text
VITE_TCB_ENV_ID=<CloudBase 环境 ID>
```

运行 `npm run build:admin`，把 `apps/admin-web/dist` 发布到 CloudBase 静态托管，并在 CloudBase 开启匿名登录。匿名身份只负责调用云函数，后台业务仍要求 8 小时老板会话令牌。

## 6. 顾客小程序与摊位二维码

- 在 `apps/miniprogram/project.config.json` 填正式 AppID。
- 在 `apps/miniprogram/miniprogram/config.js` 填生产 CloudBase 环境 ID。
- 微信开发者工具导入 `apps/miniprogram`，上传体验版并完成真实支付与退款联调。
- 在微信公众平台生成指向 `pages/home/home?source=stall` 的小程序码，下载后印在摊位。扫码会直接进入点餐首页，不需要维护普通网址二维码。

## 7. 上线门槛

- 支付、查单、回调、退款和退款回调在真实商户环境各完成至少一笔。
- 重复回调不重复加积分，退款重复通知不重复扣积分。
- 商家网站在桌面和手机浏览器完成订单、商品、兑换、用户和设置点击验收。
- 小程序体验版完成点餐、商品券下单、取餐号、邀请绑定和积分明细验收。

# 部署与上线说明

## 1. 准备事项

- 已认证微信小程序 AppID
- 微信开发者工具
- Node.js 18+
- CloudBase CLI
- 小程序主体资料、门店 logo、客服手机号、隐私政策文本

## 2. 云开发环境

在微信开发者工具内创建三套环境：

- `dev`
- `staging`
- `prod`

小程序配置文件 `apps/miniprogram/miniprogram/config.js` 和后台 `.env` 里都填对应环境 ID。

如需多门店动态切换，小程序无需为每个门店单独改包；只需要保证分享链接或二维码中带上 `storeId`。

## 3. 安装与构建

```bash
npm install
npm run build:shared
npm run build:cloudfunctions
npm run build:admin
```

构建完成后：

- 云函数产物在 `cloudfunctions/release`
- 后台静态站点产物在 `apps/admin-web/dist`

## 4. 创建集合与索引

在云开发控制台创建以下集合：

- `members`
- `invite_relations`
- `visit_records`
- `reward_rules`
- `point_exchange_items`
- `member_point_transactions`
- `dish_vouchers`
- `voucher_redemptions`
- `staff_users`
- `audit_logs`

索引配置参考 [cloudbase-indexes.json](/C:/workspace/zxf/docs/cloudbase-indexes.json)。

## 5. 初始化奖励规则

将 [seed-reward-rules.json](/C:/workspace/zxf/docs/seed-reward-rules.json) 中的规则通过后台导入，或先手动创建同等规则。

## 6. 部署云函数

在 CloudBase CLI 登录后部署 `cloudfunctions/release` 下的函数目录，函数名与目录名保持一致：

- `auth-login`
- `bootstrap-store-owner`
- `member-bootstrap`
- `member-state`
- `member-records`
- `invite-bind`
- `invite-overview`
- `staff-profile`
- `visit-settle-first-visit`
- `voucher-list-mine`
- `voucher-redeem`
- `staff-member-search`
- `admin-dashboard`
- `admin-rules-list`
- `admin-members-query`
- `admin-rules-save`
- `admin-binding-adjust`
- `admin-staff-manage`
- `admin-audit-list`

同时在云函数环境变量中配置：

- `SESSION_SECRET`
- `BOOTSTRAP_SECRET`

初始化新门店老板账号可参考 [store-bootstrap.md](/C:/workspace/zxf/docs/store-bootstrap.md)。
其中 `-ManagedStoreIds` 支持逗号分隔和空格分隔两种写法。

## 7. 部署后台

将 `apps/admin-web/dist` 发布到 CloudBase 静态托管，并在后台环境变量中配置：

- `VITE_TCB_ENV_ID`

## 8. 小程序提审前检查

- `apps/miniprogram/project.config.json` 里替换正式 AppID
- `apps/miniprogram/miniprogram/config.js` 填入正式环境 ID
- 开发版联调通过
- 体验版给老板和店员验收
- 隐私保护指引、活动规则、客服入口都已配置
- 多门店场景下，确认门店二维码或分享链接都带有正确的 `storeId`

## 9. 回滚策略

- 如规则异常，老板先在后台关闭对应规则
- 静态后台回滚到上一个托管版本
- 小程序保留上一个稳定包，必要时重新提交前一版本
- 保留 `audit_logs` 与 `visit_records`，不做破坏性回滚

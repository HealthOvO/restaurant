# 餐饮会员返菜品小程序

面向单店餐饮门店的微信小程序与老板后台，覆盖会员注册、邀请裂变、首次到店核销、返菜品券、店员核销与审计日志。

## 仓库结构

- `apps/miniprogram`: 原生微信小程序，包含顾客端与店员核销入口
- `apps/admin-web`: 老板后台 Web 控制台
- `packages/shared`: 共享领域模型、校验规则与奖励结算逻辑
- `cloudfunctions`: 微信云开发函数
- `docs`: 部署、索引、评审与上线资料

## 本地命令

```bash
npm install
npm run check:todo
npm run build:shared
npm run test
npm run build:cloudfunctions
npm run build:admin
```

## 默认账号

- 老板账号：`owner`
- 初始密码：`owner123456`

首次调用 `member.bootstrap` 时，如果数据库里还没有员工账号，会自动创建该老板账号。

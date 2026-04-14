# 餐饮点餐与会员增长小程序

面向餐饮门店的微信小程序与老板后台，覆盖点餐下单、会员注册、邀请得积分、积分换菜品、店员核销、反馈处理与审计日志。

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

## 首次初始化

- 老板后台不再内置默认账号。
- 新环境第一次使用时，需要先配置云函数环境变量 `BOOTSTRAP_SECRET`。
- 然后在老板后台登录页切到“首次初始化”，输入：
  - 门店编号
  - 初始化口令
  - 老板账号
  - 老板密码
- 初始化完成后会自动尝试登录。

也可以按 [store-bootstrap.md](/C:/workspace/zxf/docs/store-bootstrap.md) 里的脚本方式初始化老板账号。

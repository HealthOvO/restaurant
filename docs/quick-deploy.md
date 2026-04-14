# 超具体部署步骤

这份文档只讲“你现在怎么一步一步把它跑起来”。

## 我能直接替你做的

- 代码我已经写好并验证过。
- 我已经把部署脚本加好了：
  - [deploy-cloudfunctions.ps1](/C:/workspace/zxf/scripts/deploy-cloudfunctions.ps1)
  - [deploy-admin-web.ps1](/C:/workspace/zxf/scripts/deploy-admin-web.ps1)
- 你后面只要补上自己的微信小程序 `AppID`、CloudBase 环境 ID，然后执行命令。

## 我没法替你直接做的

- 我不能替你登录微信公众平台
- 我不能替你在微信开发者工具里点“创建云环境”
- 我不能替你扫码登录你自己的 CloudBase 账号
- 我不能替你正式提交小程序审核

这些步骤必须你本人在自己的账号里操作。

## 一次性准备

### 1. 安装工具

电脑里要有：

- Node.js
- 微信开发者工具
- CloudBase CLI

安装 CloudBase CLI：

```powershell
npm install -g @cloudbase/cli
```

登录 CloudBase：

```powershell
tcb login
```

### 2. 在微信开发者工具里创建云环境

打开微信开发者工具后：

1. 导入小程序项目目录：`C:\workspace\zxf\apps\miniprogram`
2. 把 [project.config.json](/C:/workspace/zxf/apps/miniprogram/project.config.json) 里的 `appid` 换成你自己的小程序 AppID
3. 进入“云开发”面板
4. 创建环境，至少先建一个 `dev`
5. 记下这个环境 ID

如果你准备正式上线，建议建 3 个：

- `dev`
- `staging`
- `prod`

## 改 2 个配置

### 3. 改小程序环境 ID

打开 [config.js](/C:/workspace/zxf/apps/miniprogram/miniprogram/config.js)，把：

```js
const CLOUD_ENV_ID = "replace-with-your-cloud-env-id";
```

改成你的真实环境 ID。

### 4. 改后台环境 ID

复制一份 [apps/admin-web/.env.example](/C:/workspace/zxf/apps/admin-web/.env.example) 为：

`C:\workspace\zxf\apps\admin-web\.env`

然后把里面的：

```env
VITE_TCB_ENV_ID=replace-with-your-cloud-env-id
```

改成同一个环境 ID。

## 本地构建

### 5. 执行构建

在项目根目录 `C:\workspace\zxf` 打开 PowerShell，执行：

```powershell
npm install
npm run build:release
```

构建成功后：

- 云函数目录在 `C:\workspace\zxf\cloudfunctions\release`
- 后台目录在 `C:\workspace\zxf\apps\admin-web\dist`

## 云开发控制台手工创建数据集合

### 6. 创建业务集合

进入 CloudBase 控制台，创建下面这些集合：

- `members`
- `invite_relations`
- `visit_records`
- `reward_rules`
- `point_exchange_items`
- `member_point_transactions`
- `dish_vouchers`
- `voucher_redemptions`
- `menu_categories`
- `menu_items`
- `store_configs`
- `order_records`
- `order_status_logs`
- `feedback_tickets`
- `ops_tasks`
- `staff_users`
- `audit_logs`

索引照着 [cloudbase-indexes.json](/C:/workspace/zxf/docs/cloudbase-indexes.json) 建。

如果你嫌手工看着麻烦，就一条一条按这个文件抄进去。

## 部署

### 7. 部署云函数

在根目录执行：

```powershell
.\scripts\deploy-cloudfunctions.ps1 -EnvId 你的环境ID
```

或者：

```powershell
npm run deploy:functions -- -EnvId 你的环境ID
```

### 8. 配置云函数环境变量

在 CloudBase 控制台里，给云函数配置环境变量：

- `SESSION_SECRET`
- `BOOTSTRAP_SECRET`

建议填一串你自己生成的随机字符串，比如：

```text
restaurant-prod-2026-your-own-random-secret
```

### 9. 部署老板后台

在根目录执行：

```powershell
.\scripts\deploy-admin-web.ps1 -EnvId 你的环境ID
```

或者：

```powershell
npm run deploy:admin -- -EnvId 你的环境ID
```

部署完成后，CloudBase 静态托管会给你一个访问地址。

这个地址就是老板后台登录地址。

## 老板和员工后面怎么访问

### 老板

老板用电脑浏览器打开 CloudBase 静态托管地址访问后台。

首次使用先在登录页切到“首次初始化”，输入：

- 门店编号
- 初始化口令 `BOOTSTRAP_SECRET`
- 老板账号
- 老板密码

初始化完成后会自动尝试登录。老板登录后可以：

- 配返菜规则
- 创建员工账号
- 查会员
- 改邀请关系
- 看审计日志

### 员工

员工不访问网页后台。

员工打开你们的微信小程序，进入首页里的“店员登录”，输入老板创建好的账号密码登录。

员工登录后可以：

- 消费核销
- 菜品券核销
- 会员查询

## 最后一步，小程序上线

### 10. 开发版联调

在微信开发者工具里先跑开发版，确认：

- 会员注册正常
- 邀请绑定正常
- 首次消费核销正常
- 自动发券正常
- 员工登录正常
- 菜品券核销正常

### 11. 上传体验版

开发者工具里点击“上传”，生成体验版，给老板和员工试用。

### 12. 提交审核并发布

确认没问题后，在微信公众平台提交审核，审核通过后发布正式版。

## 你现在最短路径怎么走

如果你想最快看到东西跑起来，就直接按这个顺序：

1. 在微信开发者工具创建 `dev` 环境
2. 改 [config.js](/C:/workspace/zxf/apps/miniprogram/miniprogram/config.js)
3. 新建 `apps/admin-web/.env`
4. 跑 `npm run build:release`
5. 创建业务集合和索引
6. 跑 `.\scripts\deploy-cloudfunctions.ps1 -EnvId 你的环境ID`
7. 跑 `.\scripts\deploy-admin-web.ps1 -EnvId 你的环境ID`
8. 打开后台地址，先完成老板账号初始化
9. 登录后台并创建员工账号
10. 员工用小程序登录

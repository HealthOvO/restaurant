# 老板账号初始化说明

## 1. 适用场景

- 新开一个分店，需要初始化该门店的老板账号
- 新建总店账号，需要一次性授权查看多个分店
- 需要通过脚本重置某个门店老板账号的密码和权限范围

## 2. 前提

- 云函数 `bootstrap-store-owner` 已部署
- 对应环境已配置 `BOOTSTRAP_SECRET`
- 本地已完成 `tcb login`

如果你只是单店首次上线，也可以直接打开老板后台登录页，切到“首次初始化”完成创建。

## 3. 初始化单个分店老板

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-store.ps1 `
  -EnvId cloud1-xxxx `
  -StoreId branch-01 `
  -OwnerUsername owner-branch-01 `
  -OwnerPassword <your-owner-password> `
  -BootstrapSecret your-bootstrap-secret `
  -OwnerDisplayName "一店老板"
```

这会在 `branch-01` 下创建或更新一个 `OWNER` 账号，权限范围默认是仅当前门店。

## 4. 初始化总店账号

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-store.ps1 `
  -EnvId cloud1-xxxx `
  -StoreId hq-store `
  -OwnerUsername owner-hq `
  -OwnerPassword <your-owner-password> `
  -BootstrapSecret your-bootstrap-secret `
  -OwnerDisplayName "总店老板" `
  -AccessScope ALL_STORES `
  -ManagedStoreIds branch-01,branch-02,branch-03
```

这会创建或更新总店老板账号，并允许它切换查看 `branch-01`、`branch-02`、`branch-03` 的后台数据。

`-ManagedStoreIds` 同时支持下面两种传法：

```powershell
-ManagedStoreIds branch-01,branch-02,branch-03
```

```powershell
-ManagedStoreIds branch-01 branch-02 branch-03
```

## 5. 小程序动态门店路由

小程序已支持以下两种门店识别方式：

- 普通链接参数：`/pages/index/index?storeId=branch-01&inviteCode=M0008`
- 二维码 `scene` 参数：`storeId=branch-01&inviteCode=M0008`

分享邀请时，系统会自动把当前 `storeId` 和 `inviteCode` 一起带上，避免串店。

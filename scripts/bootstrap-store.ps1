param(
  [Parameter(Mandatory = $true)]
  [string]$EnvId,

  [Parameter(Mandatory = $true)]
  [string]$StoreId,

  [Parameter(Mandatory = $true)]
  [string]$OwnerUsername,

  [Parameter(Mandatory = $true)]
  [string]$OwnerPassword,

  [Parameter(Mandatory = $true)]
  [string]$BootstrapSecret,

  [string]$OwnerDisplayName = "",

  [ValidateSet("STORE_ONLY", "ALL_STORES")]
  [string]$AccessScope = "STORE_ONLY",

  [string[]]$ManagedStoreIds = @()
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command tcb -ErrorAction SilentlyContinue)) {
  throw "未找到 tcb CLI。请先执行：npm install -g @cloudbase/cli"
}

$normalizedManagedStoreIds = @(
  $ManagedStoreIds |
    ForEach-Object {
      if ($_ -is [string]) {
        $_ -split ","
      } else {
        $_
      }
    } |
    ForEach-Object {
      if ($_ -is [string]) {
        $_.Trim()
      } else {
        $_
      }
    } |
    Where-Object { $_ }
)

$payload = @{
  storeId = $StoreId
  secret = $BootstrapSecret
  ownerUsername = $OwnerUsername
  ownerPassword = $OwnerPassword
  accessScope = $AccessScope
  managedStoreIds = $normalizedManagedStoreIds
}

if ($OwnerDisplayName -and $OwnerDisplayName.Trim()) {
  $payload.ownerDisplayName = $OwnerDisplayName.Trim()
}

$jsonPayload = $payload | ConvertTo-Json -Compress -Depth 5

Write-Host "正在初始化门店 $StoreId 的老板账号..." -ForegroundColor Cyan
& tcb fn invoke bootstrap-store-owner -e $EnvId --params $jsonPayload

if ($LASTEXITCODE -ne 0) {
  throw "门店初始化失败，请检查 CloudBase 登录状态、环境 ID、BOOTSTRAP_SECRET 和云函数部署。"
}

Write-Host "门店初始化完成。" -ForegroundColor Green

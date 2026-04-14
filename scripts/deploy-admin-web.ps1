param(
  [Parameter(Mandatory = $true)]
  [string]$EnvId
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$adminDist = Join-Path $root "apps\\admin-web\\dist"

if (-not (Get-Command tcb -ErrorAction SilentlyContinue)) {
  throw "未找到 tcb CLI。请先执行：npm install -g @cloudbase/cli"
}

if (-not (Test-Path $adminDist)) {
  throw "未找到后台构建产物：$adminDist。请先执行 npm run build:admin"
}

Write-Host "准备把后台静态站点部署到环境 $EnvId" -ForegroundColor Cyan
tcb hosting deploy $adminDist -e $EnvId
if ($LASTEXITCODE -ne 0) {
  throw "后台静态站点部署失败，请先确认 tcb login 状态和环境权限。"
}
Write-Host "`n后台静态站点部署完成。" -ForegroundColor Green

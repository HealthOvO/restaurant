param(
  [Parameter(Mandatory = $true)]
  [string]$EnvId
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command tcb -ErrorAction SilentlyContinue)) {
  throw "未找到 tcb CLI。请先执行：npm install -g @cloudbase/cli"
}

Write-Host "正在初始化云数据库集合..." -ForegroundColor Cyan
$invokeOutput = & tcb fn invoke ops-init-database -e $EnvId --params "{}" 2>&1
$invokeText = ($invokeOutput | Out-String)
Write-Host $invokeText

if ($LASTEXITCODE -ne 0) {
  throw "数据库集合初始化失败，请确认 ops-init-database 云函数已部署。"
}

if ($invokeText -match '"ok":false') {
  throw "数据库集合初始化失败，请检查云函数返回结果。"
}

Write-Host "数据库集合初始化完成。" -ForegroundColor Green

param(
  [Parameter(Mandatory = $true)]
  [string]$EnvId
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$functionsRoot = Join-Path $root "cloudfunctions\\release"

if (-not (Get-Command tcb -ErrorAction SilentlyContinue)) {
  throw "未找到 tcb CLI。请先执行：npm install -g @cloudbase/cli"
}

if (-not (Test-Path $functionsRoot)) {
  throw "未找到云函数产物目录：$functionsRoot。请先执行 npm run build:cloudfunctions"
}

$functionDirs = Get-ChildItem -Path $functionsRoot -Directory | Sort-Object Name

if (-not $functionDirs) {
  throw "未发现任何云函数目录，请先构建云函数。"
}

Write-Host "准备部署以下云函数到环境 $EnvId :" -ForegroundColor Cyan
$functionDirs | ForEach-Object { Write-Host " - $($_.Name)" }

foreach ($dir in $functionDirs) {
  Write-Host "`n==> 部署云函数 $($dir.Name)" -ForegroundColor Yellow
  Push-Location $dir.FullName
  try {
    tcb fn deploy $dir.Name -e $EnvId --force --yes
    if ($LASTEXITCODE -ne 0) {
      throw "云函数 $($dir.Name) 部署失败，请先确认 tcb login 状态和环境权限。"
    }
  }
  finally {
    Pop-Location
  }
}

Write-Host "`n云函数部署完成。" -ForegroundColor Green

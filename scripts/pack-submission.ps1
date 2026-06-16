# 大赛提交用：源代码 + 代表性素材（不含依赖与用户上传）
# 用法：powershell -ExecutionPolicy Bypass -File d:\cursor\scripts\pack-submission.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $Root 'frontend'))) {
  throw 'frontend folder not found; run script from repo with frontend/'
}

$Pack = Join-Path $Root '_submission_pack'
$ZipName = 'zchoose-sources-and-assets-submit.zip'
$ZipPath = Join-Path $Root $ZipName

Write-Host "Root: $Root"
if (Test-Path $Pack) { Remove-Item $Pack -Recurse -Force }
New-Item -ItemType Directory -Path $Pack | Out-Null

# robocopy: 0-7 为成功
function Invoke-Robocopy {
  param([string[]]$RoboArgs)
  & robocopy @RoboArgs
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed exit=$LASTEXITCODE $($RoboArgs -join ' ')" }
}

$common = @('/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP')

Invoke-Robocopy -RoboArgs (@(
  (Join-Path $Root 'frontend'),
  (Join-Path $Pack 'frontend')
) + $common + @('/XD', 'node_modules'))

Invoke-Robocopy -RoboArgs (@(
  (Join-Path $Root 'backend'),
  (Join-Path $Pack 'backend')
) + $common + @('/XD', 'node_modules', 'dist', 'uploads', '/XF', '.env'))

Invoke-Robocopy -RoboArgs (@(
  (Join-Path $Root 'tryon-service'),
  (Join-Path $Pack 'tryon-service')
) + $common + @('/XD', '__pycache__', '.venv', 'venv', 'env', 'result', '/XF', '.env'))

if (Test-Path (Join-Path $Root 'docs')) {
  Invoke-Robocopy -RoboArgs (@(
    (Join-Path $Root 'docs'),
    (Join-Path $Pack 'docs')
  ) + $common)
}

$rootMd = Get-ChildItem -Path $Root -File -Filter '*.md' -ErrorAction SilentlyContinue
if ($rootMd.Count -gt 0) {
  $mdDest = Join-Path $Pack 'root-md-notes'
  New-Item -ItemType Directory -Path $mdDest | Out-Null
  $rootMd | Copy-Item -Destination $mdDest
}

Copy-Item (Join-Path $PSScriptRoot 'submission-pack-readme-zh-CN.txt') (Join-Path $Pack '00-readme-pack-zh.txt') -Force

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $Pack '*') -DestinationPath $ZipPath -CompressionLevel Optimal -Force

$sizeMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Host ('OK: ' + $ZipPath + ' sizeMiB=' + [string]$sizeMb)
Remove-Item $Pack -Recurse -Force

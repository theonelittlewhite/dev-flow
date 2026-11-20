# dev-flow one-line installer (Windows PowerShell)
# 用法：irm https://raw.githubusercontent.com/theonelittlewhite/dev-flow/main/get.ps1 | iex
# 备选（更稳妥，先看再跑）：
#   iwr https://raw.githubusercontent.com/theonelittlewhite/dev-flow/main/get.ps1 -OutFile get.ps1; .\get.ps1
$ErrorActionPreference = 'Stop'
$repo = 'theonelittlewhite/dev-flow'
$api = "https://api.github.com/repos/$repo/releases/latest"
$headers = @{ 'User-Agent' = 'dev-flow-installer' }
Write-Host "查询最新 release: $repo ..."
$rel = Invoke-RestMethod -Uri $api -Headers $headers
$asset = $rel.assets | Where-Object { $_.name -like 'dev-flow-kit-v*.zip' } | Select-Object -First 1
if (-not $asset) { throw "未找到 dev-flow-kit zip（release: $($rel.tag_name)）" }
$tmp = Join-Path $env:TEMP ("dev-flow-kit-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$zip = Join-Path $tmp $asset.name
Write-Host "下载 $($asset.name) ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
Write-Host "解压到 $tmp ..."
Expand-Archive -Path $zip -DestinationPath $tmp -Force
# v0.0.2 的 zip 根目录直接含 install.mjs；旧包可能是单层目录，两种都兼容
$kitRoot = $tmp
if (-not (Test-Path (Join-Path $kitRoot 'install.mjs'))) {
  $kitRoot = (Get-ChildItem -Path $tmp -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'install.mjs') } | Select-Object -First 1).FullName
}
if (-not $kitRoot) { throw "解压后未找到 install.mjs" }
Write-Host "安装（旧版会自动备份）..."
node (Join-Path $kitRoot 'install.mjs') --install --force
Write-Host "完成。验证：node ~/.zcode/skills/dev-flow-setup/scripts/setup.mjs --verify"

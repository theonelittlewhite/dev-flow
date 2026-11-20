#!/usr/bin/env bash
# dev-flow one-line installer (macOS / Linux)
# 用法：curl -fsSL https://raw.githubusercontent.com/theonelittlewhite/dev-flow/main/get.sh | bash
# 备选（更稳妥，先看再跑）：
#   curl -fsSL .../get.sh -o get.sh && less get.sh && bash get.sh
set -euo pipefail
repo="theonelittlewhite/dev-flow"
api="https://api.github.com/repos/$repo/releases/latest"
echo "查询最新 release: $repo ..."
url=$(curl -fsSL "$api" | grep -o '"browser_download_url"[^,]*dev-flow-kit-v[^"]*\.zip"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
if [ -z "$url" ]; then
  echo "未找到 dev-flow-kit zip（请检查 release 是否已发布）" >&2
  exit 1
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "下载 $url ..."
curl -fsSL "$url" -o "$tmp/kit.zip"
echo "解压到 $tmp ..."
unzip -q "$tmp/kit.zip" -d "$tmp"
kit=$(find "$tmp" -maxdepth 3 -name install.mjs -print -quit | xargs dirname)
if [ -z "$kit" ]; then
  echo "解压后未找到 install.mjs" >&2
  exit 1
fi
echo "安装（旧版会自动备份）..."
node "$kit/install.mjs" --install --force
echo "完成。验证：node ~/.zcode/skills/dev-flow-setup/scripts/setup.mjs --verify"

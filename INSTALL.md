# 安装与升级

## 要求

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | 20+ | 安装器与 dev-flow 脚本都只用 Node 内置模块 |
| ZCode | 当前版本 | 技能目录默认 `~/.zcode/skills` |
| Git | 可选 | 只在 `git clone` / `git pull` 时需要 |

Windows 安装 Node：`winget install OpenJS.NodeJS.LTS`；macOS：`brew install node`。

## 首次安装

### 方式 A：clone（推荐，便于升级）

```bash
git clone https://github.com/theonelittlewhite/dev-flow.git
cd dev-flow
node install.mjs --check
node install.mjs
```

### 方式 B：Release zip

1. 从 Releases 下载 `dev-flow-kit-v*.zip`；
2. 解压到任意目录；
3. 在解压目录运行：

```bash
node install.mjs --check
node install.mjs
```

安装器只写 `~/.zcode/skills` 下的 `dev-flow*` 与清单内上游技能；其他技能不碰。

## 安装器做了什么

1. 校验 Node 版本、安装源完整性；
2. 获取安装锁，避免两个安装进程并发；
3. 对每个核心技能：内容一致则跳过；不一致则备份到 `~/.zcode/skills/.dev-flow-backup/<时间戳>/` 后替换；
4. 对上游技能：缺失则安装；已存在且版本不同默认保留（`--force-upstream` 才备份替换）；
5. 写回执 `~/.zcode/skills/.dev-flow-install.json`；
6. 释放安装锁。

## 体检

```bash
node install.mjs --check
```

关注四项：

- `Node`：是否 >= 20；
- 核心技能状态：`current` 为正常，`missing` / `different` 需要安装；
- `upstreamMissing`：缺哪些上游技能；
- `结论`：PASS / FAIL。

机器可读：

```bash
node install.mjs --check --json
```

## 验证

```bash
node dev-flow-setup/scripts/setup.mjs --verify
```

按安装回执逐文件核对哈希，并跑 `flow-status.mjs --help` 冒烟。期望 `结论：PASS`。

## 升级

```bash
cd dev-flow
git pull
node install.mjs
```

内容未变的技能会跳过，不会反复备份。

## 维护者副本

如果现有 `~/.zcode/skills/dev-flow` 里有 `IMPLEMENTATION/`（旧的双机同步维护者副本），安装器默认拒绝：

```
[dev-flow-setup] ✘ 检测到维护者副本 ...
```

确认要换成运行版后：

```bash
node install.mjs --install --force
```

旧目录会完整备份到 `.dev-flow-backup/<时间戳>/dev-flow/`。维护工具以后在本仓使用。

## 项目配置

在项目根：

```bash
node dev-flow-setup/scripts/setup.mjs --project-init --root . --dry-run
node dev-flow-setup/scripts/setup.mjs --project-init --root .
```

`--dry-run` 只打印探测结果，不写盘。已有 `.dev-flow.json` 且内容不同时，需加 `--force` 才会覆盖。

## 回滚

1. 找到最近一次备份：

```bash
ls ~/.zcode/skills/.dev-flow-backup
```

2. 把备份里的目录拷回 `~/.zcode/skills/`：

```bash
cp -R ~/.zcode/skills/.dev-flow-backup/<时间戳>/dev-flow ~/.zcode/skills/
```

Windows PowerShell：

```powershell
Copy-Item -Recurse "$env:USERPROFILE\.zcode\skills\.dev-flow-backup\<时间戳>\dev-flow" "$env:USERPROFILE\.zcode\skills\"
```

3. 重新跑 `--verify`（如果回执与旧版不匹配，以旧版实际文件为准）。

## 故障处理

| 现象 | 处理 |
| --- | --- |
| `Node ... 低于要求` | 升级 Node 到 20+ |
| `安装锁存在` | 等 10 分钟自动失效；确认无安装进程后可删 `.dev-flow-install.lock` |
| `检测到维护者副本` | 确认后加 `--force` |
| 保留已存在的上游技能 | 默认不覆盖；确认替换加 `--force-upstream` |
| 文件被占用 | 关闭相关 ZCode 会话/编辑器后重试；安装失败会从备份恢复 |
| `缺少安装回执` | 先跑 `--install`；`--verify` 不猜版本 |
| 技能列表里看不到 | 新开一个 ZCode 会话，让技能列表重新加载 |

## 卸载

安装器不提供自动卸载。手动删除 `~/.zcode/skills/dev-flow*` 与清单内上游技能即可；备份目录和回执可一并删除。

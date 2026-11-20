---
name: dev-flow-setup
description: "Use when installing, upgrading, checking, or repairing the dev-flow skill suite on a ZCode machine — 首次安装、升级、环境体检、修复缺失技能、初始化项目配置时使用。"
disable-model-invocation: true
---

# dev-flow-setup：安装、体检与修复

一句话：**装一次，全局可用；每个项目按需配一个 `.dev-flow.json`。**

本技能只做四件事：

1. **体检**：Node、Git、技能根、已装版本、缺失的上游技能；
2. **安装/升级**：把 `dev-flow`、8 个副本、`dev-flow-setup` 和缺失的上游技能放进 `~/.zcode/skills/`；
3. **验证**：按安装回执逐文件核对哈希，并跑 `flow-status.mjs` 冒烟；
4. **项目配置**：探测项目并生成 `.dev-flow.json`（可先 dry-run）。

## 什么时候用

- 第一次在新机器上装 dev-flow；
- `dev-flow` 报「副本缺失 / 技能不存在 / 脚本找不到」；
- 从 GitHub 拉了新版本，想升级；
- 想知道本机装的是哪个版本、缺哪些上游技能；
- 新项目想显式固化词汇表、台账命令、收工门禁、时记/槽位开关。

## 安全边界（先读）

- 只动 `dev-flow*` 目录和 `vendor/upstream/SOURCES.json` 里 `install: true` 的上游技能；**绝不删除其他技能**。
- 替换前自动备份到 `<技能根>/.dev-flow-backup/<时间戳>/`；安装写 `<技能根>/.dev-flow-install.json` 回执。
- 检测到现有 `dev-flow/IMPLEMENTATION`（维护者副本）时默认拒绝；确认要替换加 `--force`，旧目录会先备份。
- 已存在且版本不同的上游技能默认保留；确认替换加 `--force-upstream`。
- **不自动安装 Node/Git**：只检测并给命令；权限和系统安装交给用户。
- 不联网、不调 npm；安装源就是当前 clone 或解压出来的包。

## 三步

### 1. 体检（不写盘）

```bash
node dev-flow-setup/scripts/setup.mjs --check
# 或
node install.mjs --check
```

看三行就够：`Node` 是否达标、核心技能是否 `current`、`upstreamMissing` 是否为空。

### 2. 安装/升级

```bash
node install.mjs
# 等价于 node dev-flow-setup/scripts/setup.mjs --install --from .
```

升级：先 `git pull`，再跑同一条命令。旧版本会自动备份。

维护者副本（含 `IMPLEMENTATION/`）需要显式确认：

```bash
node install.mjs --install --force
```

### 3. 验证

```bash
node dev-flow-setup/scripts/setup.mjs --verify
```

期望：`结论：PASS`；`flow-status.mjs --help` 冒烟通过。失败会列出缺失或哈希不一致的技能名。

## 项目配置

在项目根跑：

```bash
node dev-flow-setup/scripts/setup.mjs --project-init --root . --dry-run
```

先看探测结果；确认后去掉 `--dry-run` 写入 `.dev-flow.json`。

写盘/打印后 setup 会检查项目 `models` 块（模型分工）：缺失或必填槽位为 `null` 时输出醒目「【缺模型配置】」提醒 + 可直接粘贴的片段——`models` 块不由本命令生成，需按片段手工补进 `.dev-flow.json`。**未配置时 dev-flow 会在对应环节停下问你，不静默用默认**；`--json` 输出带 `models` 状态字段（`configured`/`missing`/`invalid`/`workerLight`/`reminder`）。

字段与默认值见 `templates/dev-flow.json` 和 dev-flow 技能的 `references/10-project-profile.md`。没有配置文件时，dev-flow 按自动探测 + 中性默认运行。

常用覆盖项：

| 字段 | 作用 | 无配置时 |
| --- | --- | --- |
| `docs.glossary` | 项目词汇表路径 | 探测 `docs/dev-guide/glossary.md` 等 |
| `ledger.mode/add/index` | 坑点/延后项台账命令 | `manual`，写 `docs/issues/*.md` |
| `changelog.mode/dir` | 更新日志约定 | `none` |
| `finishGate.command` | 收工门禁（如 `npm run wt:done`） | `null` |
| `taskchron.mode` | 时记同步开关 | `auto` |
| `slots.enabled/claim/done` | 槽位协议 | `false` |
| `models.*` | 模型分工：每环节用哪个模型（router/early/ticketReview/ticketJudge/worker/inspector/finalReview/finalJudge/offpeak） | 无 `models` 块；缺配置由 `--project-init` 提醒，运行期对应环节停下问用户 |

## 输出怎么读

- `check` 的 `missing`：核心技能没装；
- `check` 的 `problems`：装了但内容不同（版本漂移或被改过）；
- `check` 的 `upstreamMissing`：19+3 个上游技能缺哪些；
- `install` 的 `installed` / `kept` / `replaced`：新装、已一致保留、备份后替换；
- `verify` 的 `problems`：缺失或哈希不一致，按名字重装。

## 故障处理

| 现象 | 处理 |
| --- | --- |
| `Node ... 低于要求` | 升级 Node 到 20+；Windows `winget install OpenJS.NodeJS.LTS`，macOS `brew install node` |
| `安装锁存在` | 等 10 分钟自动失效，或确认无安装进程后删 `.dev-flow-install.lock` |
| `检测到维护者副本` | 确认要换成运行版后加 `--force`；备份在 `.dev-flow-backup/` |
| `保留已存在的上游技能` | 默认不覆盖；确认替换加 `--force-upstream` |
| 文件被占用 | 关闭相关 ZCode 会话/编辑器后重试；失败会从备份恢复 |
| 缺少安装回执 | 先跑 `--install`；`--verify` 不猜版本 |

## 不做什么

- 不自动升级、不后台轮询、不联网追新；
- 不改项目 `specs/`、不改 `state.json`、不碰业务代码；
- 不删除任何非 `dev-flow*` 技能；
- 不替代项目自己的包管理器/收工门禁。

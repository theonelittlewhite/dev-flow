# dev-flow

给 AI 编程助手用的开发流程技能：六步闭环（需求 → 设计 → 工单 → 实现 → 完成评审 → 验收）、S/M/L 分档、triage 旁路、断点续跑。状态写在项目自己的 `specs/<feature>/state.json`，不依赖外部 tracker。

本仓是**唯一正典**。安装一次，ZCode 全局可用；每个项目按需放一个 `.dev-flow.json` 描述项目差异。

## 快速开始

要求：Node.js 20+、ZCode；Git 可选（只用于拉取/升级）。

```bash
git clone https://github.com/theonelittlewhite/dev-flow.git
cd dev-flow
node install.mjs
```

### 一条命令安装

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/theonelittlewhite/dev-flow/main/get.sh | bash
```

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/theonelittlewhite/dev-flow/main/get.ps1 | iex
```

不放心 `| bash` / `| iex` 的，先下载脚本看一眼再执行：

```bash
curl -fsSL https://raw.githubusercontent.com/theonelittlewhite/dev-flow/main/get.sh -o get.sh && less get.sh && bash get.sh
```

### 手动安装（等价，便于审计）


也可以从 [Releases](https://github.com/theonelittlewhite/dev-flow/releases) 下载 `dev-flow-kit-v*.zip`，解压后运行 `node install.mjs`。

安装器会：

- 把 `dev-flow`、8 个重定向副本、`dev-flow-setup` 放进 `~/.zcode/skills/`；
- 补齐缺失的上游技能（已存在且版本不同的默认保留）；
- 替换前备份到 `~/.zcode/skills/.dev-flow-backup/<时间戳>/`；
- 写安装回执 `~/.zcode/skills/.dev-flow-install.json`。

## 怎么用

在 ZCode 会话里：

```text
/dev-flow
```

第一次会问三件事：这次做什么、大概多大（S/M/L）、手上有没有已有需求/设计/工单。之后每次调用都会读 `specs/<feature>/state.json`，告诉你现在在哪、下一步做什么、用哪个技能、产出什么、门禁是什么。

其他入口：

- `/dev-flow-setup`：体检、升级、修复、初始化项目配置；
- `dev-flow-to-spec` / `dev-flow-to-tickets` / `dev-flow-triage` 等 8 个副本：由 dev-flow 在对应阶段调用，不单独使用。

## 项目配置

没有配置文件时，dev-flow 按自动探测 + 中性默认运行。要显式固化项目差异，在项目根放 `.dev-flow.json`：

```json
{
  "version": 1,
  "docs": { "glossary": "docs/dev-guide/glossary.md" },
  "ledger": { "mode": "command", "add": "npm run issues:add --", "index": "npm run issues:index" },
  "changelog": { "mode": "fragment", "dir": "changelog" },
  "finishGate": { "command": "npm run wt:done", "required": true },
  "taskchron": { "mode": "auto" },
  "slots": { "enabled": true, "claim": "npm run wt:claim --", "done": "npm run wt:done" },
  "audit": {
    "designDocGlobs": ["docs/design/**/*.yaml", "docs/design/**/*.yml"],
    "allowNonCodeGlobs": []
  }
}
```

生成方式（先 dry-run 看探测结果）：

```bash
node dev-flow-setup/scripts/setup.mjs --project-init --root /path/to/project --dry-run
```

字段说明见 `dev-flow/references/10-project-profile.md`。

## 硬门禁（issue-audit）

工单状态与追溯不是「写给人看」的提醒，而是 `dev-flow/scripts/issue-audit.mjs` 的机器门禁，**失败即拦**：

- **状态行唯一格式**：`**状态**：<首 token>`，首 token 只能是 `pending|in-progress|done|blocked|cancelled`；中文说明放括号/后续。`✅`、`ready-for-agent`、`closed` 等写法直接红（不再跳过整张单）。
- **扫描范围**：`T-<数字>[字母数字后缀].md` 全部入扫描（含 `T-13A`、`T-13B1`、`T-13B2`）；形如 `T-*.md` 但不合规范的文件判红，防静默漏扫。
- **设计决策映射**：工单「覆盖」行引用的每个 D-ID，必须在 `traceability.md` 的「设计决策映射」节有落点（决策正本/兑现工单/证据），或已登记 `design-deviation.md`。
- **状态同步**：issue 状态行 ↔ `tasks.md` 索引行 ↔ `traceability.md` AC/决策行；不一致即红（done 工单不得对应 `⬜`/`planned`）。
- **豁免签名**：`issue-audit 豁免` 仅限独立评审/档案会话，须带「独立重签」等签名 + 仓库内可查报告路径；工人自写豁免判红。
- **设计文档白名单**：`docs/design/**/*.yaml|yml`（覆盖表等）不计入「触碰代码」；用 `.dev-flow.json` 的 `audit.designDocGlobs` / `audit.allowNonCodeGlobs` 显式配置，不在脚本里散落特判。

四个接线点（对应六步流程）：

```bash
node <技能目录>/scripts/issue-audit.mjs --root <项目根> --feature <name> --phase tickets       # 工单审阅门禁
node <技能目录>/scripts/issue-audit.mjs --root <项目根> --feature <name> --phase final-review  # 销单/完成评审门禁（默认）
node <技能目录>/scripts/issue-audit.mjs --root <项目根> --feature <name> --phase acceptance    # 验收门禁
node <技能目录>/scripts/issue-audit.mjs --root <项目根> --feature <name> --phase release       # 发布前置（可选接线）
```

退出码：`0` 全绿（可有警告）、`1` 有红、`2` 参数错误。`--json` 输出机器可读结果。

## 仓库结构

```text
dev-flow/                 # 本体：SKILL.md / references / templates / scripts
dev-flow-*/               # 8 个重定向副本
dev-flow-setup/           # 安装、体检、验证、项目配置
vendor/upstream/          # 上游技能快照（22 个安装 + 8 个副本校验）
tests/                    # 安装器/打包/项目配置测试
docs/                     # 维护者报告（不随运行包安装）
install.mjs               # 一键安装
pack.mjs                  # 打 Release zip
kit.json                  # 版本与最低 Node
```

## 升级

```bash
cd dev-flow
git pull
node install.mjs
```

旧版本自动备份。只想体检：

```bash
node install.mjs --check
```

## 上游技能与许可

`vendor/upstream/` 随包内置 22 个运行所需的上游技能（19 个直接调用 + 3 个传递依赖），以及 8 个用于副本校验的上游快照。它们来自 MIT 许可的 [mattpocock/skills](https://github.com/mattpocock/skills) 与 [obra/superpowers](https://github.com/obra/superpowers)；`plan-review` 和 `test-audit` 为本仓维护者原创。版权声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

本仓自身使用 MIT 许可，见 [LICENSE](LICENSE)。


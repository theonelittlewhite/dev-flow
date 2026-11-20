# 10 项目配置（`.dev-flow.json`）

dev-flow 本身跨项目通用；项目差异（词汇表、台账命令、changelog、收工门禁、时记、槽位、模型分工）用项目根一个 `.dev-flow.json` 描述。

**解析顺序**：`.dev-flow.json` → 自动探测 → 中性默认。没有配置文件也能跑；配置只是把“探测结果”显式固化，避免换机器/换会话时口径漂移。

## 字段

```json
{
  "version": 1,
  "project": "my-project",
  "docs": {
    "glossary": "docs/dev-guide/glossary.md",
    "design": "docs/design",
    "implemented": "docs/implemented"
  },
  "ledger": {
    "mode": "manual",
    "add": null,
    "index": null,
    "pitfalls": "docs/issues/pitfalls.md",
    "deferred": "docs/issues/deferred.md"
  },
  "changelog": {
    "mode": "none",
    "dir": "changelog"
  },
  "finishGate": {
    "command": null,
    "required": false
  },
  "taskchron": {
    "mode": "auto"
  },
  "slots": {
    "enabled": false,
    "claim": null,
    "done": null,
    "dir": null
  },
  "audit": {
    "designDocGlobs": ["docs/design/**/*.yaml", "docs/design/**/*.yml"],
    "allowNonCodeGlobs": []
  },
  "models": {
    "router": null,
    "early": null,
    "ticketReview": [null, null, null],
    "ticketJudge": null,
    "worker": { "default": null, "light": null },
    "inspector": null,
    "finalReview": [null, null, null],
    "finalJudge": null,
    "offpeak": null
  }
}
```

| 字段 | 取值 | 作用 | 默认 / 探测 |
| --- | --- | --- | --- |
| `version` | `1` | 配置格式版本 | `1` |
| `project` | 字符串 | 项目名，仅展示 | `package.json.name` 或目录名 |
| `docs.glossary` | 路径或 `null` | 项目词汇表 | 探测 `docs/dev-guide/glossary.md`、`docs/glossary.md`、`GLOSSARY.md` |
| `docs.design` | 路径 | 设计文档目录 | `docs/design` |
| `docs.implemented` | 路径 | 已实现文档目录 | `docs/implemented` |
| `ledger.mode` | `command` / `manual` / `none` | 坑点/延后项台账怎么记 | 有 `issues:add`/`issues:index` 脚本 → `command`；否则 `manual` |
| `ledger.add` | 命令或 `null` | 新增台账条目的命令 | 有 `package.json` 脚本时 `npm run issues:add --` |
| `ledger.index` | 命令或 `null` | 重建台账索引的命令 | 有脚本时 `npm run issues:index` |
| `ledger.pitfalls` | 路径 | manual 模式坑点台账 | `docs/issues/pitfalls.md` |
| `ledger.deferred` | 路径 | manual 模式延后项台账 | `docs/issues/deferred.md` |
| `changelog.mode` | `fragment` / `file` / `none` | 更新日志怎么写 | 有 `changelog/` → `fragment`；否则 `none` |
| `changelog.dir` | 路径 | 分片目录 | `changelog` |
| `finishGate.command` | 命令或 `null` | 收工门禁 | 有 `wt:done` → `npm run wt:done`；有 `test:release` → `npm run test:release` |
| `finishGate.required` | 布尔 | 门禁失败是否阻断交付 | 有 `wt:done` 时 `true` |
| `taskchron.mode` | `on` / `off` / `auto` | 时记同步开关 | `auto`（看宿主是否有 TaskChron MCP） |
| `slots.enabled` | 布尔 | 是否使用项目槽位/工作树协议 | 有 `wt:claim` + `wt:done` → `true` |
| `slots.claim` / `slots.done` | 命令或 `null` | 槽位认领/收工命令 | 有脚本时 `npm run wt:claim --` / `npm run wt:done` |
| `slots.dir` | 路径或 `null` | 槽位根；`watchdog` 未给 `--slots-dir` 时读它 | `null`（按项目约定探测） |
| `audit.designDocGlobs` | glob 数组 | 销单机检「触碰代码」白名单：设计文档（含覆盖表 yaml）不算代码 | `docs/design/**/*.yaml`、`docs/design/**/*.yml`（随 `docs.design` 目录） |
| `audit.allowNonCodeGlobs` | glob 数组 | 项目自定义非代码白名单（如生成的契约快照） | `[]` |
| `models.router` | 模型 ID 或 `null` | 路由会话模型 | `null`（未配置 → 对应环节停下问用户） |
| `models.early` | 模型 ID 或 `null` | 前期工人模型（执行 1–3 段需求/设计/工单；路由只转发/派活/监控） | `null`（未配置不问，1–3 段退回路由直连的旧行为） |
| `models.ticketReview` | 1 或 3 项模型 ID 数组 | 工单 3 路审核模型；1 项=三路同型号，3 项=逐路指定 | `null`（未配置 → 默认异构并停下问用户）；2 项=非法，提醒补齐，不静默补默认 |
| `models.ticketJudge` | 模型 ID 或 `null` | 工单审核裁判模型 | `null`（未配置 → 停下问用户） |
| `models.worker.default` | 模型 ID 或 `null` | 实现工人默认模型 | `null`（未配置 → 停下问用户） |
| `models.worker.light` | 模型 ID 或 `null` | 机械活（文档/工具改造）工人模型 | `null`（回退 `worker.default`，并在提醒里列出） |
| `models.inspector` | 模型 ID 或 `null` | 检查员（节点对标）模型 | `null`（未配置 → 停下问用户） |
| `models.finalReview` | 1 或 3 项模型 ID 数组 | 完成 3 路评审模型；语义同 `ticketReview` | `null`（未配置 → 默认异构并停下问用户）；2 项=非法 |
| `models.finalJudge` | 模型 ID 或 `null` | 完成评审裁判模型 | `null`（未配置 → 停下问用户） |
| `models.offpeak` | 模型 ID 或 `null` | 闲时任务模型 | `null`（未配置 → 停下问用户） |

## 行为约定

- **`ledger.mode=manual`**：triage/复盘直接在 `ledger.pitfalls` / `ledger.deferred` 的 Markdown 里原位改 `- 状态：` 行，不手写编号、不搬家、不删除。
- **`ledger.mode=none`**：不做台账登记；triage 仍可产出本地 issue，但不写台账。
- **`changelog.mode=none`**：S 档和交付都不强制 changelog；验收清单里这一项自动跳过。
- **`finishGate.command=null`**：不假装有门禁；交付时说明“项目未配置收工门禁”。
- **`taskchron.mode=auto`**：宿主有 TaskChron MCP 才同步；不可达时本地 `state.json` 继续，回复中声明。
- **`slots.enabled=false`**：不调用任何槽位命令；实现阶段用普通工作树/当前分支，按项目自身规范。
- **`audit.designDocGlobs`**：`issue-audit.mjs` 判定「销单提交是否触碰代码」时的显式白名单。`docs/design/**/*.yaml|yml`（覆盖表等设计文档）默认放行；项目设计目录不在 `docs/design` 时同步改这里。`allowNonCodeGlobs` 用于其他项目特有非代码文件；**不要**用散落特判绕过机检。
- **`models` 块**：缺失块 / 槽位 `null` / 空数组一律视为「未配置」；未配置的槽位在对应环节**停下问用户，不猜默认**——唯一例外是 `early`：未配置不停下问，1–3 段直接退回路由直连的旧行为。`worker.light` 未配置回退 `worker.default` 并在提醒里列出；`ticketReview`/`finalReview` 数组 2 项视为配置非法，提醒补齐，不静默补默认。模型 ID 形如 `provider/model`，宿主相关——脚本只检查字段形状，不做在线可用性校验；真正派工时宿主报错即回问用户。无 `models` 块的旧项目继续按旧行为跑，只在 `--project-init` 与 `flow-status` 输出提醒。`--project-init` 的一致性比对忽略 `models` 块（该块不由 setup 生成/维护）。

## 机器本地模型配置（`~/.dev-flow/models.json`）

模型分工支持机器级配置：`~/.dev-flow/models.json`（Windows `%USERPROFILE%\.dev-flow\models.json`），**不进任何仓库**——家里/办公两套机器各自指定模型 ID，项目仓不用改。

**形状**：顶层只读 `models` 键，9 个槽位同项目 `.dev-flow.json` 的 `models` 块：

```json
{ "models": { "router": "<model-id>", "worker": { "default": "<model-id>", "light": "<model-id>" } } }
```

**优先级（逐槽位合并）**：机器本地已配置的槽位 > 项目 `.dev-flow.json` 的 `models` > 未配置。`worker.light` 仍可回退 `worker.default`（可跨源：机器配 `default`、项目配 `light` 也算配齐）。数组 1/3 项、2 项非法等形状规则与项目一致；机器槽位写了非法形状值时该槽位按「非法」标出，**不静默回退项目**。

**损坏/形状非法**：文件存在但 JSON 损坏、顶层不是对象、`models` 不是对象 → 明确标非法并给可执行修复提示；修复前按项目配置显示（显式提示，非静默回退）。文件不存在 → 正常用项目配置。

**来源显示**：`flow-status` 模型分工行显示来源——`机器本地` / `项目` / `机器本地+项目` / `未配置`；整体来源按 9 个计数槽位判定（`worker.light` 不参与——它不计入 9 槽位，机器只配 `light` 时整体按其余槽位显示）。`--json` 增 `models.source`（整体四态）、`models.sources`（逐槽位）、`models.machineFile`（`state: ok|absent|invalid` + `path`/`error`），既有输出形状不变（新增字段）。`setup --project-init` 的 `--json` 同样带这三个字段；缺模型配置提醒指向 `~/.dev-flow/models.json` 并说明优先于项目；机器文件损坏时给修复提示。`--project-init` 仍不生成/维护 `models` 块（项目块与机器文件都由用户/路由维护，边界不变）。

**测试/嵌入**：用环境变量 `DEV_FLOW_HOME` 覆盖 home，测试即不读写真实 `~`。注意它**只影响机器模型文件的路径解析**——slot 环境门禁、安装技能根等仍读真实 `~`/`HOME`/`USERPROFILE`；同时钉 `HOME`/`USERPROFILE`/`DEV_FLOW_HOME` 才是完整隔离。

## 生成

在项目根：

```bash
node ~/.zcode/skills/dev-flow-setup/scripts/setup.mjs --project-init --root . --dry-run
```

`--dry-run` 只打印探测结果，不写盘。确认后去掉 `--dry-run`：

```bash
node ~/.zcode/skills/dev-flow-setup/scripts/setup.mjs --project-init --root .
```

已有 `.dev-flow.json` 且内容不同时，需要 `--force` 才会覆盖。

## 示例：带 npm 脚本的项目

```json
{
  "version": 1,
  "docs": { "glossary": "docs/dev-guide/glossary.md" },
  "ledger": { "mode": "command", "add": "npm run issues:add --", "index": "npm run issues:index" },
  "changelog": { "mode": "fragment", "dir": "changelog" },
  "finishGate": { "command": "npm run wt:done", "required": true },
  "taskchron": { "mode": "auto" },
  "slots": { "enabled": true, "claim": "npm run wt:claim --", "done": "npm run wt:done" }
}
```

## 注意

- `specs/<feature>/` 的目录结构和 `state.json` v2 字段是**固定的**，不随配置变化；配置只影响外部约定（词汇表、台账、changelog、门禁、时记、槽位）。
- 配置里的命令按 shell 原样执行；路径相对项目根。
- 不要把密钥/令牌写进 `.dev-flow.json`；它会被提交。

---
name: dev-flow
description: 开发流程单一入口：任何项目、任何阶段，调用它就知道现在在哪、下一步做什么、该用哪个技能、产出什么、怎么验收。支持 S/M/L 分档、triage 旁路、断点续跑；锁技能经 8 个 dev-flow-* 重定向副本安全接入。不替代底层技能，只负责串联和教学。
---

# dev-flow：开发流程单一入口

一句话：**你只需要记住这一个技能。** 它不重写任何原技能，只做四件事：

1. **读状态**，告诉你现在在哪；
2. 告诉你**下一步做什么、用哪个技能、产出什么、门禁是什么**；
3. 能自动做的**直接调**；锁住的用 `dev-flow-*` **重定向副本**；不能安全解锁的**让你执行**；
4. 把状态写进 `specs/<feature>/state.json`，**换会话能续**。

两个根基：

- **本地 issue 是执行真相**：`specs/<feature>/issues/T-XX.md`，一张工单一个文件，不依赖外部 tracker。
- **TaskChron 只做驾驶舱**：功能任务 + 5–10 个环节（epic/批次级；2026-11-17 前已启动的存量功能按真实 epic 数），单向同步，不反向改 specs。

## 什么时候调用

- 开始一个新功能、修 bug、重构
- 做到一半，不知道下一步该干什么
- 换了新会话，想接着上次做
- 不知道某个阶段该用哪个技能
- 想知道「现在能不能交付/验收」
- 想复盘一次验收失败，升级流程
- 手上有 bug 报告/欠账/杂项原料，想先分诊（走 triage 旁路）
- 第一次使用、技能缺失或想升级 → 运行 `/dev-flow-setup`（体检/安装/验证）

> 本技能随包内置上游技能；8 个重定向副本自带正文。副本或脚本缺失时**不要静默替代**，先跑 `/dev-flow-setup` 体检。

## 每次调用先做五件事

0. **读项目配置**：项目根 `.dev-flow.json`（可选）。没有就按 `references/10-project-profile.md` 的探测顺序取默认值；有就以配置为准。它决定词汇表、台账命令、changelog、收工门禁、时记开关、槽位、模型分工。**派工/评审前按它的 `models` 块取对应槽位的模型；该槽位未配置 → 停下问用户，不静默用默认**（`early` 例外：未配置则 1–3 段退回路由直连，见「执行形态」）。
1. **找状态**：项目根 `specs/<feature>/state.json`。
   - 没有 → 进入「初始化」：问用户三件事——这次做什么、大概多大（S/M/L）、手上有没有已有需求/设计/工单。
   - 有一个 → 读它。
   - 有多个 → 列出来让用户选。
2. **算当前位置**：运行本技能目录下的 `scripts/flow-status.mjs`，例如 `node <本技能目录>/scripts/flow-status.mjs --feature <name>`（Windows 用绝对路径；在项目根运行，或加 `--root <项目根>`）。它会告诉你当前阶段、已完成什么、下一步是什么、哪个门禁没过。
3. **进对应阶段手册**：按下面的参考索引读 `references/0X-*.md`，执行「入口检查 → 下一步 → 产出 → 门禁」。
4. **固定格式收尾**（见下）。不要只说「继续加油」，必须给用户可执行的下一步。

## 六步流程（唯一正典顺序）

| 步 | 阶段 | 输入 | 主技能 | 产物 | 门禁 |
| --- | --- | --- | --- | --- | --- |
| 1 | 需求 | 用户一句话/抱怨/想法 | **清晰度分流**：目标/为什么/成功标准不清 → `brainstorming`；目标清楚、已有草案/计划、需压测+落盘 → `dev-flow-grill-with-docs`（正路；L 档强制）；方案已定 → 直接 `dev-flow-to-spec`；按需 `research`/`prototype` | `spec.md`（为什么/目标/非目标/故事/EARS AC/NFR/成功指标；M/L 含澄清记录） | 无独立人工闸门；M/L 澄清记录由 `issue-audit` 从 tickets 起硬检查（L 未走 grill-with-docs 拒收，M 缺记录告警）；并入设计审 |
| 2 | 设计 | `spec.md` | `writing-plans` + `plan-review`；必要时 `codebase-design` | `design.md`（接口/数据流/失败模式/备选/回滚/AC 落点/测试接缝） | **用户签字** |
| 3 | 工单 | 已签字 `design.md` | `dev-flow-to-tickets` + 3 路审核 + 裁判 | `issues/T-XX.md` + `tasks.md` + `traceability.md` + `review-tickets.md` | 3 路无「必须修」；`issue-audit --phase tickets` 绿；用户不参与 |
| 4 | 实现 | 工单图 | `subagent-driven-development` + `tdd` + `diagnosing-bugs` | 代码/测试/`evidence/` | 每节点对标工单+设计；偏离即停；销单 `issue-audit` 绿 |
| 5 | 完成评审 | 完整 diff + 证据 | `code-review` + `requesting/receiving-code-review` + `verification-before-completion`；3 路评审 + 裁判 | `review-final.md` | 必须修清零；连续两轮无新增；`issue-audit --phase final-review` 绿；用户不参与 |
| 6 | 验收 | 通过评审的代码 | 本技能验收模板（吸收 `pr` 的 Summary/Evidence/Merge Danger） | `acceptance.md` + `acceptance-result.md` | `issue-audit --phase acceptance` 绿；**用户实机验收** |
| 7 | 复盘 | 验收失败现象 | `dev-flow-retro` + `diagnosing-bugs`（如需） | `process-upgrade.md` | 用户确认升级项；重跑受影响阶段 |

**发布/运维不在本流程内。** 本流程到「用户实机验收通过」结束；发版走项目自己的发布流程。

### 需求阶段：先判清晰度，再选技能

需求阶段的入口不是固定 `brainstorming`，按「目标是否清楚」分流：

| 清晰度 | 入口 | 说明 |
| --- | --- | --- |
| 目标/为什么/成功标准不清 | `brainstorming` | 先发现目标；卡住再 `grilling` + `domain-modeling`；缺事实按需 `research`/`prototype` |
| 目标清楚、已有草案/计划、需压测+落盘 | **`dev-flow-grill-with-docs`（正路）** | grilling + domain-modeling，关键决策/术语落项目文档；**L 档强制** |
| 目标清楚、方案已定 | 直接 `dev-flow-to-spec` → `writing-plans` | 不再重复 brainstorm/grill |

- 一次只用一个主技能；S 档可一段话说明，**M/L 必须在 `spec.md` 留「澄清记录」**（方式 / 关键决策 / 未决项）。
- `grill-with-docs` 原版仍只供人手动触发；dev-flow 内只用重定向副本 `dev-flow-grill-with-docs`。

## 执行形态（路由编排 vs 单会话）

六步在哪种会话拓扑里跑，开工前先定（检测宿主有无会话工具 CreateSession/SendToSession；SendToSession 仅作路由→工人命令/提醒，不作工人回传，见 `references/09-conductor.md` §3）：

- **有会话工具**且 4–6 段有一批可并行工单 → **路由编排**（04 形态 B 的协议化）：一个路由会话派工收账，N 个工人会话施工；派工令六字段/回传报告块（工人完工只落 `evidence/<ticket>-report.md` 并提交；`SendToSession` 只用于路由→工人发命令/提醒，不作工人回传）/调度台账/上下文治理见 `references/09-conductor.md`，派工令先过 `scripts/check-order.mjs` 机检；工人完工收账后，无后续用途的会话及时归档（09 §12）。
- **没有会话工具** → 单会话 SDD（04 形态 A）；报告块七行改作会话内交付汇报小节标题沿用，协议不失效（降级细则见 09 §8）。
- 1–3 段（需求/设计/工单）：**未配置 `models.early` 时（含无 `models` 块的旧项目）路由与用户直接对齐，不派工人**；项目 `.dev-flow.json` 存在 `models.early` 时改为派**前期工人**执行这三段——路由只做转发消息/派活/监控，模型取 `models.early` 槽位；形态 C（用户亲写）不经会话编排，不走本决策（三形态全表见 04；派工取模规则见 `references/09-conductor.md` §1）。

## 风险分档

| 档 | 判据 | 走哪些步 |
| --- | --- | --- |
| **S** | 单文件/半天内/无行为面变化/纯文案样式 | 跳过 spec/design/tickets；TDD + 节点检查 + 验收说明；项目配置了 `changelog.mode` 时仍需 changelog |
| **M** | 单模块功能/修复 | 1→6 全走；设计审可简化为一段话 |
| **L** | 跨模块/公共框架/不可逆变更/数据或协议变更/≥30 文件 | 全走 + 架构评审 + 安全评审（触及信任边界）+ 设计必须签字 |

拿不准就升档，不许降档。S 档也不能跳过「先写失败测试」和「验收说明」。M 档工单如触及信任边界/协议·数据·不可逆变更，评审升到高风险档（≥2 交叉）。

## 两道人工闸门 + 线性闭环

1. **设计签字**：用户确认设计文档的接口、失败模式、非功能、回滚。
2. **实机验收**：用户按 `acceptance.md` 操作，回复通过/不通过。

工单审核、完成评审都是 AI 自动，不打扰用户；但用户可随时抽查证据。

- 阶段只按顺序前进；回退只允许回到「设计」或「工单」。
- 验收失败 → 复盘 → 定位漏点 → 升级检查/模板/门禁 → 重跑受影响阶段。
- 项目自己的收工门禁（`.dev-flow.json` 的 `finishGate.command`，如 `npm run wt:done`）是代码落地的最后一道锁；未配置时以项目自身规范为准。

## Triage 旁路（不进六步主线）

`dev-flow-triage` 是入口旁的「分诊台」，处理三类原料：

- 外部/内部 bug 报告 → 坑点台账；
- enhancement/欠账/验收/裁决/限制 → 延后项台账；
- 已规划功能的本地 issue → `specs/<feature>/issues/`。

它不推进六步主线，只做：分类、复现、冗余检查、补充信息、写出可开工的 brief、把状态改到位。triage 判定 `ready-for-agent` 后，才按需进入需求阶段（或直接派实现）。细则见 `references/03-tickets.md` 的 triage 节。

## 技能调用策略（不许 AI 随心挑）

**直接调用**（模型可调）：`brainstorming`、`grilling`、`domain-modeling`、`writing-plans`、`plan-review`、`tdd`、`code-review`、`diagnosing-bugs`、`subagent-driven-development`、`verification-before-completion`、`requesting-code-review`、`receiving-code-review`、`security-audit`、`test-audit`、`research`、`prototype`、`codebase-design`、`improve-codebase-architecture`、`dispatching-parallel-agents`。

**随包传递依赖**：`using-git-worktrees`、`executing-plans`、`finishing-a-development-branch` 随包内置，供 `writing-plans`/`subagent-driven-development` 按其正文按需调用。项目有槽位/收工门禁时，**优先项目机制**（见 `references/skill-map.md`）。

**重定向副本**（8 个必需，`dev-flow-` 前缀，可被本技能调用，不单独调用）：

| 副本 | 原技能 | 输出目标 | 去掉的副作用 |
| --- | --- | --- | --- |
| `dev-flow-grill-with-docs` | `grill-with-docs` | 项目词汇表 + 设计文档（默认 `docs/dev-guide/glossary.md` + `docs/design`/`docs/implemented`；可由 `.dev-flow.json` 的 `docs.*` 覆盖） | 不建根 `GLOSSARY.md`/`docs/adr/` |
| `dev-flow-to-spec` | `to-spec` | `specs/<feature>/spec.md` | 不调 `gh`/`glab`、不建 tracker issue、不打标签 |
| `dev-flow-to-tickets` | `to-tickets` | `specs/<feature>/issues/T-XX.md` + `tasks.md` | 不调 tracker、不建 blocking 链接 |
| `dev-flow-to-questionnaire` | `to-questionnaire` | `specs/<feature>/questionnaire.md` | 不写当前目录 |
| `dev-flow-handoff` | `handoff` | `specs/<feature>/handoff.md` | 不写系统临时目录 |
| `dev-flow-retro` | `retro` | `specs/<feature>/process-upgrade.md` | 不直接改 AGENTS/规范/技能 |
| `dev-flow-wayfinder` | `wayfinder` | `specs/<feature>/wayfinder/map.md` + `issues/W-XX.md` | 不建 tracker、不推分支 |
| `dev-flow-triage` | `triage` | 本地 issue/双台账（台账命令取 `.dev-flow.json` 的 `ledger.*`；无命令时 manual 模式） | 不调外部 tracker |

其中 `dev-flow-grill-with-docs` 是**需求阶段的正路**（目标清楚、已有草案/计划时），不是可选补丁；设计阶段主技能仍是 `writing-plans` + `plan-review`，不重复需求拷问。

**不使用**：`implement`（薄包装，用 `subagent-driven-development` + `tdd` + `code-review` 组合替代）、`implement-spec`（建分支/合并，与槽位冲突）、`pr`（不走 PR；模板吸收进 `acceptance.md`）。

**绝不静默替代**：副本缺失、门禁不满足、输出路径不可写 → **停，提示用户**。不允许用「差不多」的模板冒充原技能；如果用了模板，必须标明「dev-flow 模板，不是原技能」。副本维护（能力账 + 同步检查）见 `references/locks.md`。

## 状态文件（v2）

每个功能一个目录：

```
specs/<feature>/
  state.json           # 机器读：阶段/门禁/下一步/受影响模块/历史（v2）
  state-history.json   # state.json.history 旧条目归档（09 §5）
  handoff.md           # 人读：做到哪/下一步/卡在哪
  spec.md              # 为什么/成功指标/非目标/故事/EARS AC/NFR
  design.md            # 接口/数据流/失败模式/备选/回滚/NFR
  issues/T-XX.md       # 一张工单一个文件（执行真相）
  tasks.md             # 只做索引和阻塞图
  traceability.md      # AC → 工单 → 测试/证据（含设计决策→工单映射）
  design-deviation.md  # 设计偏差登记表（偏离决策的法定登记入口）
  review-tickets.md    # 工单 3 路审核报告
  review-final.md      # 完成 3 路评审报告
  acceptance.md        # 实机验收步骤（Summary/Evidence/Merge Danger）
  acceptance-result.md # 用户验收结论
  process-upgrade.md   # 复盘升级
  evidence/            # 命令输出/截图/日志
```

`state.json` 关键字段（完整模板见 `templates/state.json`）：

- `version: 2`、`feature`、`title`、`tier`、`stage`、`status`、`currentTicket`、`nextAction`；
- `artifacts`：各产物的路径登记；
- `gates`：`designApproved` / `ticketsReviewed` / `finalReviewed` / `userAccepted`；
- `affectedModules` / `dependsOnFeatures`：多功能协调用（L 档启动前扫描重叠，见 `references/02-design.md`）；
- `history`：每次阶段切换追加一条；`updatedAt`。

阶段值只允许：`init | requirements | design | tickets | implement | final-review | acceptance | retro | done | blocked`。
状态值只允许：`in-progress | waiting-user | blocked | done`。

## 项目配置（可选）

项目根 `.dev-flow.json` 决定项目差异；解析顺序：配置文件 → 自动探测 → 中性默认。字段：

| 字段 | 作用 | 默认 |
| --- | --- | --- |
| `docs.glossary` / `docs.design` / `docs.implemented` | 词汇表与设计文档路径 | 探测 `docs/dev-guide/glossary.md` 等；设计/实现文档默认 `docs/design` / `docs/implemented` |
| `ledger.mode/add/index` | 坑点/延后项台账：`command` 调项目命令，`manual` 直接改 Markdown，`none` 不用 | `manual` |
| `changelog.mode/dir` | 更新日志：`fragment`/`file`/`none` | `none` |
| `finishGate.command/required` | 收工门禁（如 `npm run wt:done`） | `null` |
| `taskchron.mode` | 时记同步：`on`/`off`/`auto` | `auto` |
| `slots.enabled/claim/done/dir` | 项目槽位/工作树协议 | `false` |
| `models.*` | 模型分工：每个环节用哪个模型（`router`/`early`/`ticketReview`/`ticketJudge`/`worker.default`/`worker.light`/`inspector`/`finalReview`/`finalJudge`/`offpeak`） | 无 `models` 块 = 未配置：对应环节**停下问用户，不静默用默认**（`early` 未配置则 1–3 段退回路由直连；旧项目无块按旧行为跑，`--project-init` 与 `flow-status` 会提醒）。schema 见 `references/10-project-profile.md` |

生成：`node ~/.zcode/skills/dev-flow-setup/scripts/setup.mjs --project-init --root <项目根> --dry-run`（先看探测结果，再去掉 `--dry-run` 落盘）。完整 schema 与示例见 `references/10-project-profile.md`。

## 时记同步（可选，驾驶舱，单向）

**开关**：`.dev-flow.json` 的 `taskchron.mode`：`on` 强制、`off` 关闭、`auto`（默认）看宿主是否有 TaskChron MCP。关闭或 MCP 不可达时跳过同步，本地 `state.json` 继续，并在回复中声明「时记未同步」。

开启时：一个功能一个父任务 + 5–10 个环节子任务（epic/批次级；大白话标题，完成一个勾一个）；工单细节不入时记，「调度动作不入时记」只约束不建工单级条目，**环节状态维护是收账必做动作**。环节在 03 工单阶段随 `tasks.md` 同批建（3 路审核通过后），建齐后把任务 ID 回填 `state.json` 的 `taskchron` 映射（`parentId`/`epics`/`lastSyncedAt`）；非环节最后一张的收账 `update_task` 刷新所属环节备注（已完成/总数 + 一句大白话进度，不改状态），最后一张收账才勾环节（最后一个环节等 05/06 出口满足后再勾），全部环节完成时父任务同批 done。**新鲜度锚点 `lastSyncedAt`：最新销单时刻晚于它即「时记过期」，必须同步后才能收尾，同步成功后写回**；该新鲜度由 issue-audit 第 8 项门禁在 `--phase final-review`（`wt:done` 全量审计）机器硬拦（staged/tickets 不查；块缺失/mode=off 跳过，同步后写回锚点即转绿）。dev-flow 写 TaskChron，TaskChron 不反向改 `specs/`。旧版工单级/阶段里程碑子任务作为历史账保留；旧功能如需补录，用 `scripts/taskchron-payload.mjs`。细则见 `references/08-taskchron-sync.md`。

## 每次调用必须输出的格式

```
【dev-flow】
功能：<name>（<title>）
档位：S/M/L
现在：<阶段中文名>
上次：<一句话>
下一步：<一句话，必须是动作>
需要你做：<没有就写「无」；有就写具体动作/命令>
可以调用：<技能名；dev-flow-* 副本直接点名>
产出：<文件路径>
门禁：<当前门禁是否通过；没过缺什么>
状态文件：specs/<feature>/state.json
```

**每一轮（含一句话确认/状态回复）都必须**按 `references/09-conductor.md` 的「每轮汇报四块」输出四块，并用「### 标题 + 块间空一行」视觉分隔：每块用 `### <emoji> <块名>` 标题独立成行，**块与块之间至少空一行，禁止四行紧贴**（首块「### 🚧 本路由正在干的活」只列当前已派出去、正在施工的工单/会话/模型/截止；没有内容写「无」）；单会话形态首块写「🚧 本会话正在干的活」，至少用前三块，第四块批量落地时补。每轮回复可用 `node <技能目录>/scripts/check-round.mjs <回复文件>` 自检（这是自检工具，不强制钩子；机检只校验块名，不强制标题级别与空行）。

如果用户问「我接下来干嘛」，只输出这个格式 + 一句教学解释，不要写长篇大论。

## 铁律

1. **一个阶段只选一个主技能**，不要同时开两个。
2. **不许跳门禁**：设计没签字不进工单；工单审核有「必须修」不进实现；完成评审有「必须修」不交付；用户没验收不算完成。
3. **不许悄悄改设计**：实现阶段发现设计错了，停下来回设计阶段；设计级变更让用户批，实现细节写进 `decision-log.md`。
4. **每个节点必须有证据**：命令、退出码、输出、截图；「我检查过了」不算证据。
5. **断点先写文件**：每次阶段切换更新 `state.json`；换会话先读它，不靠记忆。
6. **spec 没有可观察的成功指标，不得进入设计**（数量/时间/用户动作，不写「更好用」）。
7. **M/L spec 必须留澄清记录**：目标不清走 `brainstorming`、目标清楚且有草案/计划走 `dev-flow-grill-with-docs`（L 档强制）、方案已定才直接写 spec；缺「澄清记录」由 `issue-audit` 硬检查（L 拒收，M 告警）。

## 参考索引

- `references/00-how-to-use.md`：第一次用先读这个，带一个完整例子
- `references/01-requirements.md`：需求阶段清晰度分流（brainstorming / dev-flow-grill-with-docs / direct）；spec 的为什么/成功指标/非目标/澄清记录
- `references/02-design.md`：NFR、失败模式、安全触发、回滚、多功能协调
- `references/03-tickets.md`：本地 issue、3 路审核含 NFR、triage 升级
- `references/04-implement.md`：SDD/TDD、节点对标、多会话拓扑（三形态/评审铁律/入口切换清单/上下文治理）、接线/回归、跨仓库协作；评审按风险分档（高风险 ≥2 交叉，M 档 1 路 + 机器门禁，S 档自检）
- `references/05-final-review.md`：3 路 + 裁判 + 校准记录
- `references/06-acceptance.md`：验收包（Summary/Evidence/Merge Danger）、DoD 文档清单
- `references/07-retro.md`：复盘升级、双台账联动
- `references/08-taskchron-sync.md`：TaskChron 同步载荷与降级规则
- `references/09-conductor.md`：路由编排层——派工令六字段/回传报告块（evidence 唯一通道：工人完工只写 `evidence/<ticket>-report.md` 头部并提交，不调 SendToSession；SendToSession 只作路由→工人命令/提醒）/调度台账/上下文阈值与 handoff/降级/看门狗/两级过滤（跨会话派工必读）；会话命名槽位前缀（领取槽位后补 `S<N>-`）；成本纪律（一票一会话/派工指针化/报告限长/台账瘦身）
- `references/10-project-profile.md`：`.dev-flow.json` 的字段、默认值、探测顺序与示例
- `references/11-testing.md`：测试体系（改动类型→测试要求、两级门禁、未测试区、并排考卷、抖动治理、断言质量、证据格式、评审衔接）
- `references/skill-map.md`：技能对照与阶段调用矩阵
- `references/locks.md`：锁策略、8 副本、能力账与同步检查（维护仓工具）
- `templates/`：spec / design / issue / tasks / traceability / design-deviation / review-tickets / review-final / acceptance / process-upgrade / state / handoff / dispatch-order / report / ledger / router-round（后四件为路由编排协议物）
- `calibration/`：评审坏样例库与校准报告（维护仓提供；运行包不含时按通用清单评审）
- `dev-flow-setup`（同包技能）：体检/安装/验证/项目配置；用 `/dev-flow-setup` 调用
- `scripts/flow-status.mjs`：读状态并打印下一步
- `scripts/flow-set.mjs`：更新阶段/门禁/下一步
- `scripts/taskchron-payload.mjs`：生成 TaskChron 同步载荷
- `scripts/issue-audit.mjs`：工单硬门禁（状态行唯一格式/扫描范围含 T-13A·T-13B1 等字母后缀/done 勾选/自签收拦截/设计决策映射节落点/issue↔tasks↔traceability 状态同步/豁免独立签名/`docs/design/**/*.yaml` 白名单/台账对账命令），`--phase tickets|final-review|acceptance|release` 分别接工单审阅、销单、完成评审、验收、发布前置；失败即拦
- `scripts/check-order.mjs`：派工令六字段机检（缺项拒开工，路由派工前必跑，自带 --self-test）
- `scripts/report-ledger.mjs`：报告块→台账机检（七行校验/按提交号去重幂等/追加一行，路由收账用，自带 --self-test）
- `scripts/check-round.mjs`：每轮汇报四块机检（四标题齐备即过，首块「本路由正在干的活」，单会话变体「本会话正在干的活」同放行；不强制标题级别与空行，自检样例固定「### 标题+块间空行」标准格式防文档回退；接受文件参数或 stdin，自带 --self-test）
- `scripts/watchdog.mjs`：路由编排看门狗（租约/台账/门禁三健康项、三振出局、四档退出码，巡检只报不修，自带 --self-test）
- `scripts/watch-reports.mjs`：报告监视器（只读盯 `specs/<feature>/evidence/*.md`，新报告稳定后打印 `NEW_OR_CHANGED_REPORTS` 退出，宿主在后台任务退出时唤醒路由收账；与「路由每轮开头主动扫 evidence 兜底」构成双保险，监视器只缩短延迟不是唯一通道，自带 --self-test）

> 脚本在本技能目录的 `scripts/` 下，不在项目里。运行时用绝对路径；在项目根运行，或加 `--root <项目根>`。

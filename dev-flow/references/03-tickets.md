# 03 工单阶段（你不参与）

## 目标

把设计拆成可独立验收的工单，并让 3 路 AI 审核确认「工单忠实于设计」。这一步用户不审细节。

**本地 issue 是执行真相**：`specs/<feature>/issues/T-XX.md`，一张工单一个文件；`tasks.md` 只做索引和阻塞图。

## 输入

- 已签字的 `design.md`
- `spec.md` 的 AC
- 代码库现状（模块、文件、接口）

## 用哪个技能

| 情况 | 技能 | 说明 |
| --- | --- | --- |
| 拆工单 | `dev-flow-to-tickets` | 副本：写 `specs/<feature>/issues/T-XX.md` + `tasks.md`；不调 tracker、不建 blocking 链接（blocking 用文字） |
| 单内步骤 | `writing-plans` | 每张工单内部再拆 2-5 分钟步骤，精确文件/接口 |
| 审核工单 | 3 个并行 agent + 裁判 | 见下 |

## 工单格式（一张一个文件）

`specs/<feature>/issues/T-01.md`，用 `templates/issue.md`：

```md
# T-01 <标题>

**状态**：pending | in-progress | done | blocked | cancelled
**Blocked by**：无 | T-00
**交付**：<端到端行为，用户视角>
**改哪些文件**：
- `<项目文件路径 1>`
- `<项目文件路径 2>`
**验证命令**（以项目实际为准；模板里的命令只是示例）：
- `<项目验证命令>`
- `<项目验收命令>`
**回指**：AC-1、AC-2
**影响面**：<模块/旧功能/数据>
**安全触发**：是/否（触及信任边界/权限/数据迁移/删除）
**本单评审执行者与方式**：<必填。谁评审+以什么方式（取值示例见 templates/issue.md，不得弱于 04 评审铁律的风险档强度）；缺此字段不开工（见 04-implement 多会话拓扑开工门禁）>

## 验收清单
- [ ] ...

## 节点对标结论（销单必填——缺此节或三项任一为空不得置 done；占位符未替换视为空）
- **评审执行者**：<按「本单评审执行者与方式」实际执行的情况>
- **必须修清单**：<合并后必须修项；写「无」须各路均零必须修>
- **处置记录**：<已修（落点）/ 误报（理由）/ 延后（台账条目号）；零必须修时写「零必须修，无需处置」>

## 历史
- <日期> 创建，3 路审核通过
```

禁止写「实现 X 功能」这种没有文件、没有验证命令的工单。**「本单评审执行者与方式」为必填字段：开工前缺失不开工**——防跨会话派单时评审环节静默流失（工人以为调度查、调度以为工人查）。

**状态行唯一格式（硬门禁）**：`**状态**：<首 token>`，首 token 只能是 `pending|in-progress|done|blocked|cancelled`；中文说明放括号或后续（`done（feat abc + docs 收口）` 合规）。`✅`、`ready-for-agent`、`closed` 等写法由 `scripts/issue-audit.mjs` 直接判红——**不再「规范化后继续」或整张单跳过**。

**扫描范围（硬门禁）**：工单文件名必须是 `T-<数字>[字母数字后缀].md`（`T-01`、`T-13A`、`T-13B1`、`T-13B2` 均入扫描）。形如 `T-*.md` 但不合规范的文件会被机检判红并拒绝静默漏扫（坑 0-9 教训）。

`tasks.md` 只做索引和阻塞图（工单 | 标题 | Blocked by | 状态），不承载工单内容。索引状态列写 `pending|in-progress|done|blocked|cancelled`，必须与 issue 状态行**首 token 一致**；历史文件的 ⬜/🔄/✅/⛔ 图例按同义映射参与比对。

**设计决策映射（硬门禁）**：工单附加段「**覆盖**：」行声称的每个设计决策 ID（裸格式 `D60`，前导零等价）必须在 `traceability.md` 的「设计决策映射」节有一行落点（决策正本 / 兑现工单 / 证据至少一项），或已登记 `design-deviation.md`。缺映射节、缺行、映射行只有 `planned` 而工单已 done，均判红（销单与完成评审前置，见 04-implement 销单门禁）。

## 3 路审核（并行，默认异构）

**模型分工**：3 路审核默认换模型家族；项目 `.dev-flow.json` 的 `models.ticketReview` 显式指定（1 项=三路同型号、3 项=逐路指定）时以配置为准——同型号三路是三种审查视角，仍互补，但必须在 `review-tickets.md` 的校准记录声明「按项目配置三路同型号」。裁判模型按 `models.ticketJudge` 取，不再自行「再换一个」。对应槽位未配置 → 停下问用户，不静默用默认（见 09 §1 运行期取模）。

### 审核 1：设计符合性（含 NFR）

- 设计里的每条要求，工单有没有覆盖？
- **设计 NFR 清单逐条核对**：性能/安全隐私/兼容/迁移/失败模式/可观测，每条要么有工单落点、要么设计里明确「不适用」；缺了就是 `blocking`。
- 有没有工单做了设计外的事（scope creep）？
- 有没有设计里写了但没人做的落点？
- 输出：`blocking`（缺覆盖/夹带/NFR 缺落点）或 `suggestion`。

### 审核 2：拆解正确性

- 粒度是否一张工单一个会话能做完？
- Blocked by 是否只写真正门禁它的工单？
- 预重构是否单独成单且排在最前？
- 宽重构是否走 expand-contract？
- 文件范围是否重叠到会互相踩？
- 多功能协调：`affectedModules` 与其他进行中功能重叠时，有没有提示排序？
- 输出：`blocking`（依赖错/粒度过大/顺序错）或 `suggestion`。

### 审核 3：可验收性

- 每张工单的验收清单是否可执行？
- 测试能否证明行为，而不是证明实现？
- **「不出现」类判据须带入链前提**：凡判据证明力依赖「X 曾进入被测链路」（不出现/不泄露/不调用/不乱序/被过滤/被重排），清单须同时含「X 经真实注入点进入被测链路」的入链证据项——否则该判据不可验证（恒真空转，见 05-final-review 测试证明力反面教材）。
- 边界/异常/回归有没有覆盖？
- 接线（入口/路由/IPC/UI/资源清单）有没有检查点？
- 安全触发标「是」的工单，验证命令里有没有对应检查？
- 输出：`blocking`（无法验证/缺关键场景）或 `suggestion`。

## 裁判

- 合并三份清单，按「文件+问题指纹」去重。
- 分四类：必须修 / 建议 / 误报 / 挑刺。
- 只有「必须修」能阻断。
- 如果审核发现设计本身有歧义：**不许改设计**，停下回设计阶段，让用户拍板。

## 门禁

- 3 路审核无「必须修」。
- 每张工单含非空「本单评审执行者与方式」字段（缺失在工单阶段就地拦，不放行到实现阶段）。
- **机检前置（硬拦）**：`node <技能目录>/scripts/issue-audit.mjs --root <项目根> --feature <name> --phase tickets` 退出码必须为 0。它校验状态行唯一格式、工单文件名扫描范围、`tasks.md` 索引行与状态一致、`traceability.md` 设计决策映射节对每个「覆盖」D-ID 有落点。任一红＝工单未审过，不进实现。
- `traceability.md` 每条 AC 至少一张工单、一个测试/证据；状态列只允许 `planned|in-progress|done|blocked`，且与工单状态同步（done 工单不得对应 `planned` AC 行）。
- 有 `BLOCKED` 的 AC 不许开工。
- 更新状态：`gates.ticketsReviewed=true`，`stage=implement`。

## 产出

- `specs/<feature>/issues/T-XX.md`（一张一个文件）
- `specs/<feature>/tasks.md`（索引 + 阻塞图；3 路审核通过后按 `08-taskchron-sync.md` 建时记环节）
- `specs/<feature>/review-tickets.md`（3 路原始发现 + 裁判结论）
- `specs/<feature>/traceability.md`

## 常见错误

| 错误 | 后果 | 纠正 |
| --- | --- | --- |
| 工单按层切（先所有 UI，再所有后端） | 无法独立验收 | 纵切：一条端到端细线 |
| 工单没有验证命令 | 实现者自报完成 | 每张单写命令 |
| 依赖边写「全都依赖第一张」 | 无法并行 | 只写真正门禁的边 |
| 审核 1 不看 NFR | 性能/兼容欠账漏到验收 | NFR 清单逐条核对 |
| 审核只跑一个 agent | 漏掉视角 | 3 路 + 裁判 |
| 审核发现设计问题却自己改设计 | 设计失去权威 | 停下回设计阶段 |

## Triage 旁路（不进六步主线）

`dev-flow-triage` 是入口旁的「分诊台」，处理三类原料：

| 原料 | 去处 |
| --- | --- |
| 外部/内部 bug 报告 | 坑点台账 |
| enhancement/欠账/验收/裁决/限制 | 延后项台账 |
| 已规划功能的本地 issue | `specs/<feature>/issues/` |

它不推进六步主线，只做：分类、复现、冗余检查、补充信息、写出可开工的 brief、把状态改到位。规则：

- 类别映射按项目自己的 triage 标签约定（如有；无则用 needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）；
- 台账命令取 `.dev-flow.json` 的 `ledger.*`：`ledger.mode=command` 时新增条目调 `ledger.add`、不手写编号，改完跑 `ledger.index`；`ledger.mode=manual` 时直接在 `ledger.pitfalls` / `ledger.deferred` 的 Markdown 里原位改 `- 状态：` 行，不删除、不搬家；`ledger.mode=none` 时跳过台账；
- 红线：`0-` 前缀台账条目为用户专用，不碰、不改号；
- 统一视图按「待分诊 / 待补信息 / 可开工 / 需人处理 / 已退役」五分组；
- `ready-for-agent` 且需要多步开发的条目 → 建议进入 dev-flow 需求阶段，生成 `specs/<feature>/`（升级建议，不自动建）；
- 分诊写出的简报（Agent Brief，落工单文件 `## Agent Brief` 节）与工单同样**必填「本单评审执行者与方式」**，开工前缺失不开工（落工单头部或 Brief 节任一处即视为满足，并存须一致）；
- `ready-for-agent` 条目在 `taskchron.mode` 为 `on`/`auto` 且宿主有 TaskChron MCP 时，可按需同步为 TaskChron 任务（规则见 `08-taskchron-sync.md`）；关闭时跳过并声明。

## 下一步

`references/04-implement.md`

# 01 需求阶段

## 目标

把「要解决什么问题」聊清楚，而不是直接跳到一个方案。产出 `spec.md`，让后面所有人（包括未来的你）知道为什么做、做什么、不做什么、怎么算成功。

## 输入

- 用户的一句话需求/抱怨/想法
- 现有代码、文档、台账（如有）
- 项目词汇表（`.dev-flow.json` 的 `docs.glossary`；无配置时探测 `docs/dev-guide/glossary.md`、`docs/glossary.md`、`GLOSSARY.md`）
- triage 旁路转来的 `ready-for-agent` brief（如有，见 `03-tickets.md` 的 triage 节）

## 先判清晰度（再选技能）

需求阶段**不是固定先 brainstorming**。先判「目标是否清楚」，再按分流选主入口：

| 清晰度 | 主入口 | 说明 |
| --- | --- | --- |
| 目标/为什么/成功标准不清 | `brainstorming` | 先发现目标；卡住再 `grilling` + `domain-modeling` |
| 目标清楚、已有草案/计划、需压测+落盘 | **`dev-flow-grill-with-docs`（正路）** | grilling + domain-modeling，关键决策/术语落项目文档；**L 档强制** |
| 目标清楚、方案已定 | 直接 `dev-flow-to-spec` | 不再重复 brainstorm/grill，直接定稿 |

辅助技能（按需配合，一次只用一个主入口）：

| 情况 | 技能 | 说明 |
| --- | --- | --- |
| 缺的知识在别人脑子里 | `dev-flow-to-questionnaire` | 副本：写 `specs/<feature>/questionnaire.md`，不写当前目录 |
| 缺的事实在外部 | `research` | 后台子代理查一手来源，落引用文件 |
| 大到看不清 | `dev-flow-wayfinder` | 副本：先画决策地图到 `specs/<feature>/wayfinder/`，再回到本流程 |
| 设计问题要跑起来看 | `prototype` | 一次性原型，回答一个问题，不保留代码 |
| 需求聊完定稿 | `dev-flow-to-spec` | 副本：写 `specs/<feature>/spec.md`；不调 `gh`/`glab`、不建 tracker issue、不打标签 |

**一次只用一个主技能。** `brainstorming` 卡住再上 `grilling`；`dev-flow-grill-with-docs` 本身就是 grilling + domain-modeling 的组合，不要再叠加 `brainstorming`。`grill-with-docs` 原版仍只供人手动触发，dev-flow 内只用副本。

## 步骤

1. **判清晰度并记录方式**：按上表选主入口，并确定 `spec.md` 的「澄清记录」写什么方式——`brainstorming` / `dev-flow-grill-with-docs` / `direct`。S 档可一段话说明；**M/L 必填**。
2. **复述需求**：用一句话说清「谁、在什么场景、遇到什么问题、想要什么结果」。让用户确认。
3. **问清边界**：一次一个问题，优先问：
   - 现在没有这个功能时，用户怎么干活？
   - 什么算成功？失败长什么样？
   - 明确不做什么？
   - 有哪些非功能约束（性能、数据量、兼容、安全、离线）？
4. **给方案**：2-3 个方案 + 推荐 + 理由。不要只给一个。
5. **写 `spec.md`**：用 `templates/spec.md`。**第一节固定为「为什么做 / 成功指标 / 非目标」**：
   - 成功指标必须**可观察**（数量、时间、用户动作），不写「更好用」「更流畅」；
   - 例：「1 万要素导出 ≤5 秒」「用户 3 步内完成导出」「中文图层名零乱码」。
   - **M/L 必须写「澄清记录」**：方式 / 关键决策 / 未决项；L 档方式必须是 `dev-flow-grill-with-docs`。
6. **写 AC**：每条验收标准写成 EARS：
   - `WHEN <触发> THE SYSTEM SHALL <可观察结果>`
   - `IF <异常> THEN THE SYSTEM SHALL NOT <禁止行为>`
   - `WHILE <状态> THE SYSTEM SHALL <行为>`
7. **自检**：每条 AC 能不能变成一个测试或一个可复现命令？不能就标 `[NEEDS CLARIFICATION]`。
8. **更新状态**：`stage=design`，`nextAction=写 design.md`。

## 产出

`specs/<feature>/spec.md`，至少包含（顺序也按此）：

- **为什么做 / 成功指标 / 非目标**（第一节，固定）
- **澄清记录**（M/L 必填；S 可省略）：方式（`brainstorming` / `dev-flow-grill-with-docs` / `direct`）、关键决策、未决项
- 背景/问题
- 目标
- 用户故事（编号）
- 验收标准（每条可执行，带 AC 编号）
- 边界/错误场景
- 非功能需求（性能/安全/兼容/迁移/离线）

## 门禁

本阶段没有独立人工闸门。`spec.md` 会和 `design.md` 一起在设计阶段给用户审。但：

- **没有可观察的成功指标，不得进入设计阶段**（铁律）。
- **M/L 缺「澄清记录」不得进入设计阶段**：L 档由 `issue-audit`（tickets 起）硬拦，M 档至少告警；**L 档方式必须是 `dev-flow-grill-with-docs`**，否则拒收。
- 如果 AC 不可执行、非目标缺失、非功能全空，**不许进入设计阶段**。
- 如果用户说「先做着看」，把它记成风险，并在设计阶段明确「本次不覆盖什么」。

## 常见错误

| 错误 | 后果 | 纠正 |
| --- | --- | --- |
| 用户说「加个导出」，直接问「用什么格式」 | 可能做错功能 | 先问谁用、解决什么问题 |
| 成功指标写「更好用」 | 没法判断做对了没 | 改成数量/时间/用户动作 |
| AC 写成「导出要快」 | 无法验收 | 改成「1 万要素内 5 秒完成」 |
| 非目标不写 | 范围膨胀 | 明确列出这次不做什么 |
| 非功能不写 | 上线后性能/兼容爆 | 至少写数据量、性能、兼容、安全四条 |
| 目标清楚还先跑 `brainstorming` | 浪费轮次、跑偏 | 有草案/计划直接 `dev-flow-grill-with-docs`；方案已定直接写 spec |
| L 档跳过 `dev-flow-grill-with-docs` | 关键决策无落盘、术语漂移 | L 档强制走副本，并在澄清记录写明方式 |

## 下一步

`references/02-design.md`

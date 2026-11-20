# 技能对照表：重复时用哪个 + dev-flow 调用矩阵

一句话规则：**直接调可调技能；锁技能一律走 `dev-flow-*` 重定向副本；`implement`/`implement-spec` 不使用。同一阶段不要同时跑两个主技能。**

## 一、Matt vs Superpowers 重叠时用哪个

| 场景 | 重叠技能 | 用哪个 | 原因 |
| --- | --- | --- | --- |
| 需求/设计开场 | `brainstorming` vs `grilling` vs `dev-flow-grill-with-docs` | 清晰度分流：目标不清 → `brainstorming`；目标清楚、已有草案/计划 → `dev-flow-grill-with-docs`（正路，L 强制）；方案已定 → 直接 `dev-flow-to-spec` | brainstorming 发现目标；grill-with-docs 压测并把决策/术语落盘；grilling 是它内部的拷问引擎 |
| 规格 vs 计划 | `dev-flow-to-spec`（副本）vs `writing-plans` | `dev-flow-to-spec` 先（定做什么/为什么/验收），`writing-plans` 后（定改哪个文件、什么步骤） | 两个不是重复，是不同层 |
| 拆单 vs 步骤 | `dev-flow-to-tickets`（副本）vs `writing-plans` | `dev-flow-to-tickets` 出工单图（本地 issue 文件）；`writing-plans` 出单内步骤 | 工单是交付单元，步骤是执行单元 |
| 实现 | `subagent-driven-development` vs `executing-plans` | 主用 `subagent-driven-development`；`executing-plans` 不用 | SDD 有每任务规格符合性 + 代码质量两段评审和 fix loop |
| TDD | `tdd`（Matt） vs `test-driven-development`（Superpowers） | 主用 Matt 的 `tdd`；用 Superpowers 的「不写失败测试就不许写代码」当底线 | Matt 有接缝确认和三类反模式；Superpowers 有铁律 |
| 疑难 bug | `diagnosing-bugs` vs `systematic-debugging` | 硬 bug 用 `diagnosing-bugs`；构建/多层链路问题用 `systematic-debugging` | 一个偏反馈回路，一个偏分层排查 |
| 代码评审 | `code-review` vs `requesting/receiving-code-review` | `code-review` 做评审引擎；`requesting/receiving` 做请求与接收协议 | 一个是引擎，一个是流程 |
| 完成验证 | `verification-before-completion` | Superpowers 的 | 没有重复，Matt 没有等价技能 |
| 工作树/收尾 | `using-git-worktrees` / `finishing-a-development-branch` vs 项目槽位 | 用项目自己的槽位/收工门禁（`.dev-flow.json` 的 `slots` / `finishGate`，如有） | 槽位协议更强、项目专用 |
| 安全/测试审计 | `security-audit` / `test-audit` | Matt 的 | Superpowers 没有等价技能 |
| 方案评审 | `plan-review` | 本地技能 | 没有重复 |

## 二、dev-flow 调用矩阵（阶段 → 怎么调）

| 阶段 | 直接调用 | 重定向副本 | 用户执行 |
| --- | --- | --- | --- |
| 需求 | `brainstorming`、`grilling`、`domain-modeling`、`research`、`prototype` | `dev-flow-grill-with-docs`（目标清楚且有草案/计划时的正路；L 强制）、`dev-flow-to-spec`、`dev-flow-to-questionnaire`（如需） | — |
| 设计 | `writing-plans`、`plan-review`、`codebase-design` | `dev-flow-grill-with-docs`（需求/设计交界补漏；设计主技能仍是 `writing-plans` + `plan-review`） | 设计签字 |
| 工单 | — | `dev-flow-to-tickets` | — |
| 实现 | `subagent-driven-development`、`tdd`、`diagnosing-bugs`、`dispatching-parallel-agents` | — | — |
| 完成评审 | `code-review`、`requesting/receiving-code-review`、`verification-before-completion` | — | — |
| 验收 | — | — | 实机验收 |
| 复盘 | `diagnosing-bugs`（如需） | `dev-flow-retro` | 确认升级项 |
| 交接/大雾 | — | `dev-flow-handoff`、`dev-flow-wayfinder` | — |
| Triage（旁路） | — | `dev-flow-triage`（本地 issue/双台账） | 需要时 |

## 三、不使用

| 技能 | 原因 | 替代 |
| --- | --- | --- |
| `implement` | 薄包装：读票→tdd→测试→code-review→commit | `subagent-driven-development` + `tdd` + `code-review` + 按项目规范提交 |
| `implement-spec` | 建集成分支/worktree/合并/PR，与槽位冲突 | SDD 逐票实现 |
| `pr` | 项目不走 PR | 模板吸收进 `acceptance.md`（Summary/Evidence/Merge Danger） |

## 四、组合原则

1. **一个阶段只选一个主技能**，不要同时开两个。
2. **重叠的按分工用**：引擎 vs 协议、定什么 vs 怎么做、工单 vs 步骤。
3. **能合并的合并**：TDD = Matt 的接缝/反模式 + Superpowers 的铁律；调试 = Matt 的反馈回路 + Superpowers 的根因纪律。
4. **锁技能一律走 `dev-flow-*` 副本**，不直接调原技能、不用模板静默顶替。
5. **项目已有更强机制优先**：槽位、发布、门禁、双台账（`.dev-flow.json` 的 `ledger.*`）；没有配置时再按中性默认，不要另起炉灶。
6. **需求入口按清晰度选**：目标不清才 `brainstorming`；目标清楚且有草案/计划走 `dev-flow-grill-with-docs`；方案已定直接定稿，不按默认技能名拍脑袋。

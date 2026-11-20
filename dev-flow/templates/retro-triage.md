# retro 分诊：<功能名>

> 路由收账时逐单读 `evidence/<ticket>-retro.md`，先校验文件头 `SKILL:` 行（缺失＝retro 未完成，要求重做；**不阻塞七行报告收账**），再按三路分诊登记本表。每功能一张，落 `specs/<feature>/retro-triage.md`，批次综合评审时一起看。表头「经验卡」列＝三分类「通用经验卡候选」路的简写。
> 三路去向：**项目级** → 项目 docs / 台账 / 模板 / 测试 / 门禁（改项目规则须用户批）；**dev-flow 级** → 追加到 `docs/issues/retro-candidates.md` 候选收件箱（append-only），由 dev-flow 维护路由评估后开 W 单在本仓实现；**经验卡** → 按项目配置查经验卡索引（`.dev-flow.json` 的 `experience.index` 或项目 AGENTS/文档指针），先查重、跨项目两次独立命中升共享卡（纪律/红线类例外可直接进共享卡组）、真用上写 `卡:卡名`；未配置或 `experience.mode=off` → **跳过共享卡分诊**（正常路径不报错），候选落项目级 `docs/dev-guide/experience.md`，本表经验卡列记「跳过（未配置）」。

| 单号 | retro | 项目级 | dev-flow 级 | 经验卡 | 状态 |
| --- | --- | --- | --- | --- | --- |
| T-XX | `evidence/T-XX-retro.md` | <落点，或 -> | <候选条目/落点，或 -> | <卡名/候选，或 -> | <已分诊 / 待补 retro / 待评估> |

状态说明：`待补 retro`＝文件缺失或缺 `SKILL:` 行（下一轮要求工人补做）；`待评估`＝已登记未定去向；`已分诊`＝三路落点已定（允许某路为 `-`）。

---
name: dev-flow-grill-with-docs
description: "dev-flow 专用重定向副本，不单独调用。需求/设计交界正路：目标清楚、已有草案/计划时，用 grilling + domain-modeling 压测并落盘；术语写入项目 docs/dev-guide/glossary.md，决策写入 docs/design 或 docs/implemented；不建根 GLOSSARY.md 或 docs/adr/。"
---
<!-- dev-flow redirect
upstream: mattpocock/skills @ snapshot-2026-11-07
source: .agents/skills/grill-with-docs/SKILL.md
upstream-sha256: 7de372c13488f1ee96cc11cd8907b56b6809cc93eef776eeddd37de6b6cbe3fe
redirect: write docs/dev-guide/glossary.md + docs/design|docs/implemented; do not create root GLOSSARY.md or docs/adr/
maintainer: dev-flow
synced-at: 2026-11-15
-->

<!-- dev-flow:contract:begin -->
## dev-flow 重定向契约（优先于正文）

本副本只在 dev-flow 流程内由入口技能调用；不单独调用，也不冒充原技能 `grill-with-docs`。

**输出重定向**

- 术语与领域词汇 → 项目现有 `docs/dev-guide/glossary.md`（按既有分节追加；文件不存在时新建**这一个文件**）。路径可由 `.dev-flow.json` 的 `docs.glossary` 覆盖。
- 架构/设计决策（ADR 等价物）→ 项目现有 `docs/design/<主题>.md`；已经落地的设计事实 → `docs/implemented/<主题>.md`。路径可由 `.dev-flow.json` 的 `docs.design` / `docs.implemented` 覆盖。
- 项目没有对应文档目录时：先问用户写到哪个目录；**不得回退**到根 `GLOSSARY.md` 或 `docs/adr/`。

**禁止的副作用**

- 不创建根 `GLOSSARY.md`、`GLOSSARY-MAP.md`、`CONTEXT.md`、`docs/adr/`。
- 不调用任何外部 tracker（`gh`、`glab`、Linear、Jira 等），不打标签、不建 issue。
- 不修改 `AGENTS.md` 或项目规范；流程类改进写入 `specs/<feature>/process-upgrade.md`，由用户批准。

**冲突处理**

正文中任何与本契约冲突的字句，一律以本契约为准，视为已改写。
<!-- dev-flow:contract:end -->

Call the Skill tool twice, for "grilling" and "domain-modeling".

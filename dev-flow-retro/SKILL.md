---
name: dev-flow-retro
description: "dev-flow 专用重定向副本，不单独调用。复盘双模式：单票模式写 specs/<feature>/evidence/<ticket>-retro.md（文件头须含 SKILL: dev-flow-retro）；功能级模式写 specs/<feature>/process-upgrade.md；不直接改 AGENTS、规范或技能。"
---
<!-- dev-flow redirect
upstream: mattpocock/skills @ snapshot-2026-11-07
source: .agents/skills/retro/SKILL.md
upstream-sha256: 33fbc28568e3146f20fd908b12998bc0ab30aa4f4c87288199a40793efa94696
redirect: write specs/<feature>/evidence/<ticket>-retro.md with SKILL: dev-flow-retro (ticket mode) or specs/<feature>/process-upgrade.md (feature mode); do not edit AGENTS/standards/skills without approval
maintainer: dev-flow
synced-at: 2026-11-15
-->

<!-- dev-flow:contract:begin -->
## dev-flow 重定向契约（优先于正文）

本副本只在 dev-flow 流程内由入口技能调用；不单独调用，也不冒充原技能 `retro`。

**两种输出模式（调用方指定；场景是「某张单完工」而未指定时，按单票模式）**

- **单票模式（每单完工复盘）**：复盘写入项目 `specs/<feature>/evidence/<ticket>-retro.md`；文件头必须写一行 `SKILL: dev-flow-retro`（宿主只能读不能调时写 `SKILL: dev-flow-retro(read)`，并在下一行说明原因），无 `SKILL:` 行视为 retro 未完成，路由收账时要求重做（不阻塞七行报告收账）。正文 ≤50 行，按下方复盘维度组织事实与根因，改进建议按三分类：**项目级 / dev-flow 级 / 通用经验卡候选**。
- **功能级模式（验收失败 / 阶段 7 复盘）**：复盘写入项目 `specs/<feature>/process-upgrade.md`，字段：现象、漏在哪个环节、根因、升级项（类型/改什么/负责人/生效时间/验证方式）、重跑计划。

**复盘维度（沿用正文；单票模式正文按此组织）**

导航 / 自动检查 / 编码规范 / 全局 AGENTS / 工具经济 / 无效指令（no-ops）/ 信息获取。

**禁止的副作用**

- **不直接修改** 项目根代理说明（agent guide）、项目规范、技能文件、模板或脚本；所有改进只作为升级项提案（项目级）或分诊候选（dev-flow 级 / 经验卡），由用户批准后另行实施。
- 不调用 `gh`、`glab` 或任何 tracker；不建 issue、不打标签。
- 不自动提交、不推送。

**冲突处理**

正文中任何与本契约冲突的字句，一律以本契约为准，视为已改写。
<!-- dev-flow:contract:end -->

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Call the Skill tool with `writing-for-agents` for the writing style guide.

2. Read the primary sources for the session the user specifies. This may mean searching through session logs on this machine. If the user doesn't specify a session, default to the current one.

3. Look for candidates for improvement in these categories.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own check command first (its `package.json`/build-tool `lint`/`check` scripts, its CI workflow), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint/typecheck/test command) is itself a finding: an un-linted repo is a standing missed opportunity, not a neutral default. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
- **Coding standards**: should the **reviewer agent** be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom rule in the repo's own linter, a new pre-commit hook, or a new CI job, whichever the repo's language and existing guardrail make cheapest. Default to building the check over writing the rule. Reserve `CODING_STANDARDS.md` for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could ever substitute for). _Use when_ the reviewer agent failed to catch a mistake.
- **Global AGENTS.md**: are there any steering instructions that should be moved to coding standards (or automated checks) instead? _Use when_ the AGENTS.md file is particularly large - in the repo OR the user's global scope.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLI's, MCP's) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, readonly access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

4. Present these candidates to the user, in order of severity.

## Reference

### Implementation vs Review

Remember that all work goes through two stages: implementation and review. The implementation agent has the most **context pressure**. They are responsible for exploration, writing code, and debugging failures.

The review agent has the least context pressure - it receives a diff, so no exploration needed. It often does not need to write code or debug.

This means that the review agent should be responsible for imposing coding standards, not the implementation agent.

### Files

You have access to several files in the repo:

- `CLAUDE.md`/`AGENTS.md`: these files are pushed to the context window of any agent working in this repo. They should be used incredibly sparingly, usually only for **navigation pointers** to other files.
- `CODING_STANDARDS.md`: this file is read during review, not implementation. Add **navigation pointers** to docs folders if the standards file gets more than 1,000 lines long.
- Docs: use docs as references files, pointed to by other files. Look for existing docs before writing new ones.
- Skills: use skills for docs (since their description goes into the agent's context window), or for user-invoked commands. Follow the advice in the `writing-for-agents` skill.

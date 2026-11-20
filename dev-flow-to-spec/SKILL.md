---
name: dev-flow-to-spec
description: "dev-flow 专用重定向副本，不单独调用。把当前对话综合成 specs/<feature>/spec.md；不调外部 tracker、不建 issue、不打标签。"
---
<!-- dev-flow redirect
upstream: mattpocock/skills @ snapshot-2026-11-07
source: .agents/skills/to-spec/SKILL.md
upstream-sha256: 43ad9cf318e5e7d3d1fa360253a37021796dc87a0c2e595ad262661a10f85088
redirect: write specs/<feature>/spec.md; no external tracker call, issue, or label
maintainer: dev-flow
synced-at: 2026-11-15
-->

<!-- dev-flow:contract:begin -->
## dev-flow 重定向契约（优先于正文）

本副本只在 dev-flow 流程内由入口技能调用；不单独调用，也不冒充原技能 `to-spec`。

**输出位置**

- 规格只写入项目 `specs/<feature>/spec.md`（`<feature>` 为 kebab-case 功能名，由 dev-flow 状态确定；缺失时先问用户）。
- 目录不存在时创建 `specs/<feature>/`；**不写当前目录根**，也不写 `.scratch/`。

**禁止的副作用**

- 不调用任何外部 issue tracker 命令（GitHub、GitLab、Jira 等 CLI）；不创建 issue、不打 `ready-for-agent` 等标签、不建 PR。
- 不修改 `setup-matt-pocock-skills` 的配置，也不需要 tracker 配置。

**格式要求**

- 正文模板保留，但必须补齐 dev-flow 规范要求的三段：**为什么做 / 成功指标（可观察）/ 非目标**（设计条目 7.1）。
- **M/L 必须含「澄清记录」小节**：`## 澄清记录`，写清 `方式：brainstorming | dev-flow-grill-with-docs | direct`、关键决策、未决项；S 档可省略。
- **L 档方式必须是 `dev-flow-grill-with-docs`**；否则 `issue-audit` 从 tickets 起拒收。M 档缺记录至少告警。
- 字段模板以 `~/.zcode/skills/dev-flow/templates/spec.md` 为准（Phase C 落地；未落地前按上述三段 + 澄清记录自检）。
- 使用项目词汇表 `docs/dev-guide/glossary.md` 的术语，尊重 `docs/design`/`docs/implemented` 中的既有决策。

**冲突处理**

正文中任何与本契约冲突的字句，一律以本契约为准，视为已改写。
<!-- dev-flow:contract:end -->

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>

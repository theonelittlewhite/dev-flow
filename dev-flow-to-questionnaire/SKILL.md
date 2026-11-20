---
name: dev-flow-to-questionnaire
description: "dev-flow 专用重定向副本，不单独调用。把需要别人回答的问题写成 specs/<feature>/questionnaire.md，不写当前目录。"
---
<!-- dev-flow redirect
upstream: mattpocock/skills @ snapshot-2026-11-07
source: .agents/skills/to-questionnaire/SKILL.md
upstream-sha256: b5eb929842ee0e93d867c5e906d183d350f2f2d149eaeaa86967d94d8eda1d3b
redirect: write specs/<feature>/questionnaire.md; do not write current directory
maintainer: dev-flow
synced-at: 2026-11-15
-->

<!-- dev-flow:contract:begin -->
## dev-flow 重定向契约（优先于正文）

本副本只在 dev-flow 流程内由入口技能调用；不单独调用，也不冒充原技能 `to-questionnaire`。

**输出位置**

- 问卷写入项目 `specs/<feature>/questionnaire.md`；同一功能多份问卷用 `questionnaire-<slug>.md`。
- 目录不存在时创建 `specs/<feature>/`。**不写当前工作目录**，不写系统临时目录。

**禁止的副作用**

- 不调用 `gh`、`glab` 或任何 tracker；不建 issue、不打标签。
- 不修改 `AGENTS.md` 或项目规范。

**冲突处理**

正文中任何与本契约冲突的字句，一律以本契约为准，视为已改写。
<!-- dev-flow:contract:end -->

Turn something the user can't answer alone into a **questionnaire**: a Markdown document they hand to one person to fill in async, or fill out together over a meeting. The recipient holds knowledge the user lacks; the questionnaire pulls it out of them.

**Grill the send, not the subject.** Interview the user only about the _send_, which they can always answer: who it goes to, and what they need back. The questions in the document then target the **gap** between what the recipient knows and what the user needs.


1. **Who is it going to?** Ask, in one exchange, the recipient's role, expertise, and relationship to the user. This fixes the questionnaire's tone and how much context it must carry. Done when you know who the recipient is and what they know that the user doesn't.

2. **What do you need back?** Ask, in one exchange, the specific decisions or facts the user can't resolve alone and needs from this person. Done when you have a concrete list of what the user must walk away able to do or decide.

3. **Write the questionnaire.** Draft questions aimed at the gap from steps 1–2, following the Document structure below. Write it to `to-questionnaire-<slug>.md` in the current directory (slug from the topic) and report the path. Done when the file exists and every item the user named in step 2 is covered by a question.

## Document structure

Frame the document as a **discovery questionnaire**: the user lacks context, the recipient holds it. Order questions most-important-first, since async means you may only get one pass, and group them under `##` headings by theme once there are more than a handful. Write it using the template below.

<questionnaire-template>

# <Questionnaire title>

**Purpose:** why this questionnaire exists and the decision riding on it.

**From:** <the user>, **To:** <the recipient>, **How your answers will be used:** <where they go>

## Context

One paragraph orienting a recipient who wasn't in the user's head. Enough to answer well, not a page.

## How to answer

Deadline and rough effort. Partial answers and "I don't know" are useful: flag anything you're unsure of rather than skipping it.

## <Theme heading>

One `##` section per theme. Under each, its questions, most-important-first. Every question is one idea, never compound, with an answer stub directly beneath, and a one-line _why this matters_ only where the question could be misread or invite a throwaway answer.

<question-example>
### What load is the system expected to handle at launch?

_Why this matters: it decides whether we provision for burst traffic now or defer it._

>
</question-example>

## Anything else?

A closing catch-all: anything we didn't ask that we should know?

</questionnaire-template>

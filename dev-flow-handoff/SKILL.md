---
name: dev-flow-handoff
description: "dev-flow 专用重定向副本，不单独调用。把当前会话压缩成 specs/<feature>/handoff.md，不写系统临时目录。"
---
<!-- dev-flow redirect
upstream: mattpocock/skills @ snapshot-2026-11-07
source: .agents/skills/handoff/SKILL.md
upstream-sha256: 4cbb043950dad2ffd3662ff1a5a0b51ae676004b5cae10e3787e8ee7a4ee69d3
redirect: write specs/<feature>/handoff.md; do not write $TMPDIR/%TEMP%
maintainer: dev-flow
synced-at: 2026-11-15
-->

<!-- dev-flow:contract:begin -->
## dev-flow 重定向契约（优先于正文）

本副本只在 dev-flow 流程内由入口技能调用；不单独调用，也不冒充原技能 `handoff`。

**输出位置**

- 交接文档写入项目 `specs/<feature>/handoff.md`。
- **不写系统临时目录**（`$TMPDIR`、`/tmp`、`%TEMP%`），不写当前工作目录根。

**内容要求**

- 必须包含：做到哪、下一步、卡在哪、建议下一个 agent 调用的技能、需要用户做的事。
- 其他工件（spec/design/issues/evidence/提交）用路径或命令引用，不复制正文。
- 脱敏：不写密钥、口令、个人身份信息。

**冲突处理**

正文中任何与本契约冲突的字句，一律以本契约为准，视为已改写。
<!-- dev-flow:contract:end -->

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows) - not the current workspace.

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

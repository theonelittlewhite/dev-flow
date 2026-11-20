# 锁技能：为什么锁、dev-flow 怎么处理（8 副本策略）

## 什么是锁

技能文件 frontmatter 里有一行：

```yaml
disable-model-invocation: true
```

意思是：**模型不能自动调用这个技能，只能由用户显式输入 `/技能名` 触发。** 没有这行的技能，模型可以在合适的时候自己调用。

## 作者为什么锁

| 原因 | 例子 |
| --- | --- |
| 有副作用 | `to-spec` 会发布到 issue tracker；`to-tickets` 会建工单；`wayfinder` 会推分支 |
| 需要用户在场做决策 | `grill-with-docs`、`to-questionnaire`、`triage` |
| 会写文档/改仓库 | `retro`、`handoff` |

锁不是技术限制，是**作者给用户的保险丝**。

## dev-flow v2 的处理策略

1. **能组合原语的直接组合**：如 `grill-me` 无副作用，直接调 `grilling`。
2. **可安全重定向的做 `dev-flow-*` 副本（8 个必需）**：复制原技能正文，只改「输出目的地/外部调用」段；副本**不带锁**，可被 dev-flow 调用；不单独调用。
3. **不安全解锁的不用**：`implement`/`implement-spec` 不使用（见 `skill-map.md` 三）。
4. **绝不静默替代**：副本缺失、门禁不满足、输出路径不可写 → 停，提示用户。不允许用「差不多」的模板冒充原技能；如果用了模板，必须标明「dev-flow 模板，不是原技能」。

## 8 个副本一张表

| 副本 | 原技能 | 输出目标 | 去掉的副作用 |
| --- | --- | --- | --- |
| `dev-flow-grill-with-docs` | `grill-with-docs` | 项目 `docs/dev-guide/glossary.md` + `docs/design`/`docs/implemented` | 不建根 `GLOSSARY.md`/`docs/adr/` |
| `dev-flow-to-spec` | `to-spec` | `specs/<feature>/spec.md` | 不调 `gh`/`glab`、不建 tracker issue、不打标签 |
| `dev-flow-to-tickets` | `to-tickets` | `specs/<feature>/issues/T-XX.md` + `tasks.md` | 不调 tracker、不建 blocking 链接 |
| `dev-flow-to-questionnaire` | `to-questionnaire` | `specs/<feature>/questionnaire.md` | 不写当前目录 |
| `dev-flow-handoff` | `handoff` | `specs/<feature>/handoff.md` | 不写系统临时目录 |
| `dev-flow-retro` | `retro` | `specs/<feature>/process-upgrade.md` | 不直接改 AGENTS/规范/技能；改流程需用户批 |
| `dev-flow-wayfinder` | `wayfinder` | `specs/<feature>/wayfinder/map.md` + `issues/W-XX.md` | 不建 tracker、不推分支 |
| `dev-flow-triage` | `triage` | 本地 issue/双台账（台账命令取 `.dev-flow.json` 的 `ledger.*`） | 不调外部 tracker |

每个副本头部有 `<!-- dev-flow redirect ... -->` 注释：原技能名、上游版本、改写点、维护人。

> `dev-flow-setup` 是安装/环境技能，不是第 9 个重定向副本；`sync-check` 已将它排除在副本发现之外。

## 副本维护（能力账 + 同步检查）

副本会随上游漂移，必须可见、可维护：

维护工具在**源码仓**的 `dev-flow/IMPLEMENTATION/` 下；`install.mjs` 只装运行文件，不会把这一目录装进 `~/.zcode/skills`。

- **能力账**：`dev-flow/IMPLEMENTATION/capability-ledger.md`，8 行：副本/原技能/上游版本（SHA 前缀）/改写点/最后同步/维护人。
- **同步检查**：在源码仓运行 `node dev-flow/IMPLEMENTATION/scripts/sync-check.mjs --strict --upstream-root vendor/upstream`，读每个副本头部 upstream 版本，提示「需要人工比对」；不自动覆盖。
- **diff 白名单**：在源码仓运行 `node dev-flow/IMPLEMENTATION/tests/copy-diff.mjs --upstream-root vendor/upstream`，校验副本与上游只允许「输出路径/外部调用」段落不同。
- **上游更新时**：先 diff，再决定是否合并；不要盲目覆盖副本。重建副本用 `node dev-flow/IMPLEMENTATION/scripts/build-copies.mjs --force --upstream-root vendor/upstream`（契约源在 `IMPLEMENTATION/redirects/`）。

## 副作用总表

| 技能 | 副作用 | 重定向后 |
| --- | --- | --- |
| `grill-me` | 无 | 直接调 `grilling` |
| `handoff` | 写系统临时目录 | `specs/<feature>/handoff.md` |
| `to-questionnaire` | 写当前目录 | `specs/<feature>/questionnaire.md` |
| `retro` | 建议改流程文件 | `process-upgrade.md`；改流程需用户批 |
| `grill-with-docs` | 写根 glossary/ADR | 项目现有 glossary/设计文档 |
| `to-spec` | 写 tracker | `specs/<feature>/spec.md` |
| `to-tickets` | 写 tracker | `issues/*.md` + `tasks.md` |
| `wayfinder` | 写 tracker + 推分支 | 本地 `wayfinder/` |
| `triage` | 改外部 issue | 本地 issue/双台账 |
| `implement` | 改代码/commit | 不使用 |
| `implement-spec` | 分支/worktree/合并/PR | 不使用 |

## 一句话

**不要为了自动化而解开保险丝。** 副本是「原技能的手艺 + 无副作用」；用副本、记账、定期比对；副本管不了的就摆到用户面前。

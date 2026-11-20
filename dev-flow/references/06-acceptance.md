# 06 验收阶段（你参与）

## 目标

把功能交到用户手上，让用户在实机上按步骤验收。通过就结束；不通过就进复盘。

## 输入

- 已通过完成评审的代码
- `spec.md` 的 AC 与成功指标
- `review-final.md` 的已知限制
- 测试/证据

## 产出验收包（吸收 `pr` 模板）

AI 写 `specs/<feature>/acceptance.md`，用 `templates/acceptance.md`，至少包含：

```md
# 验收：<功能名>

## Summary
<最小视图：改了什么；必要时用 diff/树/调用树>

## Evidence
Before: <截图/失败测试/旧行为>
After: <截图/通过测试/新行为>

## Merge Danger
Door: one-way / two-way
Blast Radius: <影响面：哪些模块/旧功能受牵连>

## 怎么验
1. <打开什么>
2. <点什么/跑什么>
3. <期望看到什么>
4. <再点/再跑什么>
5. <期望看到什么>

## 测试数据
<用哪个工程/文件；没有就写「任意工程」>

## 已知限制
<本期不做什么；什么问题已知>

## 失败时请发回
<操作步骤、截图、日志路径、错误提示原文>
```

## 验收步骤怎么写

- **可操作**：用户知道点哪里、输入什么。
- **可观察**：每一步有明确的期望结果（数量、文字、文件、界面）。
- **覆盖 AC**：每条 AC 至少一步；成功指标要能对着看。
- **包含异常**：空数据、错误输入、取消操作至少一条。
- **包含回归**：同类旧功能至少点一次。
- **不写内部术语**：不写 FR 编号、store、IPC、traceability；用户看不懂。

## 门禁

- **验收机检（硬拦）**：`node <技能目录>/scripts/issue-audit.mjs --root <项目根> --feature <name> --phase acceptance` 退出码必须为 0——全部工单 `done/cancelled`、所有本地 AC 行 `done`、`acceptance.md` 存在且非空，且状态同步/设计决策落点/豁免签名全绿。红即不进实机验收。
- 用户明确回复「验收通过」。
- 更新状态：`gates.userAccepted=true`，`stage=done`，`status=done`。
- 如果用户不通过：记录具体现象，`stage=retro`。
- 项目若把 dev-flow 接到发布脚本，建议在发布前置调用 `--phase release`（在 acceptance 基础上再要求 `state.json` 的 `stage=done` 且 `gates.userAccepted=true`）——本技能不执行发布，只提供机检入口。

## DoD 文档清单（收工检查）

交付前逐项过，缺一项不算 done（S 档可豁免文档类；项目配置了 `changelog.mode` 时 changelog 必须有）：

- [ ] changelog 条目（用户能看懂的大白话；`changelog.mode=none` 时本项跳过）
- [ ] 用户文档/插件文档（如涉及）
- [ ] 设计文档更新（如设计有变更）
- [ ] 回滚说明
- [ ] 追溯矩阵完整（每条 AC 有工单+证据）
- [ ] 评审报告/证据（`review-final.md` + `evidence/`）
- [ ] 验收包（`acceptance.md`）
- [ ] TaskChron 已同步（`taskchron.mode` 为 `on`/`auto` 且 MCP 可用时；否则清单里写「时记未同步」）

## 验收结果

写 `specs/<feature>/acceptance-result.md`：

```md
# 验收结果

- 结论：通过 / 不通过
- 时间：...
- 通过项：...
- 失败项：<现象、步骤、期望 vs 实际、截图/日志>
- 用户原话：...
```

## 常见错误

| 错误 | 后果 | 纠正 |
| --- | --- | --- |
| 验收步骤写「测试导出功能」 | 用户不知道怎么点 | 写具体菜单/按钮/文件 |
| 只写正常路径 | 异常没验 | 加空数据/取消/错误输入 |
| 不写已知限制 | 用户以为坏了 | 明确本期不做什么 |
| 失败只写「不行」 | 无法定位 | 记录步骤/期望/实际/日志 |
| 没验收就说完成 | 问题漏到用户 | 门禁卡住 |
| 代码绿了文档没动 | 下个人接手两眼一黑 | DoD 文档清单逐项过 |

## 下一步

- 通过 → 结束，更新状态 `done`；`taskchron.mode` 允许时补 TaskChron 同步。
- 不通过 → `references/07-retro.md`

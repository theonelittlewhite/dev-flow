# 02 设计阶段

## 目标

把「怎么建」定下来，让实现者不需要猜。产出 `design.md`，由用户审并签字。**这是实现前唯一的人工闸门。**

## 输入

- `spec.md`（为什么/成功指标/非目标、AC、NFR、M/L 澄清记录）
- 现有代码/架构/接口
- 项目架构约束（依赖方向、模块边界、槽位/门禁）
- 相关 ADR/设计文档
- 其他进行中功能的 `specs/*/state.json`（多功能协调用）

## 用哪个技能

| 情况 | 技能 | 说明 |
| --- | --- | --- |
| 主技能 | `writing-plans` | 精确文件、接口 consumes/produces、2-5 分钟步骤、无占位、self-review |
| 方案自检/评审 | `plan-review` | 多视角（范围/设计/工程）挑漏洞；本地技能 |
| 架构形状拿不准 | `codebase-design` | 深模块/接口/接缝词汇 |
| 需求/设计交界正路 | `dev-flow-grill-with-docs` | 目标清楚、已有草案/计划时，应在需求阶段先走副本压测并落盘；设计阶段主技能仍是 `writing-plans` + `plan-review`，不重复拷问 |
| 现有代码太乱影响本次 | `improve-codebase-architecture` | 先做必要预重构，单独成单 |
| L 档安全触发 | `security-audit` | 触及信任边界/权限/数据迁移/删除时强制（见下） |

**设计阶段不重复需求拷问**：澄清应在需求阶段完成（见 `01-requirements.md` 的清晰度分流）。若设计时才发现术语/ADR 缺失，可补跑 `dev-flow-grill-with-docs`，并在 `spec.md` 澄清记录补记。

## 步骤

1. **复述设计目标**：一句话说清「这次改哪些模块、新增什么接口、不动什么」。
2. **多功能协调字段**：在 `design.md`（并回填 `state.json`）写清：
   - `affectedModules`：动到哪些模块；
   - `dependsOnFeatures`：依赖哪些其他功能；
   - `conflictsWith`：与哪些进行中功能可能冲突。
   - **L 档启动前**扫描 `specs/*/state.json`：模块重叠且都未完成 → 提示用户排序/协调；不自动改优先级。
3. **画接口**：每个新增/修改的模块写：
   - 输入（consumes）
   - 输出（produces）
   - 错误/异常
   - 谁调用它
   - **能力变更（触及则必列，硬项）**：新增窗口/进程/权限/数据路径、新增插件调用、修改 capability/permission manifest 时，列出能力变更清单——目标窗口/进程 × capability/permission 文件 × 所需权限（Tauri `src-tauri/capabilities/*.json`、Capacitor 插件配置、Electron preload allowlist），并给测试接缝（真实窗口标签 + 真实能力集，见 `references/11-testing.md` 真实上下文测试）。**跨窗口/跨进程新增数据访问、新增插件权限、修改 capability/permission manifest 属高风险**——评审 ≥2 路交叉或加 `security-audit`，不按普通 M 档 1 路放行（见 04 评审铁律能力面变更硬性升档）。
4. **画数据流**：从用户操作到落盘/返回，标出每一层（UI → store → IPC → Rust/Python → 文件）。
5. **列 NFR（六条，逐条过）**：
   - 性能：数据量、时限、内存；
   - 安全/隐私：信任边界、权限、日志脱敏；
   - 兼容：旧工程、旧格式、插件、旧版本；
   - 迁移：数据结构/配置变更、回滚；
   - 失败模式：空数据、大数据、取消、权限、离线；
   - 可观测：日志/错误码/用户提示。
6. **安全触发判定**：设计触及信任边界/权限/数据迁移/删除 → L 档另加强制 `security-audit`，结论写入设计。
7. **给备选**：至少一个备选方案 + 为什么不选。
8. **写回滚**：出问题怎么撤（开关/回退入口/版本回退）。
9. **自检**：每条 AC 在设计里有没有落点？每个落点有没有验证方式？
10. **用户审**：把设计用大白话讲给用户，等「设计通过」。
11. **更新状态**：`gates.designApproved=true`，`stage=tickets`。

## 产出

`specs/<feature>/design.md`，至少包含：

- 目标/非目标（引用 spec）
- `affectedModules` / `dependsOnFeatures` / `conflictsWith`
- 模块与接口（consumes/produces）
- 数据流
- 失败模式与处理
- NFR 六条（性能/安全隐私/兼容/迁移/失败模式/可观测）
- 安全评审结论（L 档安全触发时）
- 备选方案与取舍
- 回滚方案
- 每条 AC 的实现落点
- 能力变更清单与测试接缝（触及能力面时：目标窗口/进程 × capability/permission 文件 × 所需权限；未触及写「无能力面变更」）
- 测试接缝（在哪些公共接口测）

## 门禁

- 用户明确回复「设计通过」或等效确认。
- **M/L 的 `spec.md` 缺「澄清记录」，或 L 档方式不是 `dev-flow-grill-with-docs` → 不许进入工单阶段**（`issue-audit` 从 tickets 起硬拦；M 缺记录至少告警）。
- 如果用户说「你看着办」，记录为「设计未签字」，不许进入工单阶段（L 档必须签字；M 档可简化为一段话确认；S 档可跳过）。
- 设计里出现 `[NEEDS CLARIFICATION]` 未清零，不许开工。
- L 档安全触发而未跑 `security-audit`，不许进入工单阶段。
- 设计触及能力面（新增窗口/进程/插件权限/跨窗数据访问/修改 capability·permission manifest）而未列「能力变更清单与测试接缝」→ 不许进入工单阶段；未触及须在设计里显式写「无能力面变更」。

## 常见错误

| 错误 | 后果 | 纠正 |
| --- | --- | --- |
| 只写「新增导出模块」 | 实现者不知道接口 | 写 consumes/produces/错误/调用方 |
| 不写失败模式 | 空数据/写盘失败没处理 | 至少列 5 条失败路径 |
| NFR 只写性能一条 | 大文件卡死/旧数据打不开/编码错 | 六条逐条过，写「不适用」也要写 |
| 不写回滚 | 出问题只能硬改 | 写开关/回退入口 |
| 多功能并行改同一模块 | 互相覆盖/合并冲突 | 协调字段 + L 档扫描重叠 |
| 用户没签字就开工 | 跑偏没人负责 | 门禁卡住 |
| 需求没澄清记录就进设计 | 设计审替需求补课、返工 | 回需求补澄清记录（L 必须走 `dev-flow-grill-with-docs`） |

## 下一步

`references/03-tickets.md`

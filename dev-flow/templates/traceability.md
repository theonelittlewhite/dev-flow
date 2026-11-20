# <功能名> 追溯矩阵

> 规则：每条 AC 至少一个工单、一个测试/证据；缺一标 `BLOCKED`，不许开工。完成时证据必须是可打开的路径或可复现命令。

| AC | 需求摘要 | 工单 | 测试/证据 | 状态 |
| --- | --- | --- | --- | --- |
| AC-1 | ... | T-01 | `evidence/AC-1.txt` / `<项目验证命令>` | planned |
| AC-2 | ... | T-01、T-02 | ... | planned |
| AC-3 | ... | T-02 | ... | planned |

状态只允许：`planned | in-progress | done | blocked`。

## 设计决策映射（销单机检强制对账源）

> **硬门禁**：工单「覆盖：」行声称的每个 D-ID 都必须在本节有一行落点（决策正本 / 兑现工单 / 证据至少一项，缺一即红）；漏节、漏行、映射行只有 `planned` 而工单已 done，均由 `scripts/issue-audit.mjs` 判红。未兑现的决策走 `design-deviation.md` 登记（唯一例外通道）。决策 ID 用裸格式（`D60`，勿写 `D-60`；`D03` 与 `D3` 等价）。

| 决策 ID | 内容摘要 | 决策正本（design.md 锚点） | 兑现工单 | 证据/状态 |
| --- | --- | --- | --- | --- |
| D60 | ... | `design.md#D60` | T-08 | done（`evidence/D60.txt`） |
| D37 | ... | `design.md#D37` | — | planned（E4 后续批） |

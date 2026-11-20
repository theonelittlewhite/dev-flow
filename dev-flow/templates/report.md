# 回传报告块模板（工人 → 路由）

> **唯一回传通道 = evidence 落盘并提交**：完工后把七行报告块写入 `specs/<feature>/evidence/<ticket>-report.md` **头部**（只写一次，不发进度）并提交。**不调用 `SendToSession`，不做「尽力尝试」**——`SendToSession` 只用于路由→正在运行的工人发命令/提醒/补丁，不用于工人完工报告。
> 报告文件 = 七行块在头部 + 详版（**≤150 行**）接在块后：详版只放结论/证据/命令输出，不贴大段代码；diff 用 `git diff --stat`（评审子代理仍按 04 拿完整 diff）；单票跑工单定义的定向验证命令（命令本身是全量则照跑），全量套件批末跑一次。
> **落盘的报告块不要套代码围栏（```）**：`report-ledger.mjs` 机检按行识别七键，围栏内的行会被当示例忽略（围栏防误收只用于协议手册里的样例块）。
> `EVIDENCE` 行填本报告文件自身路径；`ASK` 行仅 `RESULT: NEED-DECISION` 时填，一行一个问题；其余状态写 `-`。

```
RESULT: DONE | NEED-DECISION | FAILED
TICKET: T-XX
COMMITS: <sha…>（多个用逗号分隔；未提交写 - 并说明）
TESTS: <n> passed（基线 <m>，零回归/回归）
EVIDENCE: <详版报告文件路径，或 - >
REVIEW: <n 个评审子代理>，必须修 <k> 条（处置：<已修 落点…/误报 理由…/延后 台账号…>）
ASK: <NEED-DECISION 时一行问题；否则 ->
```

规则回顾（详见 `references/09-conductor.md` §3）：

- 唯一通道：evidence 落盘并提交是**正路**（原「手递降级」已转正，2026-11-20 W-04 统一改版）；不再尝试 `SendToSession`，报告没落盘才算失败，不因消息发送失败记工人失职。
- **retro 独立成文件**：完工复盘是单独的 `evidence/<ticket>-retro.md`（先调 `dev-flow-retro` 单票模式，文件头 `SKILL:` 行，模板 `templates/ticket-retro.md`），与七行报告块同批提交；**七行块格式、七键与收账语义不变**，`report-ledger.mjs` 不读 retro；缺 retro 或缺 `SKILL:` 行不阻塞七行报告收账，路由按 09 §4 要求补做并三路分诊。
- 重复投递：同一工人重写报告文件/多次投递，路由只取**最后一份完整报告块**；`report-ledger.mjs` 按提交号幂等去重，重复只记一次 duplicate。
- 进度不转发：路由只转 `NEED-DECISION` 与收账一行给用户。
- 报告落 evidence 后由监视器唤醒路由收账（后台 `scripts/watch-reports.mjs` 盯 evidence，新报告稳定即唤醒）；路由每轮开头仍主动扫 evidence 兜底——监视器 + 每轮开头扫，双保险（机器休眠/监视器漏跑也不丢报告）。

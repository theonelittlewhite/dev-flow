# 派工令 T-XX：<标题>

> 路由生成，工人读它开工。六字段缺一不开工：先跑 `node <dev-flow>/scripts/check-order.mjs <本文件>`，退出码 0 才算派发成功。
> 本单评审执行者与方式按 04-implement 评审铁律的风险档填写（高风险：≥2 评审子代理交叉；M 档：1 路子代理 + 机器门禁，本批有批级评审时批级评审充当第二视角（批末补强，不阻塞单票销单）；S 档：自检 + 验收说明）。B 形态叠加：工人按风险档自审 +（有独立检查员会话→检查员对标 / 无→调度抽检），两者不是二选一。
> 派工指针化：本文件即简报全文；CreateSession 的 prompt 只放本文件路径 + 本批差异项（≤500 字），不重复贴全文。
> 报告落 evidence 后由监视器唤醒路由收账（后台 `scripts/watch-reports.mjs` 盯 `specs/<feature>/evidence/*.md`，新报告稳定即唤醒）；监视器只缩短延迟、不是唯一通道——路由每轮开头仍须主动扫 evidence 兜底，监视器 + 每轮开头扫，双保险。
> 工人完工**不调用 `SendToSession`**：它只用于路由→正在运行的工人发命令/提醒/补丁，不是工人回传通道——回传唯一通道是 evidence 落盘并提交（见第 6 字段与 `templates/report.md`）。

**单号**：T-XX（对应 `issues/T-XX.md` 契约全文，冲突以工单为准并回改本令）
**目标与验收**：<端到端行为 + 可机检的完成判据（测试/门禁/清单），如「<项目验证命令> 绿；<项目验收命令> N 项全过」>
**文件地盘**：
- 允许：<路径清单>
- 禁入：<共享文件 / 并行工人地盘 / 旧线 specs/*/ / 版本冻结文件>
- 关联只读检查：<capability/manifest/权限配置文件路径（即使禁改也要列出，供评审「能力影响」行核对）；无则写「无需变更（理由）」>
**基线 + 验证命令**：<当前测试基线数 N；run-low 命令原文；gate:remote 定向轮用法>
**模型 + 槽位**：<模型完整 ID，按项目 `.dev-flow.json` 的 `models` 对应槽位取（该槽位未配置 → 停下问用户，不静默用默认）；槽位号 slot-N（禁占他人槽）>
**认领回报**：`wt:claim` 成功后**第一时间**回报槽位号（`S<N>`）给路由（供会话改名/台账登记，未回报时路由以 `wt:status` 为准）；会话名同步改为 `S<槽位号>-<主题>`（≤12 字），工人无会话工具时由路由代改。
**回传格式 + 截止**：<按 templates/report.md 七行报告块（详版 ≤150 行，不贴大段代码），完工即写入 `specs/<feature>/evidence/<ticket>-report.md` 头部并提交——唯一回传通道，不调用 `SendToSession`；完工后同批另写 `specs/<feature>/evidence/<ticket>-retro.md`（先调 `dev-flow-retro` 单票模式，文件头须含 `SKILL: dev-flow-retro` 行，模板 `templates/ticket-retro.md`）；截止 YYYY-MM-DD HH:MM，报告未落盘提交视为失联按升级条件处理>

## 收尾检查

- [ ] 完工后**立即**把七行报告块写入 `specs/<feature>/evidence/<ticket>-report.md` 头部并提交（唯一回传通道；不调用 `SendToSession`，不做「尽力尝试」）。
- [ ] 同批写 `specs/<feature>/evidence/<ticket>-retro.md`（**先调 `dev-flow-retro`** 单票模式，文件头 `SKILL: dev-flow-retro` 行；模板 `templates/ticket-retro.md`），并提交。
- [ ] 开工初期与收尾前各读一次会话消息：关键裁决可能以会话消息形式到达（路由→工人方向），不能只看工单文件；工人完工不走消息回传。

## 附注（可选）

<背景链接、设计稿路径、用户特别指示等；不算六字段，缺了不拦>

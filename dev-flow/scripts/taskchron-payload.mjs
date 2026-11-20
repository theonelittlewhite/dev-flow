#!/usr/bin/env node
/**
 * dev-flow → TaskChron 同步载荷生成器（只读，单向）。
 *
 * Usage:
 *   node taskchron-payload.mjs --feature <id> [--root <project-root>] [--json]
 *
 * 读 specs/<feature>/state.json，输出父任务 + 6 里程碑的同步载荷：
 *   - 父任务：标题/备注（specs 路径放第一行）
 *   - 里程碑：标题、五要素（截止如有/预估如知/三句人话备注/specs 路径）、
 *     gate 是否已翻绿（翻绿的建议 create 后即 set_task_status done + completed_at）
 *
 * 红线：只读 state.json，不写任何文件，不调 MCP（模型拿载荷去调）。
 * 降级：MCP 不可达时本脚本仍可跑（生成本地载荷），恢复后补同步。
 *
 * Exit codes: 0 ok, 1 no state, 2 invalid.
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = { feature: null, root: process.cwd(), json: true, human: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--feature') out.feature = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--human') { out.human = true; out.json = false; }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node taskchron-payload.mjs --feature <id> [--root <root>] [--human]');
      process.exit(0);
    }
  }
  return out;
}

const MILESTONES = [
  {
    key: 'specDone', title: '需求确认', gate: null, fileCond: s => s.artifacts?.spec,
    note: ['聊清需求并产出 spec.md', '第一节固定：为什么做/成功指标/非目标', 'AC 可执行（EARS）'],
  },
  {
    key: 'designApproved', title: '设计签字', gate: 'designApproved',
    note: ['design.md 完成（NFR 六条+协调字段）', '用户确认接口/失败模式/回滚', '设计签字门禁翻绿'],
  },
  {
    key: 'ticketsReviewed', title: '工单审核', gate: 'ticketsReviewed',
    note: ['dev-flow-to-tickets 拆单到 issues/T-XX.md', '3 路审核 + 裁判无必须修', '追溯矩阵无 BLOCKED'],
  },
  {
    key: 'devDone', title: '开发完成', gate: null, stageCond: s => ['final-review', 'acceptance', 'retro', 'done'].includes(s.stage),
    note: ['按工单逐节点实现', '每节点对标工单+设计', '验证命令绿、证据入 evidence/'],
  },
  {
    key: 'finalReviewed', title: '评审通过', gate: 'finalReviewed',
    note: ['完成 3 路评审 + 裁判', '必须修清零、连续两轮无新增', '校准记录在案'],
  },
  {
    key: 'userAccepted', title: '验收通过', gate: 'userAccepted',
    note: ['用户按 acceptance.md 实机验收', 'Summary/Evidence/Merge Danger 齐全', '验收结论写入 acceptance-result.md'],
  },
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feature) {
    console.error('必须提供 --feature <id>');
    process.exit(2);
  }
  const root = path.resolve(args.root);
  const statePath = path.join(root, 'specs', args.feature, 'state.json');
  if (!fs.existsSync(statePath)) {
    console.error(`找不到状态文件：${statePath}`);
    process.exit(1);
  }
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    console.error(`状态文件不是合法 JSON：${e.message}；先跑 flow-set 重建。`);
    process.exit(2);
  }

  const specsPath = `specs/${state.feature}/`;
  const gates = state.gates || {};
  const milestones = MILESTONES.map(m => {
    let done = false;
    if (m.gate) done = gates[m.gate] === true;
    else if (m.stageCond) done = m.stageCond(state);
    else if (m.fileCond) done = Boolean(m.fileCond(state)) && fs.existsSync(path.join(root, m.fileCond(state)));
    return {
      title: `${state.title || state.feature}｜${m.title}`,
      done,
      create: {
        title: `${state.title || state.feature}｜${m.title}`,
        remark: [`${specsPath}`, ...m.note].join('\n'),
        tags: ['dev-flow'],
      },
      onDone: done ? { set_task_status: 'done', completed_at_hint: '用 gate 翻绿时间（history 里最近的对应记录），未知则创建时刻' } : null,
    };
  });

  const payload = {
    direction: 'dev-flow -> TaskChron（单向；TaskChron 不反向改 specs）',
    parent: {
      title: `【${state.tier || 'M'}】${state.title || state.feature}`,
      remark: [specsPath, `风险档：${state.tier || 'M'}`, `当前阶段：${state.stage}`, '本任务为 dev-flow 驾驶舱镜像，执行真相在 specs/ 目录'].join('\n'),
      tags: ['dev-flow'],
    },
    milestones,
    degrade: 'MCP 不可达 → 跳过并声明；恢复后用本载荷补同步',
    generatedAt: new Date().toISOString(),
  };

  if (args.human) {
    console.log(`父任务：${payload.parent.title}`);
    console.log(`备注首行：${specsPath}`);
    for (const m of milestones) console.log(`- ${m.title}：${m.done ? '已达成（建议打卡 done）' : '未达成（create 后待翻绿）'}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

main();

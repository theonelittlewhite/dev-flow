#!/usr/bin/env node
/**
 * dev-flow set v2: create/update specs/<feature>/state.json safely.
 *
 * Usage:
 *   node flow-set.mjs --feature <id> [--title <t>] [--tier S|M|L]
 *     [--stage <stage>] [--status <status>] [--next <text>] [--ticket <id>]
 *     [--gate designApproved=true] [--affected a,b] [--depends a,b]
 *     [--note <text>] [--root <project-root>] [--force]
 *
 * v2 行为：
 *   - 新建状态为 version 2（含 issues 工件、affectedModules/dependsOnFeatures）；
 *   - 门禁强制：进 tickets 需 designApproved、进 implement 需 ticketsReviewed、
 *     进 acceptance 需 finalReviewed、进 done 需 userAccepted（--force 可越过，慎用）；
 *   - 回退限制：主线只允许回 design/tickets；retro 可回 requirements 补 AC；
 *   - 损坏 JSON：自动重建 v2 最小状态并在 history 记录；
 *   - v1 状态：原地升级 v2（补字段，不动已有值）。
 */
import fs from 'node:fs';
import path from 'node:path';

const STAGES = ['init', 'requirements', 'design', 'tickets', 'implement', 'final-review', 'acceptance', 'retro', 'done', 'blocked'];
const STAGE_ORDER = ['init', 'requirements', 'design', 'tickets', 'implement', 'final-review', 'acceptance', 'retro', 'done'];
const STATUSES = ['in-progress', 'waiting-user', 'blocked', 'done'];
const TIERS = ['S', 'M', 'L'];
const GATES = ['designApproved', 'ticketsReviewed', 'finalReviewed', 'userAccepted'];
const GATE_REQUIRED = {
  tickets: 'designApproved',
  implement: 'ticketsReviewed',
  acceptance: 'finalReviewed',
  done: 'userAccepted',
};
const GATE_NAME = {
  designApproved: '设计签字',
  ticketsReviewed: '工单 3 路审核',
  finalReviewed: '完成评审',
  userAccepted: '用户验收',
};

function defaultNext(stage) {
  switch (stage) {
    case 'init': return '确定功能名和风险档，创建 spec.md';
    case 'requirements': return '先判需求清晰度（brainstorming / dev-flow-grill-with-docs / direct），产出 spec.md（为什么/成功指标/非目标 + M/L 澄清记录）';
    case 'design': return '写 design.md（NFR 六条+协调字段），交给用户审并签字';
    case 'tickets': return '用 dev-flow-to-tickets 拆工单到 issues/T-XX.md，跑 3 路审核';
    case 'implement': return '按工单实现，每节点对标工单和设计';
    case 'final-review': return '跑完成 3 路评审（记录校准）';
    case 'acceptance': return '写 acceptance.md（Summary/Evidence/Merge Danger），交给用户在实机验收';
    case 'retro': return '复盘验收失败，升级流程';
    case 'done': return '已完成；补 TaskChron 同步，可以开始下一个功能';
    case 'blocked': return '解除阻塞后继续';
    default: return '未知阶段';
  }
}

function parseArgs(argv) {
  const out = { root: process.cwd(), gates: {}, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--feature') out.feature = argv[++i];
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--tier') out.tier = argv[++i];
    else if (a === '--stage') out.stage = argv[++i];
    else if (a === '--status') out.status = argv[++i];
    else if (a === '--next') out.next = argv[++i];
    else if (a === '--ticket') out.ticket = argv[++i];
    else if (a === '--note') out.note = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--force') out.force = true;
    else if (a === '--affected') out.affected = argv[++i];
    else if (a === '--depends') out.depends = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node flow-set.mjs --feature <id> [--title <t>] [--tier S|M|L] [--stage <stage>] [--status <status>] [--next <text>] [--ticket <id>] [--gate key=true|false] [--affected a,b] [--depends a,b] [--note <text>] [--root <root>] [--force]');
      process.exit(0);
    } else if (a.startsWith('--gate')) {
      const kv = argv[++i] || '';
      const [k, v] = kv.split('=');
      if (!GATES.includes(k)) {
        console.error(`未知门禁：${k}（允许：${GATES.join(', ')}）`);
        process.exit(2);
      }
      out.gates[k] = v === 'true';
    }
  }
  return out;
}

function now() {
  return new Date().toISOString();
}

function freshState(args, stage) {
  return {
    version: 2,
    feature: args.feature,
    title: args.title || args.feature,
    tier: args.tier || 'M',
    stage: stage || 'init',
    status: 'in-progress',
    currentTicket: null,
    nextAction: defaultNext(stage || 'init'),
    artifacts: {
      spec: `specs/${args.feature}/spec.md`,
      design: `specs/${args.feature}/design.md`,
      issues: `specs/${args.feature}/issues`,
      tasks: `specs/${args.feature}/tasks.md`,
      traceability: `specs/${args.feature}/traceability.md`,
      acceptance: `specs/${args.feature}/acceptance.md`,
    },
    gates: { designApproved: false, ticketsReviewed: false, finalReviewed: false, userAccepted: false },
    affectedModules: [],
    dependsOnFeatures: [],
    taskchron: { parentId: null, epics: {}, lastSyncedAt: null },
    history: [],
    updatedAt: now(),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feature) {
    console.error('必须提供 --feature <id>');
    process.exit(2);
  }
  if (args.stage && !STAGES.includes(args.stage)) {
    console.error(`非法阶段：${args.stage}（允许：${STAGES.join(', ')}）`);
    process.exit(2);
  }
  if (args.status && !STATUSES.includes(args.status)) {
    console.error(`非法状态：${args.status}（允许：${STATUSES.join(', ')}）`);
    process.exit(2);
  }
  if (args.tier && !TIERS.includes(args.tier)) {
    console.error(`非法档位：${args.tier}（允许：${TIERS.join(', ')}）`);
    process.exit(2);
  }

  const root = path.resolve(args.root);
  const dir = path.join(root, 'specs', args.feature);
  const file = path.join(dir, 'state.json');
  fs.mkdirSync(dir, { recursive: true });

  let state;
  let rebuilt = false;
  if (fs.existsSync(file)) {
    try {
      state = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`警告：状态文件损坏（${e.message}），将重建 v2 最小状态。`);
      state = freshState(args, args.stage);
      state.history.push({ at: now(), stage: state.stage, note: '状态损坏，已重建（原内容不可解析）' });
      rebuilt = true;
    }
  } else {
    state = freshState(args, args.stage);
  }

  // v1 → v2 原地升级（补字段，不动已有值）
  let upgraded = false;
  if ((state.version || 1) < 2) {
    state.version = 2;
    upgraded = true;
  }
  state.artifacts = state.artifacts || {};
  if (!state.artifacts.issues) {
    state.artifacts.issues = `specs/${args.feature}/issues`;
    upgraded = true;
  }
  if (!Array.isArray(state.affectedModules)) {
    state.affectedModules = [];
    upgraded = true;
  }
  if (!Array.isArray(state.dependsOnFeatures)) {
    state.dependsOnFeatures = [];
    upgraded = true;
  }
  // 时记环节映射与新鲜度锚点：缺失补空壳（不动已有值，不伪写 lastSyncedAt）
  if (!state.taskchron || typeof state.taskchron !== 'object') {
    state.taskchron = { parentId: null, epics: {}, lastSyncedAt: null };
    upgraded = true;
  }

  const before = { stage: state.stage, status: state.status, nextAction: state.nextAction };
  if (args.title) state.title = args.title;
  if (args.tier) state.tier = args.tier;

  // 门禁先落（允许同一次调用 --stage tickets --gate designApproved=true）
  if (!state.gates) state.gates = {};
  for (const [k, v] of Object.entries(args.gates)) state.gates[k] = v;

  if (args.stage) {
    const oldIdx = STAGE_ORDER.indexOf(before.stage);
    const newIdx = STAGE_ORDER.indexOf(args.stage);
    const isBackward = oldIdx >= 0 && newIdx >= 0 && newIdx < oldIdx && before.stage !== 'blocked';
    if (isBackward) {
      const allowed = before.stage === 'retro'
        ? ['requirements', 'design', 'tickets']
        : ['design', 'tickets'];
      if (!allowed.includes(args.stage)) {
        console.error(`不允许回退到 ${args.stage}：主线只允许回退到「设计/工单」；复盘（retro）后可回「需求」补 AC。`);
        process.exit(3);
      }
    }
    const isForward = oldIdx < 0 || newIdx > oldIdx || before.stage === 'blocked';
    const requiredGate = GATE_REQUIRED[args.stage];
    if (isForward && requiredGate && !state.gates[requiredGate] && !args.force) {
      console.error(`门禁未过：进入 ${args.stage} 需要 ${GATE_NAME[requiredGate]}（${requiredGate}=true）。`);
      console.error('如确要越过（仅限例外），加 --force 并在 --note 写明原因。');
      process.exit(3);
    }
    state.stage = args.stage;
    if (!args.next && args.stage !== before.stage) state.nextAction = defaultNext(args.stage);
  }
  if (args.status) state.status = args.status;
  if (!args.status) {
    if (state.stage === 'done') state.status = 'done';
    else if (state.stage === 'blocked') state.status = 'blocked';
    else if (state.status === 'done' || state.status === 'blocked') state.status = 'in-progress';
  }
  if (args.next) state.nextAction = args.next;
  if (args.ticket !== undefined) state.currentTicket = args.ticket;
  if (args.affected !== undefined) {
    state.affectedModules = args.affected ? args.affected.split(',').map(s => s.trim()).filter(Boolean) : [];
  }
  if (args.depends !== undefined) {
    state.dependsOnFeatures = args.depends ? args.depends.split(',').map(s => s.trim()).filter(Boolean) : [];
  }
  if (!state.history) state.history = [];
  if (upgraded) state.history.push({ at: now(), stage: state.stage, note: 'v1→v2 升级：补 issues 工件与协调字段' });
  if (args.stage && args.stage !== before.stage) {
    state.history.push({ at: now(), stage: args.stage, note: args.note || `进入${args.stage}` });
  } else if (args.note) {
    state.history.push({ at: now(), stage: state.stage, note: args.note });
  }
  state.updatedAt = now();

  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);

  console.log(`已更新：${path.relative(root, file)}${rebuilt ? '（原文件损坏，已重建）' : ''}`);
  console.log(`阶段：${state.stage} / ${state.status}`);
  console.log(`下一步：${state.nextAction}`);
  const gates = state.gates || {};
  console.log(`门禁：设计${gates.designApproved ? '✓' : '✗'} 工单${gates.ticketsReviewed ? '✓' : '✗'} 完成评审${gates.finalReviewed ? '✓' : '✗'} 验收${gates.userAccepted ? '✓' : '✗'}`);
  if (state.currentTicket) console.log(`当前工单：${state.currentTicket}`);
  if (state.affectedModules.length) console.log(`受影响模块：${state.affectedModules.join('、')}`);
  if (state.dependsOnFeatures.length) console.log(`依赖功能：${state.dependsOnFeatures.join('、')}`);
}

main();

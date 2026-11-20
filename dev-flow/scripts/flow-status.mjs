#!/usr/bin/env node
/**
 * dev-flow status v2: read specs/<feature>/state.json and print where we are + next action.
 *
 * Usage:
 *   node flow-status.mjs [--feature <id>] [--root <project-root>] [--json] [--scan]
 *
 * v2 行为：
 *   - v1 状态提示升级；损坏 JSON 给出重建指引；
 *   - 工单进度：统计 issues/T-XX.md 的 **状态** 行；
 *   - 断点：显示 currentTicket 与 nextAction；
 *   - 协调扫描：tier=L（或 --scan）时扫描其他 specs 的 state.json 中 affectedModules 重叠。
 *
 * Exit codes: 0 ok, 1 no state found, 2 ambiguous/invalid, 3 corrupt (with rebuild hint).
 */
import fs from 'node:fs';
import path from 'node:path';

const STAGES = ['init', 'requirements', 'design', 'tickets', 'implement', 'final-review', 'acceptance', 'retro', 'done', 'blocked'];
const STATUSES = ['in-progress', 'waiting-user', 'blocked', 'done'];

function parseArgs(argv) {
  const out = { feature: null, root: process.cwd(), json: false, scan: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--feature') out.feature = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--scan') out.scan = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node flow-status.mjs [--feature <id>] [--root <project-root>] [--json] [--scan]');
      process.exit(0);
    }
  }
  return out;
}

function findStates(root) {
  const specs = path.join(root, 'specs');
  if (!fs.existsSync(specs)) return [];
  return fs
    .readdirSync(specs, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(specs, d.name, 'state.json'))
    .filter(f => fs.existsSync(f));
}

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

function stageName(stage) {
  const map = {
    init: '初始化', requirements: '需求', design: '设计', tickets: '工单',
    implement: '实现', 'final-review': '完成评审', acceptance: '验收',
    retro: '复盘', done: '已完成', blocked: '阻塞',
  };
  return map[stage] || stage;
}

const ISSUE_FILE_RE = /^T-\d+(?:[A-Z]\d*)*\.md$/;
const ISSUE_STATUS_ALIASES = {
  'ready-for-agent': 'pending',
  closed: 'cancelled',
  doing: 'in-progress',
  todo: 'pending',
  '✅': 'done',
  '⬜': 'pending',
  '🔄': 'in-progress',
  '⛔': 'blocked',
};

// —— 模型分工（models 块）——
// 与 dev-flow-setup/scripts/setup.mjs 的 normalizeModels/modelsStatus/modelsLine 语义一致；
// dev-flow 与 dev-flow-setup 两技能独立安装，此处刻意不跨技能 import，改动须两边同步。
// 9 个必填槽位（worker 按 default 计）；worker.light 缺省回退 default；数组 1 项=三路同型号、
// 3 项=逐路指定、2 项=非法；缺失/null/空数组=未配置；模型 ID 形如 provider/model，只查形状。
function normalizeModels(raw) {
  const models = {
    router: null,
    early: null,
    ticketReview: null,
    ticketJudge: null,
    worker: { default: null, light: null },
    inspector: null,
    finalReview: null,
    finalJudge: null,
    offpeak: null,
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return models;
  const cleanId = value => (typeof value === 'string' ? value.trim() : '');
  for (const slot of ['router', 'early', 'ticketJudge', 'inspector', 'finalJudge', 'offpeak']) {
    const value = raw[slot];
    if (value === null || value === undefined) continue;
    const id = cleanId(value);
    models[slot] = id || value;
  }
  if (raw.worker !== null && raw.worker !== undefined) {
    if (raw.worker && typeof raw.worker === 'object' && !Array.isArray(raw.worker)) {
      for (const key of ['default', 'light']) {
        const value = raw.worker[key];
        if (value === null || value === undefined) continue;
        const id = cleanId(value);
        models.worker[key] = id || value;
      }
      for (const [key, value] of Object.entries(raw.worker)) {
        if (!(key in models.worker)) models.worker[key] = JSON.parse(JSON.stringify(value));
      }
    } else {
      models.worker = raw.worker;
    }
  }
  for (const slot of ['ticketReview', 'finalReview']) {
    const value = raw[slot];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const ids = value.map(cleanId);
      if (ids.length === 0) continue;
      if (ids.every(Boolean) && (ids.length === 1 || ids.length === 3)) {
        models[slot] = ids.length === 1 ? [ids[0], ids[0], ids[0]] : ids;
        continue;
      }
    }
    models[slot] = value;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in models)) models[key] = JSON.parse(JSON.stringify(value));
  }
  return models;
}

function modelsStatus(models) {
  const m = models && typeof models === 'object' && !Array.isArray(models) ? models : {};
  const missing = [];
  const invalid = [];
  const stateOf = (value, kind) => {
    if (value === null || value === undefined) return 'missing';
    if (kind === 'string') return typeof value === 'string' && value.trim() ? 'ok' : 'invalid';
    return Array.isArray(value) &&
      value.length === 3 &&
      value.every(item => typeof item === 'string' && item.trim())
      ? 'ok'
      : 'invalid';
  };
  let configured = 0;
  for (const [name, kind] of Object.entries({
    router: 'string',
    early: 'string',
    ticketReview: 'array',
    ticketJudge: 'string',
    inspector: 'string',
    finalReview: 'array',
    finalJudge: 'string',
    offpeak: 'string',
  })) {
    const state = stateOf(m[name], kind);
    if (state === 'ok') configured += 1;
    else if (state === 'invalid') invalid.push(name);
    else missing.push(name);
  }
  const workerRaw = m.worker;
  const worker = workerRaw && typeof workerRaw === 'object' && !Array.isArray(workerRaw) ? workerRaw : {};
  if (workerRaw !== null && workerRaw !== undefined && worker !== workerRaw) invalid.push('worker');
  const defaultState = stateOf(worker.default, 'string');
  if (defaultState === 'ok') configured += 1;
  else if (defaultState === 'invalid') invalid.push('worker.default');
  else missing.push('worker.default');
  const lightState = stateOf(worker.light, 'string');
  if (lightState === 'invalid') invalid.push('worker.light');
  const workerLight =
    lightState === 'ok' ? 'configured' : defaultState === 'ok' ? 'fallback' : lightState === 'invalid' ? 'invalid' : 'missing';
  return { configured, total: 9, missing, invalid, workerLight };
}

function modelsLine(status) {
  const detail = [
    ...status.missing,
    ...status.invalid.map(name => `${name}（非法）`),
    ...(status.workerLight === 'fallback' ? ['worker.light(回退worker.default)'] : []),
  ];
  return `模型分工：${status.configured}/${status.total} 已配置` + (detail.length ? `（缺：${detail.join('、')}）` : '');
}

function readModels(root) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(root, '.dev-flow.json'), 'utf8'));
  } catch {
    raw = null; // 无配置/配置损坏按「未配置 models」处理，flow-status 本身不因此报错
  }
  const normalized = normalizeModels(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.models : null);
  return { status: modelsStatus(normalized), normalized };
}

function normalizeIssueStatus(raw) {
  const token = String(raw || '').split(/[\s（(，,；;:：、]/u)[0] || '';
  return ISSUE_STATUS_ALIASES[token] || token || 'unknown';
}

function countIssues(root, state) {
  const dir = state.artifacts?.issues
    ? path.join(root, state.artifacts.issues)
    : path.join(path.dirname(path.join(root, 'specs', state.feature || '', 'x')), 'issues');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => ISSUE_FILE_RE.test(f));
  const tally = {};
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = text.match(/\*\*状态\*\*[:：]\s*(.*)$/m);
    const s = m ? normalizeIssueStatus(m[1]) : 'unknown';
    tally[s] = (tally[s] || 0) + 1;
  }
  return { total: files.length, tally };
}

function scanConflicts(root, state) {
  const out = [];
  const mine = new Set(state.affectedModules || []);
  if (mine.size === 0) return out;
  for (const f of findStates(root)) {
    const self = path.dirname(f) === path.dirname(path.join(root, 'specs', state.feature || '', 'state.json'));
    if (self) continue;
    let other;
    try {
      other = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      continue;
    }
    if (other.status === 'done' || other.stage === 'done') continue;
    const overlap = (other.affectedModules || []).filter(m => mine.has(m));
    if (overlap.length) {
      out.push({ feature: other.feature || path.basename(path.dirname(f)), stage: other.stage, modules: overlap });
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  let statePath;

  if (args.feature) {
    statePath = path.join(root, 'specs', args.feature, 'state.json');
    if (!fs.existsSync(statePath)) {
      console.error(`找不到状态文件：${statePath}`);
      process.exit(1);
    }
  } else {
    const states = findStates(root);
    if (states.length === 0) {
      console.log('没有进行中的 dev-flow 功能。');
      console.log('下一步：说「用 dev-flow 开一个新功能：<一句话>」来初始化。');
      process.exit(1);
    }
    if (states.length > 1) {
      console.error('有多个进行中的功能，请用 --feature 指定：');
      for (const s of states) console.error('  - ' + path.basename(path.dirname(s)));
      process.exit(2);
    }
    statePath = states[0];
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    console.error(`状态文件不是合法 JSON：${statePath}`);
    console.error(e.message);
    console.error(`重建指引：node flow-set.mjs --feature <id> --title <t> --tier <S|M|L> --note "损坏重建" --root <root>`);
    process.exit(3);
  }

  if (!STAGES.includes(state.stage)) {
    console.error(`非法阶段：${state.stage}（允许：${STAGES.join(', ')}）`);
    process.exit(2);
  }
  if (!STATUSES.includes(state.status)) {
    console.error(`非法状态：${state.status}（允许：${STATUSES.join(', ')}）`);
    process.exit(2);
  }

  const featureDir = path.dirname(statePath);
  const artifacts = state.artifacts || {};
  const checks = Object.entries(artifacts).map(([k, v]) => ({ k, v, exists: v ? fs.existsSync(path.join(root, v)) : false }));
  const gates = state.gates || {};
  const warnings = [];
  const has = k => checks.find(c => c.k === k)?.exists;
  if ((state.version || 1) < 2) warnings.push('状态文件是 v1，运行一次 flow-set 可原地升级 v2（补 issues 工件与协调字段）');
  if (gates.designApproved && !has('design')) warnings.push('设计门禁已过，但 design.md 不存在');
  if (gates.ticketsReviewed && !has('tasks')) warnings.push('工单门禁已过，但 tasks.md 不存在');
  if (gates.ticketsReviewed && !has('issues')) warnings.push('工单门禁已过，但 issues/ 目录不存在');
  if (gates.finalReviewed && !has('acceptance')) warnings.push('完成评审门禁已过，但 acceptance.md 不存在');
  if (state.stage === 'done' && !gates.userAccepted) warnings.push('阶段是 done，但用户验收门禁未通过');
  if (state.stage === 'retro' && gates.userAccepted) warnings.push('阶段是 retro，但用户验收门禁已通过');
  if (state.stage === 'implement' && state.currentTicket) warnings.push(`断点：上次做到工单 ${state.currentTicket}`);

  const issues = countIssues(root, state);
  const conflicts = args.scan || state.tier === 'L' ? scanConflicts(root, state) : [];
  for (const c of conflicts) warnings.push(`模块重叠：与功能 ${c.feature}（${c.stage}）重叠 [${c.modules.join('、')}]，先排序/协调再动工`);

  const models = readModels(root);

  if (args.json) {
    console.log(JSON.stringify({ statePath, state, artifacts: checks, issues, conflicts, models }, null, 2));
    return;
  }

  console.log('【dev-flow】');
  console.log(`功能：${state.feature}（${state.title || ''}）`);
  console.log(`档位：${state.tier || 'M'}`);
  console.log(`现在：${stageName(state.stage)}（${state.stage} / ${state.status}）`);
  console.log(`上次：${state.history?.length ? state.history[state.history.length - 1].note || state.history[state.history.length - 1].stage : '无'}`);
  console.log(`下一步：${state.nextAction || defaultNext(state.stage)}`);
  if (state.currentTicket) console.log(`当前工单：${state.currentTicket}`);
  if (issues) {
    const t = issues.tally;
    console.log(`工单：${issues.total} 张（done ${t.done || 0} / in-progress ${t['in-progress'] || 0} / blocked ${t.blocked || 0} / pending ${t.pending || 0} / cancelled ${t.cancelled || 0}）`);
  }
  const missing = checks.filter(c => c.v && !c.exists).map(c => c.v);
  console.log(`产物：${missing.length ? '缺 ' + missing.join('、') : '已齐'}`);
  console.log(`门禁：设计${gates.designApproved ? '✓' : '✗'} 工单${gates.ticketsReviewed ? '✓' : '✗'} 完成评审${gates.finalReviewed ? '✓' : '✗'} 验收${gates.userAccepted ? '✓' : '✗'}`);
  console.log(modelsLine(models.status));
  if ((state.affectedModules || []).length) console.log(`受影响模块：${state.affectedModules.join('、')}`);
  if ((state.dependsOnFeatures || []).length) console.log(`依赖功能：${state.dependsOnFeatures.join('、')}`);
  if (warnings.length) console.log(`警告：${warnings.join('；')}`);
  console.log(`状态文件：${path.relative(root, statePath)}`);
  void featureDir;
}

main();

#!/usr/bin/env node
/**
 * 看门狗（路由编排层批二，references/09-conductor.md §9）。
 *
 * 外部巡检、只报不修：只查文件面事实——租约（<槽位根>/<N>/lease/info.json）、
 * 台账（已收账行缺报告）、门禁产物（报告路径指向的文件不存在 / 退出码文件非零）。
 * 会话是否活着脚本查不到，留给会话侧 ReadSession（协议边界，勿越）。
 * 禁自动重启 / 杀进程 / 改任何租约；动作只有两档：输出建议（nudge 工人 / 升级用户）。
 *
 * 健康项模型（照 dsh HealthBoard 实证，不过度设计）：
 *   每个部件一个健康项（lease / ledger / gate），一项只有一个写入者＝本脚本自身；
 *   同项连续失败 3 次才报错；下一次成功即自清清零；同一问题报过一次不再重复告知。
 *
 * 退出码四档（照 dsh `dsh-superagent status`）：
 *   0 正常（含 1–2 次失败未满三振——正常静默，明细仍可见）
 *   1 没跑或运行时错（参数 / 显式路径不存在 / 内部异常）
 *   2 部件错（某项三振成立；重启无用，只报不修）
 *   3 等配置（既无租约也无台账可查，等 setup；重启无用）
 *
 * 人工停机标记（尊重人工停机，发现即不介入）：
 *   <槽位根>/STOP      全局停机 → 整体静默退出，三振计数不动；
 *   <槽位根>/<N>/HOLD  该槽位人工暂停 → 跳过它的租约检查。
 *
 * 三振计数存状态文件（跨次运行记忆）：--state 指定，默认系统临时目录
 *   devflow-watchdog-<root路径哈希>.json（不落仓库、不进 git status）。
 *
 * 用法：
 *   node watchdog.mjs --root <仓库路径> [--ledger <台账.md>] [--slots-dir <.slots目录>]
 *                     [--lease-stale-hours N] [--gate-file <退出码文件>] [--state <状态文件>]
 *                     [--json] [--now <ISO时间（自测注入）>]
 *   node watchdog.mjs --self-test
 *
 * --gate-file 格式（可选）：每行 `名字 退出码`（# 开头注释），或整个文件是 JSON 对象
 * { "名字": 码 }；任一非零 → gate 项记一次失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const STRIKES = 3;
const ITEMS = ['lease', 'ledger', 'gate'];
const ITEM_LABEL = { lease: '租约', ledger: '台账', gate: '门禁' };
const SUGGESTION = {
  lease: '建议（nudge 工人）：SendToSession 询问该槽位工人会话——先 ReadSession 确认会话活性（本脚本查不到）',
  ledger: '建议（升级用户）：台账已收账行缺报告，路由会话补收账',
  gate: '建议（升级用户）：门禁红 / 证据文件缺失，人工处置（重启无用）',
};

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--self-test') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opts[a.slice(2)] = true;
      else {
        opts[a.slice(2)] = next;
        i++;
      }
    } else opts._.push(a);
  }
  return {
    root: opts.root,
    ledger: opts.ledger,
    slotsDir: opts['slots-dir'],
    staleHours: opts['lease-stale-hours'] !== undefined ? Number(opts['lease-stale-hours']) : 24,
    gateFile: opts['gate-file'],
    state: opts.state,
    json: !!opts.json,
    now: opts.now ? Date.parse(opts.now) : Date.now(),
    selfTest: !!(opts['self-test'] || opts.selfTest),
  };
}

function defaultStatePath(root) {
  const h = crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `devflow-watchdog-${h}.json`);
}

function loadState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (s && typeof s === 'object' && s.items) return s;
  } catch {
    /* 损坏即重建（记忆丢了只影响三振计数，不影响本次事实） */
  }
  return { version: 1, items: {} };
}

function saveState(file, state) {
  try {
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** 槽位根定位：显式 > .dev-flow.json slots.dir > 约定 <root>/../<名>-trees/.slots > <root>/.slots */
function resolveSlotsDir(root, explicit) {
  if (explicit) return { dir: explicit, src: '--slots-dir 显式' };
  try {
    const base = path.resolve(root);
    const profile = JSON.parse(fs.readFileSync(path.join(base, '.dev-flow.json'), 'utf8'));
    const configured = profile?.slots?.dir;
    if (configured) return { dir: path.resolve(base, configured), src: '.dev-flow.json slots.dir' };
  } catch {
    /* 无配置/坏配置：继续按约定探测 */
  }
  const cand1 = path.join(path.dirname(path.resolve(root)), path.basename(path.resolve(root)) + '-trees', '.slots');
  if (fs.existsSync(cand1)) return { dir: cand1, src: '约定 <root>/../<名>-trees/.slots' };
  const cand2 = path.join(path.resolve(root), '.slots');
  if (fs.existsSync(cand2)) return { dir: cand2, src: '约定 <root>/.slots' };
  return { dir: null, src: '未找到（可 --slots-dir 显式指定）' };
}

function gitLastCommitSec(worktree) {
  try {
    const out = execFileSync('git', ['-C', worktree, 'log', '-1', '--format=%ct'], {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const n = Number(String(out).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** 租约检查：租约在但超过阈值无提交（工作树查不到时按 started 兜底，注明） */
function checkLeases(slotsDir, now, staleHours) {
  const entries = [];
  const skipped = [];
  if (!slotsDir) return { entries, skipped, watched: 0, note: '无槽位目录可查' };
  let dirs = [];
  try {
    dirs = fs.readdirSync(slotsDir, { withFileTypes: true }).filter(d => d.isDirectory() && /^\d+$/.test(d.name));
  } catch {
    return { entries: [{ reason: `槽位目录不可读：${slotsDir}` }], skipped, watched: 0 };
  }
  let watched = 0;
  for (const d of dirs) {
    const slotDir = path.join(slotsDir, d.name);
    const infoPath = path.join(slotDir, 'lease', 'info.json');
    if (!fs.existsSync(infoPath)) continue;
    if (fs.existsSync(path.join(slotDir, 'HOLD'))) {
      skipped.push(`slot-${d.name}（HOLD 人工暂停，跳过）`);
      continue;
    }
    watched++;
    let info = {};
    try {
      info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    } catch {
      entries.push({ slot: `slot-${d.name}`, reason: '租约 info.json 不可解析' });
      continue;
    }
    const startedMs = Date.parse(info.started || '') || fs.statSync(infoPath).mtimeMs;
    const worktree = path.join(path.dirname(slotsDir), `slot-${d.name}`);
    const lastSec = gitLastCommitSec(worktree);
    const sinceMs = Math.max(startedMs, (lastSec || 0) * 1000);
    const ageH = (now - sinceMs) / 3.6e6;
    if (ageH > staleHours) {
      entries.push({
        slot: `slot-${d.name}`,
        task: info.task || '?',
        ageH: ageH.toFixed(1),
        since: new Date(sinceMs).toISOString().slice(0, 16).replace('T', ' ') + 'Z',
        note: lastSec === null ? '（工作树提交不可查，仅按租约 started 计）' : '',
      });
    }
  }
  return { entries, skipped, watched, note: watched === 0 ? '无活跃租约' : `在盯 ${watched} 份租约` };
}

/** markdown 表行切列：先保护 `\|` 转义，切完还原 */
function rowCells(line) {
  const SAFE = '\u0000PIPE\u0000';
  return line
    .replace(/\\\|/g, SAFE)
    .split('|')
    .slice(1, -1)
    .map(c => c.trim().replace(new RegExp(SAFE, 'g'), '|'));
}

/** 台账解析：扫全部含 时间/单号/状态 表头的表；表缺「报告」列则整表跳过并记 note（不假定列位） */
function parseLedger(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const rows = [];
  const notes = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) continue;
    const cells = rowCells(lines[i]);
    const find = kw => cells.findIndex(c => c.includes(kw));
    const t = find('时间'),
      n = find('单号'),
      s = find('状态');
    if (t < 0 || n < 0 || s < 0) continue;
    let end = i;
    for (let j = i + 1; j < lines.length && lines[j].startsWith('|'); j++) end = j;
    const cRe = find('报告'),
      cCo = find('提交');
    if (cRe < 0) {
      notes.push(`${file} 有表但缺「报告」列，该表行跳过（不假定列位）`);
      i = end;
      continue;
    }
    for (let j = i + 1; j <= end; j++) {
      const cs = rowCells(lines[j]);
      if (cs.every(c => /^[-\s:]*$/.test(c))) continue; // 分隔行
      rows.push({
        file,
        lineNo: j + 1,
        ticket: cs[n] || '',
        status: cs[s] || '',
        commits: cCo >= 0 ? cs[cCo] || '' : '',
        report: cs[cRe] || '',
      });
    }
    i = end;
  }
  if (rows.length === 0 && notes.length === 0) notes.push(`${file} 无 时间/单号/状态 表（视作未启用，不计失败）`);
  return { file, rows, notes };
}

const PATH_TOKEN_RE = /[^\s；;，,（(）)+]+/g;
function pathTokens(cell) {
  const out = [];
  for (const t of cell.match(PATH_TOKEN_RE) || []) {
    const sep = t.includes('/') || t.includes('\\');
    if (sep && /\.(md|json|txt|log|csv|html)$/i.test(t) && !/^https?:/i.test(t)) out.push(t);
  }
  return out;
}

/** 台账项：已收账/已完成行的报告列缺（—/-/空）＝缺报告；无表/缺报告列只记 note 不计失败 */
function checkLedgers(ledgers) {
  const entries = [];
  const notes = [];
  for (const lg of ledgers) {
    notes.push(...(lg.notes || []));
    for (const row of lg.rows) {
      if (!/已收账|已完成/.test(row.status)) continue;
      if (row.report === '' || row.report === '-' || row.report === '—') {
        entries.push({ ledger: lg.file, lineNo: row.lineNo, ticket: row.ticket, reason: '已收账但报告列为空/占位' });
      }
    }
  }
  return { entries, notes };
}

/** 门禁项：报告路径指向的文件必须存在（相对台账 feature 目录或仓库根解析）；退出码文件非零即红 */
function checkGate(ledgers, root, gateFile) {
  const entries = [];
  const notes = [];
  let checked = 0;
  for (const lg of ledgers) {
    if (lg.broken) continue;
    const featureDir = path.dirname(path.dirname(lg.file));
    for (const row of lg.rows) {
      if (!/已收账|已完成/.test(row.status)) continue;
      for (const tok of pathTokens(row.report)) {
        checked++;
        const ok = [featureDir, path.resolve(root)].some(base => fs.existsSync(path.resolve(base, tok)));
        if (!ok) entries.push({ ledger: lg.file, lineNo: row.lineNo, ticket: row.ticket, path: tok });
      }
    }
  }
  if (gateFile) {
    let codes = null;
    try {
      const raw = fs.readFileSync(gateFile, 'utf8').trim();
      codes = raw.startsWith('{')
        ? JSON.parse(raw)
        : Object.fromEntries(
            raw
              .split('\n')
              .map(l => l.trim())
              .filter(l => l && !l.startsWith('#'))
              .map(l => {
                const m = l.match(/^(\S+)\s+(\d+)$/);
                return m ? [m[1], Number(m[2])] : null;
              })
              .filter(Boolean)
          );
    } catch {
      entries.push({ reason: `gate-file 不可解析：${gateFile}` });
      codes = null;
    }
    if (codes) {
      for (const [name, code] of Object.entries(codes)) {
        if (Number(code) !== 0) entries.push({ gate: name, exit: code });
        else notes.push(`gate-file ${name}=0`);
      }
    }
  }
  return { entries, note: checked === 0 && !gateFile ? '无可查门禁产物' : `核验 ${checked} 个证据路径${gateFile ? ' + gate-file' : ''}` };
}

/** 一次巡检（不写状态）。返回 {exit, report} */
function runOnce(opts) {
  const root = path.resolve(opts.root);
  if (!fs.existsSync(root)) return { exit: 1, report: { error: `--root 不存在：${root}` } };
  const slots = resolveSlotsDir(root, opts.slotsDir);
  if (opts.slotsDir && !fs.existsSync(slots.dir)) {
    return { exit: 1, report: { error: `--slots-dir 不存在：${slots.dir}` } };
  }

  // 尊重人工停机：全局 STOP 标记 → 整体静默，不计数不介入
  if (slots.dir && fs.existsSync(path.join(slots.dir, 'STOP'))) {
    return {
      exit: 0,
      report: { manualStop: true, message: `尊重人工停机（${path.join(slots.dir, 'STOP')}），本次不介入`, stateTouched: false },
    };
  }

  // 台账清单：显式 > 扫 specs/*/dispatch/LEDGER.md
  const ledgers = [];
  if (opts.ledger) {
    if (!fs.existsSync(opts.ledger)) return { exit: 1, report: { error: `--ledger 不存在：${opts.ledger}` } };
    ledgers.push(parseLedger(opts.ledger));
  } else {
    const specDir = path.join(root, 'specs');
    if (fs.existsSync(specDir)) {
      for (const feat of fs.readdirSync(specDir)) {
        const f = path.join(specDir, feat, 'dispatch', 'LEDGER.md');
        if (fs.existsSync(f)) ledgers.push(parseLedger(f));
      }
    }
  }

  const leaseRes = checkLeases(slots.dir, opts.now, opts.staleHours);
  if (leaseRes.watched === 0 && ledgers.length === 0) {
    // 既无在盯租约也无台账 → 没有可巡检的部件，等 setup
    return {
      exit: 3,
      report: {
        waitingSetup: true,
        message: `等配置：既无在盯租约也无台账可查（槽位根：${slots.src}）——重启无用，先 setup`,
        stateTouched: false,
      },
    };
  }

  const ledgerCheck = checkLedgers(ledgers);
  const results = {
    lease: { entries: leaseRes.entries, note: [leaseRes.note, ...leaseRes.skipped].join('；') },
    ledger: {
      entries: ledgerCheck.entries,
      note: ledgers.length === 0 ? '无台账可查' : [`在盯 ${ledgers.length} 份台账`, ...ledgerCheck.notes].join('；'),
    },
    gate: { ...checkGate(ledgers, root, opts.gateFile) },
  };

  // 三振状态机：连续失败计数 / 满三振报告一次 / 成功自清
  const state = loadState(opts.state || defaultStatePath(root));
  const items = {};
  let exit = 0;
  for (const key of ITEMS) {
    const failed = results[key].entries.length > 0;
    const st = state.items[key] || { fails: 0, reported: false };
    const prevFails = st.fails || 0;
    const prevReported = !!st.reported;
    let newlyReported = false;
    let cleared = false;
    if (failed) {
      st.fails = prevFails + 1;
      st.lastMsg = results[key].entries.map(e => JSON.stringify(e)).join(' ').slice(0, 300);
      if (st.fails >= STRIKES && !prevReported) {
        st.reported = true;
        newlyReported = true;
      }
    } else {
      cleared = prevReported;
      st.fails = 0;
      st.reported = false;
      st.lastMsg = null;
    }
    state.items[key] = st;
    const status = st.fails === 0 ? 'ok' : st.fails >= STRIKES ? 'error' : 'failing';
    if (status === 'error') exit = 2;
    items[key] = {
      status,
      fails: st.fails,
      reported: !!st.reported,
      newlyReported,
      cleared,
      note: results[key].note,
      details: results[key].entries,
    };
  }
  state.updatedAt = new Date(opts.now).toISOString();
  const stateFile = opts.state || defaultStatePath(root);
  const stateSaved = saveState(stateFile, state);

  const suggestions = ITEMS.filter(k => items[k].newlyReported).map(k => `${ITEM_LABEL[k]}：${SUGGESTION[k]}`);
  const report = {
    runAt: new Date(opts.now).toISOString(),
    root,
    slotsDir: slots.dir,
    slotsDirSource: slots.src,
    stateFile,
    stateSaved,
    items,
    exit,
    suggestions,
  };
  return { exit, report };
}

function fmtItemText(key, it) {
  const head = `  ${ITEM_LABEL[key]}(${key})`;
  if (it.status === 'ok') return `${head} ✓ 正常${it.note ? `（${it.note}）` : ''}${it.cleared ? '——自清：此前问题已消除' : ''}`;
  const tag = it.status === 'error' ? '✗ 报错（三振成立，重启无用，只报不修）' : `△ 失败 ${it.fails}/${STRIKES}（未满三振，正常静默）`;
  const lines = [`${head} ${tag}`];
  for (const d of it.details) lines.push(`      - ${Object.entries(d).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  if (it.status === 'error' && !it.newlyReported) lines.push('      （该问题已报告过，不重复告知）');
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) process.exit(selfTest());
  if (!opts.root) {
    console.error('用法：node watchdog.mjs --root <仓库路径> [选项] | --self-test（详见文件头注释）');
    process.exit(1);
  }
  if (!Number.isFinite(opts.staleHours) || opts.staleHours <= 0) {
    console.error('watchdog: --lease-stale-hours 需为正数');
    process.exit(1);
  }
  if (!Number.isFinite(opts.now)) {
    console.error('watchdog: --now 无法解析（需 ISO 时间）');
    process.exit(1);
  }
  let out;
  try {
    out = runOnce(opts);
  } catch (e) {
    console.error(`watchdog: 运行时错误（exit 1）：${e.message}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(out.report, null, 2));
  } else if (out.report.error) {
    console.error(`【watchdog】${out.report.error}`);
  } else if (out.report.manualStop) {
    console.log(`【watchdog】${out.report.message}`);
  } else if (out.report.waitingSetup) {
    console.log(`【watchdog】${out.report.message}`);
  } else {
    console.log(`【watchdog】${out.report.root}（槽位根 ${out.report.slotsDir ?? '无'}｜${out.report.slotsDirSource}）`);
    for (const k of ITEMS) console.log(fmtItemText(k, out.report.items[k]));
    for (const s of out.report.suggestions) console.log(s);
    console.log(out.exit === 0 ? '结论：正常（exit 0）' : `结论：部件错（exit 2，重启无用，只报不修）`);
    if (!out.report.stateSaved) console.log('⚠ 状态文件写入失败：三振计数将不跨次记忆（本次事实仍有效）');
  }
  process.exit(out.exit);
}

/* ---------------- self-test：夹具在系统临时目录，跑完即删 ---------------- */
function selfTest() {
  const fs2 = fs;
  const tmp = fs2.mkdtempSync(path.join(os.tmpdir(), 'devflow-watchdog-test-'));
  let pass = 0,
    fail = 0;
  const ok = (name, cond) => {
    console.log(`  ${name} 期望 ${cond ? '√' : '×'} → ${cond ? 'PASS' : 'FAIL'}`);
    cond ? pass++ : fail++;
  };
  const iso = h => new Date(Date.now() - h * 3.6e6).toISOString();
  try {
    const root = path.join(tmp, 'repo');
    const trees = path.join(tmp, 'repo-trees');
    fs2.mkdirSync(path.join(root, 'specs', 'alpha', 'dispatch'), { recursive: true });
    fs2.mkdirSync(path.join(root, 'specs', 'alpha', 'evidence'), { recursive: true });
    fs2.mkdirSync(path.join(trees, '.slots', '2', 'lease'), { recursive: true });
    fs2.writeFileSync(path.join(trees, '.slots', '2', 'lease', 'info.json'), JSON.stringify({ task: 'demo', started: iso(1), state: 'ready' }));
    fs2.writeFileSync(path.join(root, 'specs', 'alpha', 'evidence', 'ok.md'), '# 报告\n');
    fs2.writeFileSync(
      path.join(root, 'specs', 'alpha', 'dispatch', 'LEDGER.md'),
      '# 台账\n\n| 时间 | 单号 | 状态 | 提交 | 报告/证据 | 一行摘要 |\n| --- | --- | --- | --- | --- | --- |\n| 2026-11-16 | T-1 | ✅ 已收账 | abc1234 | evidence/ok.md | 好 |\n\n## 未决问题\n\n- 无\n'
    );
    const st1 = path.join(tmp, 's1.json');

    // S1 健康仓：全绿 exit 0
    let r = runOnce({ root, state: st1, now: Date.now(), staleHours: 24 });
    ok('S1 健康仓 exit 0', r.exit === 0);
    ok('S1 三项全 ok', ITEMS.every(k => r.report.items[k].status === 'ok'));

    // S2 三振：已收账缺报告，第 3 次才 exit 2；修复后自清
    fs2.mkdirSync(path.join(root, 'specs', 'beta', 'dispatch'), { recursive: true });
    const beta = path.join(root, 'specs', 'beta', 'dispatch', 'LEDGER.md');
    fs2.writeFileSync(beta, '# 台账\n\n| 时间 | 单号 | 状态 | 提交 | 报告/证据 | 一行摘要 |\n| --- | --- | --- | --- | --- | --- |\n| 2026-11-16 | T-2 | ✅ 已收账 | def5678 | — | 缺报告 |\n');
    const st2 = path.join(tmp, 's2.json');
    const exits = [];
    let r3 = null;
    for (let i = 0; i < 3; i++) {
      r3 = runOnce({ root, state: st2, now: Date.now(), staleHours: 24 });
      exits.push(r3.exit);
    }
    ok('S2 前两巡 0/0（未满三振静默）', exits[0] === 0 && exits[1] === 0);
    ok('S2 第三巡 exit 2（三振成立）', exits[2] === 2);
    ok('S2 ledger 项首报带建议行', r3.report.items.ledger.newlyReported === true && r3.report.suggestions.some(s => s.includes('台账')));
    let r4 = runOnce({ root, state: st2, now: Date.now(), staleHours: 24 });
    ok('S2 第四巡仍 exit 2 且不重复告知', r4.exit === 2 && r4.report.items.ledger.newlyReported === false && r4.report.suggestions.length === 0);
    fs2.writeFileSync(path.join(root, 'specs', 'beta', 'dispatch', 'LEDGER.md'), '# 台账\n\n| 时间 | 单号 | 状态 | 提交 | 报告/证据 | 一行摘要 |\n| --- | --- | --- | --- | --- | --- |\n| 2026-11-16 | T-2 | ✅ 已收账 | def5678 | ../alpha/evidence/ok.md | 修复 |\n');
    let r5 = runOnce({ root, state: st2, now: Date.now(), staleHours: 24 });
    ok('S2 修复后自清 exit 0', r5.exit === 0 && r5.report.items.ledger.cleared === true);

    // S3 全局 STOP：静默不介入，计数不动
    fs2.writeFileSync(path.join(trees, '.slots', 'STOP'), '');
    let r6 = runOnce({ root, state: st2, now: Date.now(), staleHours: 24 });
    ok('S3 人工停机 exit 0 且声明不介入', r6.exit === 0 && r6.report.manualStop === true);
    fs2.rmSync(path.join(trees, '.slots', 'STOP'));

    // S4 等配置：无租约目录也无台账
    const root2 = path.join(tmp, 'bare');
    fs2.mkdirSync(path.join(root2), { recursive: true });
    let r7 = runOnce({ root: root2, state: path.join(tmp, 's4.json'), now: Date.now(), staleHours: 24 });
    ok('S4 等配置 exit 3', r7.exit === 3);

    // S5 租约超时（48h 无提交、无工作树按 started 兜底）：1/3 静默
    fs2.mkdirSync(path.join(trees, '.slots', '5', 'lease'), { recursive: true });
    fs2.writeFileSync(path.join(trees, '.slots', '5', 'lease', 'info.json'), JSON.stringify({ task: 'stale', started: iso(48) }));
    let r8 = runOnce({ root, state: path.join(tmp, 's5.json'), now: Date.now(), staleHours: 24 });
    ok('S5 陈旧租约 1/3 静默 exit 0', r8.exit === 0 && r8.report.items.lease.status === 'failing' && r8.report.items.lease.fails === 1);

    // S6 HOLD：人工暂停的槽位跳过
    fs2.mkdirSync(path.join(trees, '.slots', '7', 'lease'), { recursive: true });
    fs2.writeFileSync(path.join(trees, '.slots', '7', 'lease', 'info.json'), JSON.stringify({ task: 'hold', started: iso(48) }));
    fs2.writeFileSync(path.join(trees, '.slots', '7', 'HOLD'), '');
    let r9 = runOnce({ root, state: path.join(tmp, 's6.json'), now: Date.now(), staleHours: 24 });
    ok(
      'S6 HOLD 槽位被跳过（只报 slot-5）',
      r9.report.items.lease.details.length >= 1 &&
        r9.report.items.lease.details.every(d => d.slot === 'slot-5') &&
        r9.report.items.lease.note.includes('slot-7')
    );

    // S7 --json：真跑 CLI 子进程，stdout 必须是可解析 JSON 且含退出码与三项
    let cliJson = null;
    try {
      const out = execFileSync(
        process.execPath,
        [process.argv[1], '--root', root, '--state', path.join(tmp, 's7cli.json'), '--json'],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
      cliJson = JSON.parse(out);
    } catch {
      cliJson = null;
    }
    ok('S7 CLI --json 可解析含 exit/items', cliJson !== null && cliJson.exit !== undefined && ITEMS.every(k => k in cliJson.items));

    // S8b 无表台账（空壳/未启用）不计失败：清掉 S5 的陈旧租约防三振串场，连跑三巡 exit 0
    fs2.rmSync(path.join(trees, '.slots', '5'), { recursive: true, force: true });
    fs2.mkdirSync(path.join(root, 'specs', 'gamma', 'dispatch'), { recursive: true });
    fs2.writeFileSync(path.join(root, 'specs', 'gamma', 'dispatch', 'LEDGER.md'), '# 台账（未启用）\n\n还没有表。\n');
    const stNoTable = path.join(tmp, 's8b.json');
    let noTableExits = [];
    for (let i = 0; i < 3; i++) {
      const rr = runOnce({ root, state: stNoTable, now: Date.now(), staleHours: 24 });
      noTableExits.push(rr.exit);
    }
    const noTableLast = runOnce({ root, state: stNoTable, now: Date.now(), staleHours: 24 });
    ok(
      'S8b 无表台账不计失败（视作未启用）',
      noTableExits.every(e => e === 0) && noTableLast.report.items.ledger.status === 'ok' && noTableLast.report.items.ledger.note.includes('未启用')
    );

    // S8 gate-file 非零即红
    const gate = path.join(tmp, 'gate.txt');
    fs2.writeFileSync(gate, '# 门禁\nlint 0\nbuild 1\n');
    let r11 = runOnce({ root, ledger: path.join(root, 'specs', 'alpha', 'dispatch', 'LEDGER.md'), state: path.join(tmp, 's8.json'), now: Date.now(), staleHours: 24, gateFile: gate });
    ok('S8 gate-file 非零记失败', r11.report.items.gate.status === 'failing' && r11.report.items.gate.details.some(d => d.gate === 'build'));

    console.log(fail === 0 ? '结论：SELF-TEST PASS' : `结论：SELF-TEST FAIL（${fail} 项）`);
    return fail === 0 ? 0 : 1;
  } finally {
    fs2.rmSync(tmp, { recursive: true, force: true });
  }
}

main();

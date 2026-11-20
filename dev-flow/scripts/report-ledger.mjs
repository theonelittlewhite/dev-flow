#!/usr/bin/env node
/**
 * 报告块 → 调度台账（路由编排层批二，references/09-conductor.md §4/§10）。
 *
 * 两级过滤里的 Gate 机检之一：程序判定（零模型）——
 *   解析回传报告块七行（RESULT/TICKET/COMMITS/TESTS/EVIDENCE/REVIEW/ASK），
 *   校验必填（RESULT 枚举合法；NEED-DECISION 时 ASK 必填一行问题），
 *   按 TICKET+COMMITS 去重（幂等：同一报告重复投递只记一次，不重复落账），
 *   追加一行到台账（append-only：只追加，不改写历史行；插在表块末尾、
 *   「未决问题」等后文之前）。
 *
 * 去重口径：COMMITS 里的提交号（7–40 位十六进制，且至少含一个 a–f 字符——纯数字
 * 段（时间戳/紧凑日期）不算提交号，防误杀）任一已出现在台账「提交」列即视为重复
 * （提交号全局唯一，是最强信号；同串前缀也认——717a8d2 与 717a8d269 是同一提交的
 * 长短写法）；COMMITS 为 `-`（未提交）时退化为单号精确匹配。命中重复：不追加，
 * 退出码 0（幂等成功，非错误）。
 * 已知宽松性：全数字短提交号（无 a–f 字符）不参与去重，会当新报告追加——概率极低，
 * 后果是多记一行，人工可删；反向误杀（丢单）比多记更贵。
 *
 * 退出码：0 = 已追加或重复跳过；1 = 校验失败（缺项/枚举错，附清单）或台账无表可落；
 *   2 = 用法/读文件错误。
 *
 * 状态映射：RESULT DONE → 已完成；NEED-DECISION → 待裁决（并提示升级用户）；
 *   FAILED → 失败。
 *
 * 用法：
 *   node report-ledger.mjs --ledger <LEDGER.md> --report <报告块.md> [--now <ISO|'YYYY-MM-DD HH:MM'>] [--json]
 *   node report-ledger.mjs --self-test
 *
 * 报告块可埋在任意正文中（半/全角冒号均可，每键首次出现为准）；
 * ``` / ~~~ 围栏内的行一律忽略（防协议手册里的示例块被当真报告落账，与
 * check-order 同款纪律）；台账表头须含 时间/单号/状态 三列名，新行列位按表头名
 * 对齐；写入单元格转义 `|` 为 `\|`，读取侧按 `\|` 还原（markdown 管道语义）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const KEYS = ['RESULT', 'TICKET', 'COMMITS', 'TESTS', 'EVIDENCE', 'REVIEW', 'ASK'];
const RESULTS = ['DONE', 'NEED-DECISION', 'FAILED'];
const STATUS_MAP = { DONE: '已完成', 'NEED-DECISION': '待裁决', FAILED: '失败' };
const LINE_RE = new RegExp(`^(${KEYS.join('|')})\\s*[：:]\\s*(.*)$`);

function parseArgs(argv) {
  const opts = {};
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
    }
  }
  return {
    ledger: opts.ledger,
    report: opts.report,
    now: opts.now,
    json: !!opts.json,
    selfTest: !!(opts['self-test'] || opts.selfTest),
  };
}

/** 解析报告块：任意正文中逐行认七键（半/全角冒号，首现为准）；围栏内行忽略（防示例假块） */
function parseReport(text) {
  const fields = {};
  let inFence = false;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = raw.match(LINE_RE);
    if (m && !(m[1] in fields)) fields[m[1]] = m[2].trim();
  }
  return fields;
}

/** 校验：缺项/空值清单 + 枚举/条件必填错误 */
function validate(fields) {
  const missing = KEYS.filter(k => !(k in fields) || fields[k] === '').map(k => `${k}${k in fields ? '（值为空）' : ''}`);
  const errors = [];
  if ('RESULT' in fields && fields.RESULT && !RESULTS.includes(fields.RESULT)) {
    errors.push(`RESULT 非法（${fields.RESULT}），合法值：${RESULTS.join(' | ')}`);
  }
  if (fields.RESULT === 'NEED-DECISION' && (!('ASK' in fields) || !fields.ASK || fields.ASK === '-')) {
    errors.push('RESULT=NEED-DECISION 时 ASK 必填一行问题（不得为 -）');
  }
  return { missing, errors };
}

const SHA_RE = /[0-9a-fA-F]{7,40}/g;
function shasOf(text) {
  // 至少含一个 a–f 字符才算提交号：纯数字段（时间戳/紧凑日期）不算，防误杀去重
  return [...new Set((String(text).toUpperCase().match(SHA_RE) || []).filter(s => /[A-F]/.test(s)))];
}

/** 同一提交的长短写法互认：全等，或其一（≥7 位）是另一个的前缀 */
function shaMatches(a, b) {
  return a === b || (a.length >= 7 && b.startsWith(a)) || (b.length >= 7 && a.startsWith(b));
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

function escCell(v) {
  return String(v).replace(/\|/g, '\\|');
}

/** 台账表解析：表头含 时间/单号/状态；返回列位映射与行 */
function parseLedgerTable(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) continue;
    const cells = rowCells(lines[i]);
    const find = kw => cells.findIndex(c => c.includes(kw));
    const t = find('时间'),
      n = find('单号'),
      s = find('状态');
    if (t < 0 || n < 0 || s < 0) continue;
    const colMap = { 时间: t, 单号: n, 状态: s, 提交: find('提交'), 报告: find('报告'), 摘要: find('摘要') };
    let end = i;
    for (let j = i + 1; j < lines.length && lines[j].startsWith('|'); j++) end = j;
    const rows = [];
    for (let j = i + 1; j <= end; j++) {
      const cs = rowCells(lines[j]);
      if (cs.every(c => /^[-\s:]*$/.test(c))) continue;
      rows.push({ lineNo: j + 1, ticket: cs[colMap.单号] || '', commits: colMap.提交 >= 0 ? cs[colMap.提交] || '' : '' });
    }
    return { headerIdx: i, insertAfter: end, colMap, headerCells: cells, rows, lines };
  }
  return null;
}

/** 去重：提交号匹配（全等或长短前缀互认）> 单号精确等值（仅 COMMITS 无提交号时） */
function findDuplicate(table, fields) {
  const reportShas = shasOf(fields.COMMITS || '');
  for (const row of table.rows) {
    if (reportShas.length > 0) {
      const rowShas = shasOf(row.commits);
      const hitRow = rowShas.find(rs => reportShas.some(ps => shaMatches(ps, rs)));
      if (hitRow) return { row, by: `提交 ${hitRow} 已在台账第 ${row.lineNo} 行` };
    } else if (row.ticket === (fields.TICKET || '').trim() && row.ticket !== '') {
      return { row, by: `单号「${row.ticket}」已在台账第 ${row.lineNo} 行` };
    }
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
function fmtNow(nowStr) {
  if (nowStr && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(nowStr)) {
    const probe = new Date(nowStr.slice(0, 10) + 'T' + nowStr.slice(11));
    if (Number.isNaN(probe.getTime())) throw new Error(`--now 日期非法：${nowStr}`);
    return nowStr;
  }
  const d = nowStr ? new Date(nowStr) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`--now 无法解析：${nowStr}`);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function clip(s, n) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

/** 生成新行（列位按台账表头名对齐；单元格转义管道符；摘要列缺位或撞列时不写摘要） */
function buildRow(table, fields, nowStr) {
  const cm = table.colMap;
  const need = ['时间', '单号', '状态', '提交', '报告'];
  const lack = need.filter(k => cm[k] === undefined || cm[k] < 0);
  if (lack.length > 0) return { lack };
  const values = {
    [cm.时间]: nowStr,
    [cm.单号]: fields.TICKET,
    [cm.状态]: STATUS_MAP[fields.RESULT],
    [cm.提交]: fields.COMMITS,
    [cm.报告]: fields.EVIDENCE,
  };
  const summary = `报告落账：${clip(fields.TESTS, 50)}｜${clip(fields.REVIEW, 50)}`;
  const summaryCol = cm.摘要 !== undefined && cm.摘要 >= 0 ? cm.摘要 : table.headerCells.length - 1;
  // 摘要只写「未被上面五项占用的列」：五列表头（无摘要列）时留空，绝不覆盖报告列
  if (values[summaryCol] === undefined) values[summaryCol] = summary;
  const cells = table.headerCells.map((_h, idx) => (values[idx] !== undefined ? escCell(values[idx]) : ''));
  return { row: `| ${cells.join(' | ')} |` };
}

/** 主流程（不落盘版，便于自测）：返回 {exit, action, ...} */
function processReport(ledgerPath, reportText, nowStr) {
  const fields = parseReport(reportText);
  const v = validate(fields);
  if (v.missing.length > 0 || v.errors.length > 0) {
    return { exit: 1, action: 'invalid', missing: v.missing, errors: v.errors };
  }
  const ledgerText = fs.readFileSync(ledgerPath, 'utf8');
  const table = parseLedgerTable(ledgerText);
  if (!table) return { exit: 1, action: 'invalid', errors: ['台账中未找到 时间/单号/状态 表头，无表可落'] };
  const dup = findDuplicate(table, fields);
  if (dup) return { exit: 0, action: 'duplicate', by: dup.by, row: `第 ${dup.row.lineNo} 行` };
  const built = buildRow(table, fields, nowStr);
  if (built.lack) return { exit: 1, action: 'invalid', errors: [`台账表头缺列：${built.lack.join('、')}`] };
  const newLines = [...table.lines];
  newLines.splice(table.insertAfter + 1, 0, built.row);
  let out = newLines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return { exit: 0, action: 'appended', row: built.row, text: out, fields };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) process.exit(selfTest());
  if (!opts.ledger || !opts.report) {
    console.error('用法：node report-ledger.mjs --ledger <LEDGER.md> --report <报告块.md> [--now <时间>] [--json] | --self-test');
    process.exit(2);
  }
  for (const f of [opts.ledger, opts.report]) {
    if (!fs.existsSync(f)) {
      console.error(`report-ledger: 文件不存在：${f}`);
      process.exit(2);
    }
  }
  let nowStr;
  try {
    nowStr = fmtNow(opts.now);
  } catch (e) {
    console.error(`report-ledger: ${e.message}`);
    process.exit(2);
  }
  let out;
  try {
    out = processReport(opts.ledger, fs.readFileSync(opts.report, 'utf8'), nowStr);
  } catch (e) {
    console.error(`report-ledger: 处理失败：${e.message}`);
    process.exit(2);
  }
  if (out.action === 'invalid') {
    if (opts.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log('【report-ledger】校验失败（exit 1）');
      for (const m of out.missing || []) console.log(`  ✗ 缺项：${m}`);
      for (const e of out.errors || []) console.log(`  ✗ ${e}`);
    }
    process.exit(1);
  }
  if (out.action === 'duplicate') {
    if (opts.json) console.log(JSON.stringify(out, null, 2));
    else console.log(`【report-ledger】已入账（重复），跳过追加——${out.by}`);
    process.exit(0);
  }
  try {
    fs.writeFileSync(opts.ledger, out.text, 'utf8');
  } catch (e) {
    console.error(`report-ledger: 台账写入失败：${e.message}`);
    process.exit(1);
  }
  if (opts.json) console.log(JSON.stringify({ exit: 0, action: 'appended', row: out.row }, null, 2));
  else {
    console.log('【report-ledger】已追加一行（append-only）：');
    console.log(out.row);
    if (out.fields.RESULT === 'NEED-DECISION') console.log('建议（升级用户）：待裁决——' + clip(out.fields.ASK, 80));
  }
  process.exit(0);
}

/* ---------------- self-test：夹具在系统临时目录，跑完即删 ---------------- */
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ledger-test-'));
  let pass = 0,
    fail = 0;
  const ok = (name, cond) => {
    console.log(`  ${name} 期望 ${cond ? '√' : '×'} → ${cond ? 'PASS' : 'FAIL'}`);
    cond ? pass++ : fail++;
  };
  try {
    const ledger = path.join(tmp, 'LEDGER.md');
    const baseLedger =
      '# 台账\n\n| 时间 | 单号 | 状态 | 提交 | 报告/证据 | 一行摘要 |\n| --- | --- | --- | --- | --- | --- |\n| 2026-11-16 10:00 | T-01 | 派发 | - | - | 派给谁 |\n\n## 未决问题\n\n- 无\n';
    fs.writeFileSync(ledger, baseLedger);
    const goodReport =
      '# 回传\n\nRESULT: DONE\nTICKET: devflow-conductor 批一\nCOMMITS: 717a8d269（wt:done 已收工）\nTESTS: 自测 4 样例绿\nEVIDENCE: docs/handoff/x.md\nREVIEW: 2 个评审子代理，必须修 1 条已修\nASK: -\n';

    // S1 好块：追加成功，行落在表块末尾（未决问题之前）
    let r = processReport(ledger, goodReport, '2026-11-16 11:30');
    fs.writeFileSync(ledger, r.text);
    ok('S1 好块追加 exit 0', r.exit === 0 && r.action === 'appended');
    ok('S1 新行含单号/提交/状态', r.row.includes('devflow-conductor 批一') && r.row.includes('717a8d269') && r.row.includes('已完成'));
    const lines = r.text.split('\n');
    const rowIdx = lines.indexOf(r.row);
    ok('S1 新行在未决问题之前', rowIdx < lines.findIndex(l => l.includes('未决问题')) && lines[rowIdx + 1].trim() === '');

    // S2 幂等：同一报告块再投 → 重复跳过，不追加
    let r2 = processReport(ledger, goodReport, '2026-11-16 11:31');
    ok('S2 重复投递跳过 exit 0', r2.exit === 0 && r2.action === 'duplicate');
    ok('S2 去重按提交号命中', r2.by.toUpperCase().includes('717A8D269'));

    // S3 NEED-DECISION 缺 ASK → exit 1 且清单点名 ASK
    let r3 = processReport(ledger, 'RESULT: NEED-DECISION\nTICKET: T-9\nCOMMITS: aaabbb123\nTESTS: 1 passed\nEVIDENCE: e.md\nREVIEW: 2 个，必须修 0\nASK: -\n', '2026-11-16 11:32');
    ok('S3 NEED-DECISION 缺 ASK exit 1', r3.exit === 1 && r3.errors.some(e => e.includes('ASK')));

    // S4 缺 TESTS 行 → exit 1 缺项清单
    let r4 = processReport(ledger, 'RESULT: DONE\nTICKET: T-9\nCOMMITS: aaabbb124\nEVIDENCE: e.md\nREVIEW: 2 个\nASK: -\n', '2026-11-16 11:33');
    ok('S4 缺 TESTS 行 exit 1', r4.exit === 1 && r4.missing.includes('TESTS'));

    // S5 RESULT 枚举非法 → exit 1
    let r5 = processReport(ledger, 'RESULT: MAYBE\nTICKET: T-9\nCOMMITS: aaabbb125\nTESTS: 1\nEVIDENCE: e.md\nREVIEW: 2\nASK: -\n', '2026-11-16 11:34');
    ok('S5 RESULT 非法 exit 1', r5.exit === 1 && r5.errors.some(e => e.includes('RESULT')));

    // S6 半角冒号 + 正文包裹 + 全角冒号混排可解析
    let r6 = processReport(ledger, '工人只发一次：\nRESULT：DONE\nTICKET:T-10\nCOMMITS:ccccdddeee 说明\nTESTS: 2 passed\nEVIDENCE: -\nREVIEW: 2 个\nASK: -\n', '2026-11-16 11:35');
    fs.writeFileSync(ledger, r6.text);
    ok('S6 宽容格式解析追加', r6.exit === 0 && r6.action === 'appended' && r6.row.includes('T-10'));

    // S7 未提交（COMMITS: -）按单号去重
    let r7 = processReport(ledger, 'RESULT: DONE\nTICKET: T-10\nCOMMITS: -（未提交）\nTESTS: 2 passed\nEVIDENCE: -\nREVIEW: 2 个\nASK: -\n', '2026-11-16 11:36');
    ok('S7 无提交号按单号去重', r7.exit === 0 && r7.action === 'duplicate' && r7.by.includes('T-10'));

    // S8 台账无表 → exit 1 且点名原因
    const noTable = path.join(tmp, 'NOTABLE.md');
    fs.writeFileSync(noTable, '# 只有标题\n\n没有表格。\n');
    let r8 = processReport(noTable, goodReport, '2026-11-16 11:37');
    ok('S8 台账无表 exit 1', r8.exit === 1 && r8.errors.some(e => e.includes('无表可落')));

    // S9 NEED-DECISION 完整块 → 追加且状态待裁决
    let r9 = processReport(ledger, 'RESULT: NEED-DECISION\nTICKET: T-11\nCOMMITS: eeeefff000\nTESTS: 3 passed\nEVIDENCE: e11.md\nREVIEW: 2 个\nASK: 闸门判据 G2 是否已过？\n', '2026-11-16 11:38');
    fs.writeFileSync(ledger, r9.text);
    ok('S9 待裁决落账', r9.exit === 0 && r9.action === 'appended' && r9.row.includes('待裁决'));

    // S10 LF 保持：输出无 CRLF、尾随换行
    ok('S10 LF 与尾随换行', r9.action === 'appended' && !r9.text.includes('\r\n') && r9.text.endsWith('\n'));

    // S11 围栏假块防御：协议手册示例块在 ``` 内被忽略，落账用围栏后的真块
    const fencedReport =
      '协议示例（勿当真）：\n```\nRESULT: DONE\nTICKET: T-EXAMPLE\nCOMMITS: cccddd111\nTESTS: 0\nEVIDENCE: example.md\nREVIEW: 0\nASK: -\n```\n正式报告：\nRESULT: DONE\nTICKET: T-20\nCOMMITS: aaaaaaa11\nTESTS: 1 passed\nEVIDENCE: e20.md\nREVIEW: 2 个\nASK: -\n';
    let r11 = processReport(ledger, fencedReport, '2026-11-16 12:00');
    fs.writeFileSync(ledger, r11.text);
    ok('S11 围栏假块被忽略', r11.exit === 0 && r11.action === 'appended' && r11.row.includes('T-20') && !r11.row.includes('T-EXAMPLE'));

    // S12 五列表头（无摘要列）：报告列不被摘要覆盖
    const fiveCol = path.join(tmp, 'FIVE.md');
    fs.writeFileSync(fiveCol, '# 台账\n\n| 时间 | 单号 | 状态 | 提交 | 报告 |\n| --- | --- | --- | --- | --- |\n| 2026-11-16 10:00 | T-1 | 派发 | - | - |\n');
    let r12 = processReport(fiveCol, 'RESULT: DONE\nTICKET: T-21\nCOMMITS: bbbbbb22\nTESTS: 1\nEVIDENCE: evidence/real.md\nREVIEW: 2\nASK: -\n', '2026-11-16 12:01');
    ok('S12 五列表保报告列', r12.exit === 0 && r12.action === 'appended' && r12.row.includes('evidence/real.md') && r12.row.split('|').length === 7);

    // S13 值含管道符：写入侧转义，按转义语义切列仍 6 列（六列表才写摘要列）
    let r13 = processReport(ledger, 'RESULT: DONE\nTICKET: T-22\nCOMMITS: dddddd33\nTESTS: a | b\nEVIDENCE: e22.md\nREVIEW: 2\nASK: -\n', '2026-11-16 12:02');
    fs.writeFileSync(ledger, r13.text);
    ok('S13 管道符转义不破表', r13.exit === 0 && r13.row.includes('a \\| b') && rowCells(r13.row).length === 6);

    // S14 纯数字段（时间戳）不算提交号，不误判 duplicate
    const tsLedger = path.join(tmp, 'TS.md');
    fs.writeFileSync(tsLedger, '# 台账\n\n| 时间 | 单号 | 状态 | 提交 | 报告/证据 | 一行摘要 |\n| --- | --- | --- | --- | --- | --- |\n| 2026-11-16 | T-30 | ✅ 已收账 | 1763059200 | a.md | x |\n');
    let r14 = processReport(tsLedger, 'RESULT: DONE\nTICKET: T-31\nCOMMITS: 1763059200（时间戳标注）\nTESTS: 1\nEVIDENCE: b.md\nREVIEW: 2\nASK: -\n', '2026-11-16 12:03');
    ok('S14 纯数字不当提交号', r14.exit === 0 && r14.action === 'appended');

    // S15 短 sha 前缀互认：台账 717a8d269，重复投递 717a8d2 → 仍判重
    const pfLedger = path.join(tmp, 'PF.md');
    fs.writeFileSync(pfLedger, '# 台账\n\n| 时间 | 单号 | 状态 | 提交 | 报告/证据 | 一行摘要 |\n| --- | --- | --- | --- | --- | --- |\n| 2026-11-16 | T-40 | ✅ 已收账 | 717a8d269 | a.md | x |\n');
    let r15 = processReport(pfLedger, 'RESULT: DONE\nTICKET: T-41\nCOMMITS: 717a8d2\nTESTS: 1\nEVIDENCE: b.md\nREVIEW: 2\nASK: -\n', '2026-11-16 12:04');
    ok('S15 长短 sha 前缀互认去重', r15.exit === 0 && r15.action === 'duplicate');

    // S16 --now 直通格式日期非法 → CLI 拒绝（exit 2）
    const nowBad = path.join(tmp, 'now-bad.md');
    fs.writeFileSync(nowBad, goodReport);
    let cliCode = 0;
    try {
      execFileSync(process.execPath, [process.argv[1], '--ledger', ledger, '--report', nowBad, '--now', '9999-99-99 99:99'], { stdio: 'pipe' });
    } catch (e) {
      cliCode = e.status;
    }
    ok('S16 --now 非法日期 CLI exit 2', cliCode === 2);

    console.log(fail === 0 ? '结论：SELF-TEST PASS' : `结论：SELF-TEST FAIL（${fail} 项）`);
    return fail === 0 ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();

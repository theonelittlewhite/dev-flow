#!/usr/bin/env node
/**
 * 工单销单机检 v2（dev-flow 硬门禁；销单/完成评审/验收/发布前置）。
 *
 * 硬门禁项：
 *   0. 状态行规范：`**状态**` 行首 token 只能是 pending|in-progress|done|blocked|cancelled；
 *      中文说明放括号或后续。✅/ready-for-agent 等非规范写法直接判红（不再静默跳过）。
 *   1. 扫描范围：工单文件名 T-<数字>[字母数字后缀]（T-13A/T-13B1/T-13B2 均入扫描）；
 *      形如 T-*.md 但不合规范的文件判红（防静默漏扫）。
 *   2. 勾选核验：状态 done 的工单，验收清单必须全勾且至少一项（自签收防线）。
 *   3. 自签收拦截：把状态行翻成 done 的提交，不得是 feat/fix 提交、不得触碰代码文件
 *      （销单必须是独立 docs/chore 收口提交；非 git 目录自动跳过本检查）。
 *   4. 设计决策落点：每个工单「覆盖」行引用的 D-ID，必须在 traceability.md
 *      「设计决策映射」节有一行落点（决策正本/兑现工单/证据）；未兑现且未登记
 *      design-deviation.md = 红。缺映射节 = 红。
 *   5. 状态同步：issue 状态行 ↔ tasks.md 索引行 ↔ traceability.md AC/决策行，
 *      不一致 = 红（done 工单不得对应 ⬜/planned 索引行）。
 *   6. 豁免来源：issue-audit 豁免必须带独立评审/档案会话签名（「独立重签」等）
 *      与存在可查的报告路径；无签名/路径不存在 = 红（工人自写豁免无效）。
 *   7. 设计文档白名单：docs/design/**\/*.yaml|yml（.dev-flow.json 的
 *      audit.designDocGlobs 可显式覆盖）不计入「触碰代码」；其他白名单走
 *      audit.allowNonCodeGlobs 显式配置。
 *   8. 时记新鲜度硬拦（仅 --phase final-review；staged/tickets 不查，避免拦日常提交）：
 *      specs/<feature>/state.json 的 taskchron.lastSyncedAt 若早于该 feature 最新销单
 *      提交（状态翻 done 的提交，按提交时间绝对时间比较）→ 红「时记过期」——
 *      先刷新所属环节/父任务备注并写回 lastSyncedAt。块/字段缺失、taskchron.mode=off
 *      或无可考销单提交 → 跳过（不误伤旧 feature）。纯离线 git/state 判定，不要求
 *      TaskChron MCP 可达，也不参与 mode=off 项目的新鲜度判定。
 *   9. 澄清记录（tickets/final-review/acceptance/release，所有带工单的 feature）：
 *      state.tier=M/L 时 spec.md 必须含「## 澄清记录」；L 档方式必须是
 *      dev-flow-grill-with-docs（缺记录/方式不符 = 红）；M 档缺记录仅告警；
 *      S 档或无有效 tier → 跳过。
 *
 * 用法：
 *   node issue-audit.mjs [--root <项目根>] [--feature <name>]
 *                        [--phase tickets|final-review|acceptance|release] [--json]
 *   不给 --feature 时扫全部 specs/<feature>/issues/ 下工单。
 *   --phase 决定附加门禁：
 *     tickets      = 结构门禁（状态行/扫描范围/索引/映射节落点），不要求验收清单勾选
 *     final-review = 默认；全部销单门禁（含勾选/自签收/豁免/落地状态）
 *     acceptance   = 全部工单 done/cancelled、AC 行 done、acceptance.md 存在
 *     release      = acceptance + state.json gates.userAccepted=true 且 stage=done
 * 退出码：0 = 全绿（可有警告）；1 = 有红；2 = 参数错误。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const STATUSES = ['pending', 'in-progress', 'done', 'blocked', 'cancelled'];
const TRACE_STATUSES = ['planned', 'in-progress', 'done', 'blocked'];
const STATUS_HINTS = {
  'ready-for-agent': 'triage 状态不是工单状态；未开工写 pending',
  closed: '已取消写 cancelled',
  doing: '进行中写 in-progress',
  todo: '待开工写 pending',
  '✅': '状态值写 done，中文说明放括号（如 done（说明））',
  '⬜': '待开工写 pending',
  '🔄': '进行中写 in-progress',
  '⛔': '阻塞写 blocked',
};
// 索引/追溯表的图例映射：历史工单索引允许图示写法，但状态口径必须与 issue 行一致。
const INDEX_EMOJI = {
  '⬜': 'pending',
  '🔄': 'in-progress',
  '✅': 'done',
  '⛔': 'blocked',
  '❌': 'cancelled',
  '🚫': 'cancelled',
  '⊘': 'cancelled',
};

// T-01 / T-13A / T-13B1 / T-13B2 / T-13A1B2；首字母后缀必须大写，保持工单号唯一口径。
const ISSUE_FILE_RE = /^T-\d+(?:[A-Z]\d*)*\.md$/;
const TICKET_ID_RE = /\bT-\d+(?:[A-Z]\d*)*\b/g;
const TICKET_ID_ONE_RE = /\bT-\d+(?:[A-Z]\d*)*\b/;
const DID_RE = /\bD-?(\d+)\b/g;
const didKey = num => `D${parseInt(num, 10)}`;

const WAIVER_MARKER_RE = /(独立重签|独立评审|独立重评审|独立复核|档案会话|检查员会话)/;
const REPORT_PATH_RE = /`([^`]+\.(?:md|json|txt|ya?ml|csv|log|html))`|\b([A-Za-z0-9_./\\-]+\.(?:md|json|txt|ya?ml|csv|log|html))\b/gi;
const REPORT_LIKE_RE = /evidence\/|review|report|复核|评审/i;
const CLARIFICATION_HEADING_RE = /^#{2,4}\s*澄清记录\s*$/m;
const CLARIFICATION_METHOD_RE = /(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?方式(?:\*\*)?\s*[:：]\s*([^\n]+)/;

function parseArgs(argv) {
  const o = { root: process.cwd(), feature: null, phase: 'final-review', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') o.root = path.resolve(argv[++i]);
    else if (a === '--feature') o.feature = argv[++i];
    else if (a === '--phase') o.phase = argv[++i];
    else if (a === '--json') o.json = true;
    else {
      console.error(`issue-audit: 未知参数 ${a}`);
      process.exit(2);
    }
  }
  if (!['tickets', 'final-review', 'acceptance', 'release'].includes(o.phase)) {
    console.error(`issue-audit: --phase 只允许 tickets|final-review|acceptance|release，收到 ${o.phase}`);
    process.exit(2);
  }
  return o;
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function statusHint(token) {
  return STATUS_HINTS[token] || `只允许 ${STATUSES.join('|')}；中文说明放括号或后续`;
}

// 解析 spec.md 的「澄清记录」小节：返回 null=缺节；method 为方式行里的值。
function parseClarificationRecord(text) {
  if (!text) return null;
  const heading = CLARIFICATION_HEADING_RE.exec(text);
  if (!heading) return null;
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^#{2,4}\s+\S/m.exec(rest);
  const section = next ? rest.slice(0, next.index) : rest;
  const methodMatch = CLARIFICATION_METHOD_RE.exec(section);
  const method = methodMatch ? methodMatch[1].replace(/[`*]/g, '').trim() : '';
  return { section: section.trim(), method };
}

// 澄清记录门禁：L 档缺记录/方式不符 = 红；M 档缺记录 = 告警；S/无档位 = 跳过。
function checkClarificationRecord(root, feature, { red, warn, note }) {
  let state = null;
  try {
    state = JSON.parse(readText(path.join(root, 'specs', feature, 'state.json')) || 'null');
  } catch {
    state = null;
  }
  const tier = String(state?.tier || '').toUpperCase();
  if (tier !== 'M' && tier !== 'L') {
    if (tier !== 'S') note(`${feature}：state.json 无有效 tier，跳过澄清记录检查`);
    return;
  }
  const record = parseClarificationRecord(readText(path.join(root, 'specs', feature, 'spec.md')));
  if (!record) {
    if (tier === 'L') {
      red(
        `${feature}：L 档 spec.md 缺「## 澄清记录」——L 档必须走 dev-flow-grill-with-docs，并记录方式/关键决策/未决项（需求阶段门禁）`
      );
    } else {
      warn(
        `${feature}：M 档 spec.md 缺「## 澄清记录」——建议补记方式/关键决策/未决项（L 档会硬拦）`
      );
    }
    return;
  }
  if (tier === 'L' && !record.method.includes('dev-flow-grill-with-docs')) {
    red(
      `${feature}：L 档澄清记录方式「${record.method || '缺失'}」不合规——L 档必须走 dev-flow-grill-with-docs（重定向副本），不得用 brainstorming/direct 代替`
    );
  }
}

// 状态行首 token：done / done（说明）/ done(说明) / pending （说明）均取第一个词。
function parseIssueStatus(text) {
  const m = text.match(/^\s*\*\*状态\*\*\s*[:：]\s*(.*)$/m);
  if (!m) return { found: false, raw: null, token: null, ok: false };
  const raw = m[1].trim();
  const token = (raw.split(/[\s（(，,；;:：、]/u)[0] || '').replace(/^\*\*|\*\*$/g, '');
  return { found: true, raw, token, ok: STATUSES.includes(token) };
}

function normalizeIndexStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return { token: null, raw: s };
  const first = [...s][0];
  if (INDEX_EMOJI[first]) return { token: INDEX_EMOJI[first], raw: s };
  const m = s.match(/^(planned|in-progress|done|blocked|cancelled|pending)\b/i);
  return m ? { token: m[1].toLowerCase(), raw: s } : { token: null, raw: s };
}

function normalizeTraceStatus(raw) {
  const norm = normalizeIndexStatus(raw);
  if (norm.token && TRACE_STATUSES.includes(norm.token)) return norm;
  if (norm.token === 'pending') return { token: 'planned', raw: norm.raw };
  return norm;
}

function claimDids(text) {
  const dids = new Set();
  for (const line of text.split('\n')) {
    if (/^[ \t]*(?:-\s*)?\*{0,2}覆盖\*{0,2}\s*[:：]/.test(line) && !/epic/i.test(line.split(/[:：]/)[0] || '')) {
      for (const m of line.matchAll(DID_RE)) dids.add(didKey(m[1]));
    }
  }
  return dids;
}

function extractDids(text) {
  return [...new Set([...String(text || '').matchAll(DID_RE)].map(m => didKey(m[1])))];
}

function extractTicketIds(text) {
  return [...new Set([...String(text || '').matchAll(TICKET_ID_RE)].map(m => m[0]))];
}

function isMeaningful(text) {
  const s = String(text || '').trim();
  return s !== '' && !/^[-—–_/\s]+$/.test(s) && !/^(无|待补|待定|TBD|todo|n\/a)$/i.test(s);
}

function looksLikePath(text) {
  return /(?:`[^`]+`|\b[\w./-]+\.(?:md|json|txt|ya?ml|csv|log|html)\b|\b[\w-]+\/[\w./-]+)/.test(
    String(text || '')
  );
}

function globToRegExp(glob) {
  const g = String(glob).replace(/\\/g, '/');
  let out = '^';
  for (let i = 0; i < g.length; i += 1) {
    const ch = g[i];
    if (ch === '*') {
      if (g[i + 1] === '*') {
        i += 1;
        if (g[i + 1] === '/') {
          i += 1;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${out}$`);
}

function matchesAny(globs, relPath) {
  const rel = String(relPath).replace(/\\/g, '/');
  return globs.some(glob => globToRegExp(glob).test(rel));
}

function defaultDesignDocGlobs(profile) {
  const dir = String((profile && profile.docs && profile.docs.design) || 'docs/design')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  return [`${dir}/**/*.yaml`, `${dir}/**/*.yml`];
}

// 显式配置：.dev-flow.json 的 audit 段；未配置时设计文档默认白名单为 docs/design 下 yaml/yml。
function loadAuditConfig(root) {
  let profile = null;
  try {
    profile = JSON.parse(fs.readFileSync(path.join(root, '.dev-flow.json'), 'utf8'));
  } catch {
    profile = null;
  }
  const audit = profile && typeof profile.audit === 'object' && profile.audit ? profile.audit : {};
  const designDocGlobs = Array.isArray(audit.designDocGlobs)
    ? audit.designDocGlobs.filter(item => typeof item === 'string' && item.trim())
    : defaultDesignDocGlobs(profile);
  const allowNonCodeGlobs = Array.isArray(audit.allowNonCodeGlobs)
    ? audit.allowNonCodeGlobs.filter(item => typeof item === 'string' && item.trim())
    : [];
  return { designDocGlobs, allowNonCodeGlobs };
}

function isAllowedNonCode(relPath, auditCfg) {
  const rel = String(relPath).replace(/\\/g, '/');
  if (rel.endsWith('.md')) return true;
  if (/^specs\/[^/]+\/evidence\//.test(rel)) return true;
  if (/^specs\/[^/]+\/state\.json$/.test(rel)) return true;
  return matchesAny(auditCfg.designDocGlobs, rel) || matchesAny(auditCfg.allowNonCodeGlobs, rel);
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(cell => cell.trim());
}

function parseTables(text) {
  const tables = [];
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.trim().startsWith('|')) {
      if (!current) {
        current = { lines: [] };
        tables.push(current);
      }
      current.lines.push(line.trim());
    } else {
      current = null;
    }
  }
  return tables.map(table => {
    const rows = table.lines.map(splitTableRow);
    const separator = rows.findIndex(cells => cells.every(cell => /^:?-{3,}:?$/.test(cell)));
    let header;
    let body;
    if (separator === 0) {
      header = rows[1] || [];
      body = rows.slice(2);
    } else if (separator > 0) {
      header = rows[0];
      body = rows.slice(separator + 1);
    } else {
      header = rows[0] || [];
      body = rows.slice(1);
    }
    return { header, body };
  });
}

function splitSections(text) {
  const sections = [];
  let current = { heading: '', lines: [] };
  sections.push(current);
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      current = { heading: m[1].trim(), lines: [] };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return sections;
}

function parseTasksIndex(text) {
  const map = new Map();
  if (!text) return { found: false, map };
  const candidates = parseTables(text)
    .map(table => ({
      table,
      ticketCol: table.header.findIndex(h => /工单/.test(h)),
      statusCol: table.header.findIndex(h => /状态/.test(h)),
    }))
    .filter(item => item.ticketCol >= 0 && item.statusCol >= 0);
  if (!candidates.length) return { found: false, map };
  // 优先模板索引（带「标题」或「Blocked by」列），避免误选批次统计表。
  const chosen =
    candidates.find(
      item =>
        item.table.header.some(h => /标题/.test(h)) || item.table.header.some(h => /Blocked/i.test(h))
    ) || candidates[0];
  for (const row of chosen.table.body) {
    const id = (row[chosen.ticketCol] || '').match(TICKET_ID_ONE_RE);
    if (!id || map.has(id[0])) continue;
    const norm = normalizeIndexStatus(row[chosen.statusCol] || '');
    map.set(id[0], { raw: (row[chosen.statusCol] || '').trim(), token: norm.token });
  }
  return { found: true, map };
}

function parseTraceability(text) {
  const result = { acRows: [], mapping: new Map(), mappingFound: false };
  if (!text) return result;
  const sections = splitSections(text);
  const mappingSections = sections.filter(section => /设计决策映射/.test(section.heading));
  result.mappingFound = mappingSections.length > 0;

  for (const table of parseTables(text)) {
    const acCol = table.header.findIndex(h => /^AC[-–—]?\d+/i.test(h) || /^(AC|验收)\b/i.test(h));
    const ticketCol = table.header.findIndex(h => /工单/.test(h));
    const statusCol = table.header.findIndex(h => /状态/.test(h));
    if (acCol < 0 || ticketCol < 0 || statusCol < 0) continue;
    for (const row of table.body) {
      const ac = (row[acCol] || '').trim();
      if (!/^AC[-–—]?\d+/i.test(ac)) continue;
      result.acRows.push({
        ac,
        ticketText: row[ticketCol] || '',
        tickets: extractTicketIds(row[ticketCol] || ''),
        statusRaw: (row[statusCol] || '').trim(),
        statusToken: normalizeTraceStatus(row[statusCol] || '').token,
      });
    }
  }

  for (const section of mappingSections) {
    for (const table of parseTables(section.lines.join('\n'))) {
      const didCol = table.header.findIndex(h => /D-?ID|决策\s*ID/i.test(h));
      if (didCol < 0) continue;
      for (const row of table.body) {
        const ids = extractDids(row[didCol] || '');
        if (!ids.length) continue;
        const landingCells = row
          .map((cell, index) => ({ cell, header: table.header[index] || '', index }))
          .filter(item => item.index > didCol);
        const landingText = landingCells.map(item => item.cell).join(' | ');
        const tickets = extractTicketIds(landingText);
        const decisionSource = landingCells.some(
          item => /决策正本|决策来源|正本/.test(item.header) && isMeaningful(item.cell)
        );
        const evidenceCell = landingCells.find(item => /证据/.test(item.header));
        const evidenceText = evidenceCell ? evidenceCell.cell : '';
        // 「证据/状态」合列里写 planned/待补 不算证据；必须像路径或明确 done。
        const evidence =
          (isMeaningful(evidenceText) &&
            !/^\s*(planned|pending|blocked|待补|待定|待裁决|未兑现|TBD)\b/i.test(evidenceText)) ||
          looksLikePath(landingText);
        const statusCell = landingCells.find(item => /状态/.test(item.header));
        const statusToken = statusCell ? normalizeTraceStatus(statusCell.cell).token : null;
        const info = {
          tickets,
          decisionSource,
          evidence,
          statusToken,
          landedAny: tickets.length > 0 || decisionSource || evidence || statusToken === 'done',
        };
        for (const id of ids) result.mapping.set(id, info);
      }
    }
  }
  return result;
}

function parseDeviations(text) {
  const ok = new Set();
  const pending = new Set();
  if (!text) return { ok, pending };
  for (const line of String(text).split(/\r?\n/)) {
    // 只认表格登记行，避免模板用法说明里提到的 D-ID 被误当成「已裁决」。
    if (!line.trim().startsWith('|')) continue;
    const ids = extractDids(line);
    if (!ids.length) continue;
    const target = /待裁决/.test(line) ? pending : ok;
    for (const id of ids) target.add(id);
  }
  for (const id of ok) pending.delete(id);
  return { ok, pending };
}

// 豁免行必须在工单「## 历史」段内，且带独立评审/档案会话签名 + 可查报告路径。
function findWaiver(text) {
  const head = text.match(/^##\s*历史[^\n]*$/m);
  if (!head) return null;
  const after = text.slice(head.index + head[0].length);
  const next = after.match(/^##\s/m);
  const section = next ? after.slice(0, next.index) : after;
  const m = section.match(/^\s*-\s*issue-audit 豁免[:：]\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function validateWaiver(root, feature, issueFile, line) {
  const marker = line.match(WAIVER_MARKER_RE);
  if (!marker) {
    return { ok: false, reason: '缺独立评审/档案会话签名（须含「独立重签」等标记，仅限独立评审/档案会话写入）' };
  }
  const paths = [];
  for (const m of line.matchAll(REPORT_PATH_RE)) {
    const p = (m[1] || m[2] || '').replace(/\\/g, '/');
    if (p) paths.push(p);
  }
  const candidates = [...new Set(paths)].filter(
    p => !/(^|\/)issues\//.test(p) && !/(^|\/)(tasks|traceability|state)\.(md|json)$/.test(p)
  );
  if (candidates.length === 0) {
    return { ok: false, reason: '缺可查的报告路径（如 specs/<feature>/review-final.md 或 evidence/*.md）' };
  }
  for (const p of candidates) {
    if (!REPORT_LIKE_RE.test(p)) continue;
    for (const abs of path.isAbsolute(p) ? [p] : [path.join(root, p), path.join(root, 'specs', feature, p)]) {
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      if (path.resolve(abs) === path.resolve(issueFile)) continue;
      return { ok: true, source: `${marker[1]}：${p}` };
    }
  }
  return { ok: false, reason: `报告路径不存在或不像独立评审报告（${candidates.slice(0, 3).join('、')}）` };
}

function gitAvailable(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === 'true';
}

// —— 翻单提交检索（批量索引 + --follow 回退）——
// 批量索引是默认路径：把「每工单一次 git log --follow -p」（大仓实测 8–16s/文件，
// 76 工单全量 final-review 要 10–20 分钟）压成 2 次并行走查 + 1 次批量 name-only：
//   A. 补丁走查（一次）：git log -p --unified=0 -M -G'<超集正则>' -- specs/ ——
//      拿全 specs 历史里动过状态行的提交，逐行用与回退路径完全相同的判定正则
//      （FLIP_LINE_RE）找「+状态 done」，按补丁当时的路径归档；
//   B. 重命名走查（一次，全仓、不带 pathspec——pathspec 会把 src 在 specs 外的
//      重命名过滤成纯新增，丢掉 --follow 的改名跟随范围）：建「现路径 → 历史路径」
//      改名链，等价 --follow 的跟随语义（同用 -M 默认相似度阈值）；
//   C. 触碰文件批查（一次）：全部翻单 hash 一把 git log --no-walk --stdin
//      --name-only，替代逐 hash git show（大仓实测 0.9s × 70+ ≈ 1 分钟 → ~4s）。
// A 或 B 失败 → 该 root 整体回退逐文件 --follow（慢，结论不缩水）；某工单的
// 改名链触及 specs/ 之外的历史路径（A 的 pathspec 没覆盖）→ 该文件单独回退。
// 所有走查只读（log/show），并显式 core.quotePath=false——路径原样输出，
// 不随被审仓库本地配置漂移（中文 feature 路径若被八进制转义会误判成触碰代码）。
const FLIP_LINE_RE = /^\+\*\*状态\*\*[:：]\s*done/i;
// -G 预过滤用 POSIX ERE（没有 \s 和大小写标志，大小写要手写矩阵）：只筛提交，
// 是否翻单仍由 FLIP_LINE_RE 逐行说了算，故只需是它的超集。
const FLIP_PREFILTER = '\\*\\*状态\\*\\*.*[dD][oO][nN][eE]';

function gitCapture(root, args, timeoutMs) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn('git', ['-c', 'core.quotePath=false', '-C', root, ...args], { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok && out.length <= 64 * 1024 * 1024 ? out : null);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* 已退出 */
      }
      finish(false);
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      out += chunk;
    });
    child.stderr.on('data', () => {}); // 消费掉 stderr，防缓冲塞满卡死
    child.on('error', () => finish(false));
    child.on('close', code => finish(code === 0));
  });
}

// 补丁走查解析：按 `+++ b/<path>` 归属 +行；换行格式与逐行判定同旧实现语义。
function parsePatchWalk(text) {
  const flipsByPath = new Map();
  let commit = null;
  let curPath = null;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const head = /^commit ([0-9a-f]{7,40}) (\S{4,}) (.*)$/.exec(line);
    if (head) {
      const timeMs = Date.parse(head[2]);
      commit = {
        hash: head[1],
        date: head[2],
        timeMs: Number.isFinite(timeMs) ? timeMs : null,
        subject: head[3],
      };
      curPath = null;
      continue;
    }
    if (line.startsWith('+++')) {
      const m = /^\+\+\+ b\/(.+)$/.exec(line);
      curPath = m ? m[1] : null; // /dev/null（删除）等无归属 → 跳过后续 + 行
      continue;
    }
    if (commit && curPath && FLIP_LINE_RE.test(line)) {
      if (!flipsByPath.has(curPath)) flipsByPath.set(curPath, []);
      flipsByPath.get(curPath).push(commit);
    }
  }
  return flipsByPath;
}

// 重命名走查解析：R<相似度>\t旧\t新 → 新路径的历史父名集合（可多父：分支上多次改名）。
function parseRenameWalk(text) {
  const parents = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const m = /^R\d+\t(.+)\t(.+)$/.exec(line);
    if (!m) continue;
    if (!parents.has(m[2])) parents.set(m[2], new Set());
    parents.get(m[2]).add(m[1]);
  }
  return parents;
}

async function buildFlipIndex(root) {
  const [patchText, renameText] = await Promise.all([
    gitCapture(
      root,
      ['log', '-p', '--unified=0', '-M', `-G${FLIP_PREFILTER}`, '--format=commit %H %cI %s', '--', 'specs/'],
      300000
    ),
    gitCapture(root, ['log', '--name-status', '--diff-filter=R', '-M', '--format=%H'], 300000),
  ]);
  // A/B 任一失败都无法保证与 --follow 等价（B 挂了等于丢改名链）→ 整体回退。
  if (patchText === null || renameText === null) {
    return { ok: false, reason: patchText === null ? 'patch-walk' : 'rename-walk' };
  }
  const idx = {
    ok: true,
    flipsByPath: parsePatchWalk(patchText),
    renameParents: parseRenameWalk(renameText),
  };
  // C：批量预取全部翻单 hash 的触碰文件（失败不致命：commitTouchesCode 逐 hash 回退）。
  const hashes = new Set();
  for (const list of idx.flipsByPath.values()) for (const flip of list) hashes.add(flip.hash);
  if (hashes.size) {
    const r = spawnSync(
      'git',
      ['-c', 'core.quotePath=false', '-C', root, 'log', '--no-walk', '--stdin', '--name-only', '--format=%H'],
      { encoding: 'utf8', input: [...hashes].join('\n'), maxBuffer: 64 * 1024 * 1024 }
    );
    if (r.status === 0) {
      let hash = null;
      for (const raw of String(r.stdout).split('\n')) {
        const t = raw.trim();
        if (/^[0-9a-f]{40}$/.test(t)) hash = t;
        else if (t && hash) {
          if (!commitFilesByHash.has(hash)) commitFilesByHash.set(hash, []);
          commitFilesByHash.get(hash).push(t);
        }
      }
    }
  }
  return idx;
}

const flipIndexCache = new Map(); // root → 索引（ok:false 即回退）
async function ensureFlipIndex(root) {
  if (!flipIndexCache.has(root)) flipIndexCache.set(root, await buildFlipIndex(root));
  return flipIndexCache.get(root);
}

// 回退路径：逐文件 --follow（语义基准；批量走查失败/改名链出 specs 时使用）。
// 收集全部翻 done 块（防洗单——feat 翻 done 再回滚再翻也拦）；
// 附带提交时间（committer date，%cI 带时区），供时记新鲜度比对。
function findDoneFlippingCommitsFollow(root, relFile) {
  const r = spawnSync(
    'git',
    ['-c', 'core.quotePath=false', '-C', root, 'log', '--follow', '-p', '--format=commit %H %cI %s', '--', relFile],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (r.status !== 0) return null; // git 不可用/文件未跟踪 → 跳过
  const blocks = r.stdout.split(/^commit /m).filter(Boolean);
  const flips = [];
  for (const b of blocks) {
    if (/\n\+\*\*状态\*\*[:：]\s*done/i.test(b)) {
      const head = b.split('\n', 1)[0] || '';
      const [hash, date, ...subjectParts] = head.split(' ');
      const timeMs = date ? Date.parse(date) : NaN;
      flips.push({
        hash,
        date: date || null,
        timeMs: Number.isFinite(timeMs) ? timeMs : null,
        subject: subjectParts.join(' '),
      });
    }
  }
  return flips; // 全部翻 done 提交（空数组 = 初始即 done）
}

const flipCache = new Map(); // 回退路径的按文件缓存
function flipsForFollow(root, relFile) {
  const key = `${root}\u0000${relFile}`;
  if (!flipCache.has(key)) flipCache.set(key, findDoneFlippingCommitsFollow(root, relFile));
  return flipCache.get(key);
}

function flipsFor(root, relFile) {
  const idx = flipIndexCache.get(root);
  if (!idx || !idx.ok) return flipsForFollow(root, relFile);
  // 改名链回溯：现路径 → 全部历史路径（含多次改名链）；链上一旦出现 specs/ 外
  // 路径（补丁走查没覆盖到该路径的历史）→ 该文件整体回退 --follow，保结论等价。
  const seen = new Set([relFile]);
  const queue = [relFile];
  const flips = [];
  while (queue.length) {
    const p = queue.pop();
    if (!p.startsWith('specs/')) return flipsForFollow(root, relFile);
    const olds = idx.renameParents.get(p);
    if (olds) for (const old of olds) if (!seen.has(old)) { seen.add(old); queue.push(old); }
    const list = idx.flipsByPath.get(p);
    if (list) flips.push(...list);
  }
  const byHash = new Set();
  flips.sort((a, b) => (b.timeMs ?? -1) - (a.timeMs ?? -1));
  const merged = [];
  for (const flip of flips) {
    if (byHash.has(flip.hash)) continue; // 同一提交经多条历史路径命中只算一次
    byHash.add(flip.hash);
    merged.push(flip);
  }
  return merged; // 全部翻 done 提交（空数组 = 无已提交翻单）
}

const commitFilesByHash = new Map(); // C 走查批量预取：hash → 触碰文件列表
function commitTouchesCode(root, hash, auditCfg) {
  let files = commitFilesByHash.get(hash);
  if (!files) {
    const r = spawnSync('git', ['-c', 'core.quotePath=false', '-C', root, 'show', '--name-only', '--format=', hash], {
      encoding: 'utf8',
    });
    if (r.status !== 0) return { codeFiles: [], unknown: true };
    files = r.stdout
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    commitFilesByHash.set(hash, files);
  }
  const codeFiles = files.filter(f => !isAllowedNonCode(f, auditCfg));
  return { codeFiles, unknown: false };
}

function listFeatures(root, feature) {
  const specsDir = path.join(root, 'specs');
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && (!feature || d.name === feature))
    .map(d => d.name)
    .sort();
}

function collectFeature(root, feature) {
  const issueDir = path.join(root, 'specs', feature, 'issues');
  const issues = [];
  const unrecognized = [];
  if (!fs.existsSync(issueDir)) return { issues, unrecognized };
  for (const entry of fs.readdirSync(issueDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (ISSUE_FILE_RE.test(entry.name)) {
      const file = path.join(issueDir, entry.name);
      issues.push({ feature, id: entry.name.slice(0, -3), file, text: readText(file) });
    } else if (/^T-.*\.md$/i.test(entry.name)) {
      // 形如 T-*.md 但不合规范：绝不能静默跳过（坑 0-9 教训）。
      unrecognized.push(entry.name);
    }
  }
  return { issues, unrecognized };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = opts.root;
  const features = listFeatures(root, opts.feature);
  if (opts.feature && features.length === 0) {
    console.error(`issue-audit: 找不到 specs/${opts.feature}/（--feature 拼写或目录不存在）`);
    process.exit(2);
  }
  const reds = [];
  const warns = [];
  const notes = [];
  const seen = new Set();
  const add = (arr, msg) => {
    if (!seen.has(msg)) {
      seen.add(msg);
      arr.push(msg);
    }
  };
  const red = msg => add(reds, msg);
  const warn = msg => add(warns, msg);
  const note = msg => add(notes, msg);
  const useGit = gitAvailable(root);
  const auditCfg = loadAuditConfig(root);
  const phase = opts.phase;
  const requireDoneChecks = phase !== 'tickets';
  let issueCount = 0;

  // 翻单批量索引：销单/新鲜度门禁要查 git 历史时才建（A/B 并行走查 + C 批量
  // name-only；失败自动回退逐文件 --follow，见 flipsFor）。
  if (useGit && requireDoneChecks) {
    const idx = await ensureFlipIndex(root);
    if (!idx.ok) {
      note(`git 翻单批量走查失败（${idx.reason}），回退逐文件 --follow 检索（慢，结论口径不变）`);
    }
  }

  for (const feature of features) {
    const { issues, unrecognized } = collectFeature(root, feature);
    if (!issues.length && !unrecognized.length) continue;
    issueCount += issues.length;
    checkClarificationRecord(root, feature, { red, warn, note });
    for (const file of unrecognized) {
      red(`${feature}/${file}：工单文件名不合规（须为 T-<数字>[字母数字后缀].md，如 T-13B1.md）——未进扫描，先改名`);
    }

    const issuesById = new Map(issues.map(issue => [issue.id, issue]));
    const tagOf = issue => `${feature}/${issue.id}`;

    // 1) 状态行规范（所有工单，不论状态）
    for (const issue of issues) {
      const tag = tagOf(issue);
      if (issue.text === null) {
        red(`${tag}：工单文件不可读`);
        issue.status = null;
        issue.claimed = new Set();
        issue.waiver = null;
        issue.waiverCheck = null;
        continue;
      }
      const status = parseIssueStatus(issue.text);
      issue.status = status.ok ? status.token : null;
      issue.claimed = claimDids(issue.text);
      issue.waiver = findWaiver(issue.text);
      issue.waiverCheck = issue.waiver ? validateWaiver(root, feature, issue.file, issue.waiver) : null;
      if (!status.found) {
        red(`${tag}：缺 **状态** 行——唯一格式：**状态**：pending|in-progress|done|blocked|cancelled（说明放括号）`);
      } else if (!status.ok) {
        red(`${tag}：状态行首 token「${status.token || status.raw}」不合规——${statusHint(status.token)}`);
      }
      if (issue.waiver && !issue.waiverCheck.ok) {
        red(`${tag}：issue-audit 豁免无效——${issue.waiverCheck.reason}（工人自写豁免不得降级）`);
      }
    }

    const anyNonPending = issues.some(issue => issue.status !== 'pending');
    const requireStructure = phase === 'tickets' || anyNonPending;

    // 2) tasks.md 索引与状态同步
    const tasksText = readText(path.join(root, 'specs', feature, 'tasks.md'));
    const tasks = parseTasksIndex(tasksText);
    if (!tasksText) {
      (requireStructure ? red : warn)(`${feature}：缺 tasks.md（工单索引与状态同步门禁无对账源）`);
    } else if (!tasks.found) {
      red(`${feature}：tasks.md 未找到「工单 | … | 状态」索引表（状态同步门禁无对账源）`);
    } else {
      for (const issue of issues) {
        const tag = tagOf(issue);
        const row = tasks.map.get(issue.id);
        if (!row) {
          red(`${tag}：tasks.md 索引缺该工单行（状态同步门禁）`);
          continue;
        }
        if (!row.token) {
          red(`${tag}：tasks.md 索引状态「${row.raw}」不可识别（只认 ${STATUSES.join('|')} 或图例 ⬜/🔄/✅/⛔）`);
          continue;
        }
        if (issue.status && issue.status !== row.token) {
          red(`${tag}：状态不同步——issue=${issue.status}，tasks.md=${row.token}（原始「${row.raw}」）`);
        }
      }
    }

    // 3) traceability 映射节与 AC/决策行状态同步
    const traceText = readText(path.join(root, 'specs', feature, 'traceability.md'));
    const trace = parseTraceability(traceText);
    const deviations = parseDeviations(readText(path.join(root, 'specs', feature, 'design-deviation.md')));
    const anyClaimed = issues.some(issue => issue.claimed.size > 0);
    if (!traceText) {
      (requireStructure || anyClaimed ? red : warn)(
        `${feature}：缺 traceability.md（D-ID 落点与状态同步门禁无对账源）`
      );
    } else {
      if (!trace.mappingFound && anyClaimed) {
        red(`${feature}：traceability.md 缺「设计决策映射」节——工单覆盖行引用的 D-ID 必须有落点`);
      }
      for (const issue of issues) {
        const tag = tagOf(issue);
        for (const did of issue.claimed) {
          const row = trace.mapping.get(did);
          const devOk = deviations.ok.has(did);
          const devPending = deviations.pending.has(did);
          if (!row) {
            if (devOk) note(`${tag}：设计决策 ${did} 已由 design-deviation.md 登记（无映射行）`);
            else if (devPending) warn(`${tag}：设计决策 ${did} 偏差登记仍为「待裁决」——完成评审前须闭环裁决`);
            else red(`${tag}：覆盖行设计决策 ${did} 在 traceability.md 设计决策映射节无落点，且 design-deviation.md 无登记`);
            continue;
          }
          if (!row.landedAny && !devOk) {
            red(`${tag}：设计决策 ${did} 的映射行无落点（决策正本/兑现工单/证据均为空）`);
            continue;
          }
          if (issue.status === 'done' && !devOk) {
            if (row.statusToken === 'planned') {
              red(`${tag}：工单已 done，但 ${did} 映射行状态仍为 planned（状态同步门禁）`);
            } else if (row.tickets.length === 0 && !row.evidence) {
              red(`${tag}：工单已 done，但 ${did} 映射行缺兑现工单/证据（只填决策正本不够销单）`);
            }
          }
          if (devPending) warn(`${tag}：设计决策 ${did} 偏差登记仍为「待裁决」——完成评审前须闭环裁决`);
        }
      }
      for (const [did, row] of trace.mapping) {
        if (row.statusToken !== 'planned') continue;
        for (const ticket of row.tickets) {
          const issue = issuesById.get(ticket);
          if (issue && issue.status === 'done' && !deviations.ok.has(did)) {
            red(`${feature}：traceability 决策 ${did} 映射行列 ${ticket}（done）但状态仍 planned`);
          }
        }
      }
      for (const row of trace.acRows) {
        const local = row.tickets.filter(ticket => issuesById.has(ticket));
        if (!local.length) continue;
        if (!row.statusToken) {
          warn(`${feature}/${row.ac}：traceability 状态「${row.statusRaw}」不可识别（只认 ${TRACE_STATUSES.join('|')}）`);
          continue;
        }
        if (row.statusToken === 'done') {
          for (const ticket of local) {
            const status = issuesById.get(ticket).status;
            if (status !== 'done') {
              red(`${feature}/${row.ac}：AC 行标 done，但工单 ${ticket} 状态=${status || '未知'}`);
            }
          }
        }
        if (row.statusToken === 'planned' || row.statusToken === 'blocked') {
          for (const ticket of local) {
            if (issuesById.get(ticket).status === 'done') {
              red(`${feature}/${row.ac}：工单 ${ticket} 已 done，但 AC 行仍 ${row.statusToken}（状态同步门禁）`);
            }
          }
        }
      }
    }

    // 4) 销单门禁（tickets 阶段不做勾选/自签收检查）
    if (requireDoneChecks) {
      for (const issue of issues) {
        if (issue.status !== 'done') continue;
        const tag = tagOf(issue);
        const waiverUsable = issue.waiver && issue.waiverCheck && issue.waiverCheck.ok;
        if (waiverUsable) note(`${tag}：引用 issue-audit 豁免（${issue.waiverCheck.source}）`);
        const push = msg => (waiverUsable ? note(`${msg}【已豁免：${issue.waiverCheck.source}】`) : red(msg));

        // 检查 1：验收清单全勾
        const boxes = [...issue.text.matchAll(/^\s*-\s+\[( |x|X)\]/gm)];
        const unchecked = boxes.filter(box => box[1] === ' ').length;
        if (boxes.length === 0) push(`${tag}：状态 done 但验收清单为空（无可验证判据）`);
        else if (unchecked > 0) {
          push(`${tag}：状态 done 但验收清单 ${unchecked}/${boxes.length} 项未勾（销单自签收防线，见 04-implement 销单门禁）`);
        }

        // 检查 2：翻 done 的提交不得与 feat/代码同提交（全部翻 done 提交都查，防洗单）
        if (useGit) {
          const rel = path.relative(root, issue.file).replace(/\\/g, '/');
          const flips = flipsFor(root, rel);
          if (flips === null) {
            warn(`${tag}：git 历史不可读（未跟踪？），自签收检查缺位——人工核对销单提交`);
          } else if (flips.length === 0) {
            warn(`${tag}：未在 git 历史找到翻 done 的提交（初始即 done？），人工核对销单提交`);
          } else {
            for (const flip of flips) {
              if (/^(feat|fix)\b|\((feat|fix)\)/i.test(flip.subject)) {
                push(
                  `${tag}：状态翻 done 与 feat/fix 同提交（${flip.hash.slice(0, 9)} "${flip.subject}"）——销单必须独立 docs/chore 收口提交`
                );
              }
              const { codeFiles } = commitTouchesCode(root, flip.hash, auditCfg);
              if (codeFiles.length > 0) {
                push(
                  `${tag}：翻 done 的提交（${flip.hash.slice(0, 9)}）触碰非文档文件 ${codeFiles.slice(0, 3).join('、')}${codeFiles.length > 3 ? '…' : ''}——状态修改不得与实现代码同提交`
                );
              }
            }
          }
        } else {
          note(`${tag}：非 git 目录，跳过自签收检查`);
        }
      }
    }

    // 5) 验收/发布附加门禁
    if (phase === 'acceptance' || phase === 'release') {
      for (const issue of issues) {
        if (!['done', 'cancelled'].includes(issue.status)) {
          red(`${tagOf(issue)}：验收门禁要求工单全部 done/cancelled，实际=${issue.status || '未知'}`);
        }
      }
      for (const row of trace.acRows) {
        const local = row.tickets.filter(ticket => issuesById.has(ticket));
        if (!local.length) continue;
        if (row.statusToken !== 'done') {
          red(`${feature}/${row.ac}：验收门禁要求 AC 行 done，实际=${row.statusToken || row.statusRaw}`);
        }
      }
      const acceptance = readText(path.join(root, 'specs', feature, 'acceptance.md'));
      if (!acceptance || !acceptance.trim()) {
        red(`${feature}：验收门禁缺 specs/${feature}/acceptance.md`);
      }
      if (phase === 'release') {
        let state = null;
        try {
          state = JSON.parse(readText(path.join(root, 'specs', feature, 'state.json')) || 'null');
        } catch {
          state = null;
        }
        if (!state) {
          red(`${feature}：发布门禁缺/损坏 state.json`);
        } else {
          if (state.stage !== 'done') {
            red(`${feature}：发布门禁要求 state.stage=done，实际=${state.stage || '未知'}`);
          }
          if (!(state.gates && state.gates.userAccepted === true)) {
            red(`${feature}：发布门禁要求 gates.userAccepted=true（用户实机验收未过）`);
          }
        }
      }
    }

    // 6) design.md 定义却无人认领的决策（规划性质可豁免 → 警告）
    const designText = readText(path.join(root, 'specs', feature, 'design.md'));
    const defined = new Set(extractDids(designText || ''));
    if (defined.size) {
      const claimed = new Set([
        ...issues.flatMap(issue => [...issue.claimed]),
        ...trace.mapping.keys(),
        ...deviations.ok,
        ...deviations.pending,
      ]);
      const orphan = [...defined].filter(id => !claimed.has(id));
      if (orphan.length > 0) {
        warn(
          `${feature}：design.md 决策 ${orphan.slice(0, 8).join('、')}${orphan.length > 8 ? '…' : ''} 无任何工单/台账认领（规划批次可豁免，开工前须回填）`
        );
      }
    }

    // 7) 项目声明的台账对账命令（gates.coverageReconcile）：tickets 阶段不执行，避免过早判红。
    if (phase !== 'tickets') {
      const stateRaw = readText(path.join(root, 'specs', feature, 'state.json'));
      if (stateRaw) {
        let declared = null;
        try {
          declared = JSON.parse(stateRaw)?.gates?.coverageReconcile;
        } catch {
          /* 损坏 JSON 交由 flow-status 报 */
        }
        if (!declared) {
          note(`${feature}：未声明 gates.coverageReconcile 台账对账命令（有覆盖类台账时须声明，见 05-final-review）`);
        } else if (typeof declared !== 'string') {
          red(`${feature}：state.gates.coverageReconcile 必须是命令字符串`);
        } else {
          const r = spawnSync(declared, { shell: true, cwd: root, encoding: 'utf8', timeout: 180000 });
          if (r.status === 0) {
            note(`${feature}：台账对账命令绿（${declared}）`);
          } else {
            const tail = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-2).join(' / ');
            red(`${feature}：台账对账命令红（${declared}，exit=${r.status}${tail ? `：${tail}` : ''}）——覆盖台账与实现不一致`);
          }
        }
      }
    }

    // 8) 时记新鲜度硬拦（仅 final-review，wt:done 全量审计；staged/tickets 不查，避免拦日常提交）。
    //    纯离线判定：读 state.json 的 taskchron.lastSyncedAt 与该 feature 最新销单提交时间
    //    （翻 done 提交的 committer date，绝对时间比较，跨零点/时区不误伤），不要求 TaskChron
    //    MCP 可达；taskchron.mode=off 或块/字段缺失（旧 feature）→ 跳过。
    if (phase === 'final-review') {
      let tc = null;
      try {
        tc = JSON.parse(readText(path.join(root, 'specs', feature, 'state.json')) || 'null')?.taskchron ?? null;
      } catch {
        tc = null;
      }
      let profileOff = false;
      try {
        profileOff = JSON.parse(readText(path.join(root, '.dev-flow.json')) || 'null')?.taskchron?.mode === 'off';
      } catch {
        profileOff = false;
      }
      const blockOff = !!tc && typeof tc === 'object' && tc.mode === 'off';
      const lastSyncedRaw = tc && typeof tc === 'object' ? tc.lastSyncedAt : null;
      const syncedMs =
        typeof lastSyncedRaw === 'string' && lastSyncedRaw.trim() ? Date.parse(lastSyncedRaw) : NaN;
      if (profileOff || blockOff) {
        note(`${feature}：taskchron.mode=off，跳过时记新鲜度检查`);
      } else if (!Number.isFinite(syncedMs)) {
        note(`${feature}：state.json 无 taskchron.lastSyncedAt（或不可解析），跳过时记新鲜度检查`);
      } else if (!useGit) {
        note(`${feature}：非 git 目录，时记新鲜度无可比对销单提交，跳过`);
      } else {
        let latest = null;
        for (const issue of issues) {
          const rel = path.relative(root, issue.file).replace(/\\/g, '/');
          const flips = flipsFor(root, rel);
          if (!flips) continue;
          for (const flip of flips) {
            if (flip.timeMs !== null && (latest === null || flip.timeMs > latest.timeMs)) latest = flip;
          }
        }
        if (latest === null) {
          note(`${feature}：git 历史无可考销单提交（翻 done），时记新鲜度无从比对，跳过`);
        } else if (latest.timeMs > syncedMs) {
          red(
            `${feature}：时记过期：最新销单提交 ${latest.hash.slice(0, 9)}（${new Date(latest.timeMs).toISOString()}）晚于 taskchron.lastSyncedAt（${lastSyncedRaw}）——先刷新所属环节/父任务备注并写回 lastSyncedAt`
          );
        } else {
          note(
            `${feature}：时记新鲜度绿（最新销单 ${new Date(latest.timeMs).toISOString()} ≤ lastSyncedAt ${lastSyncedRaw}）`
          );
        }
      }
    }
  }

  if (opts.json) {
    console.log(
      JSON.stringify({ phase, features: features.length, issues: issueCount, reds, warns, notes }, null, 2)
    );
  } else {
    for (const msg of reds) console.log(`RED   ${msg}`);
    for (const msg of warns) console.log(`WARN  ${msg}`);
    for (const msg of notes) console.log(`NOTE  ${msg}`);
    console.log(
      reds.length === 0
        ? `issue-audit：${issueCount} 张工单扫描（phase=${phase}），全绿（红 0；警告 ${warns.length}）`
        : `issue-audit：${reds.length} 项红（phase=${phase}）——门禁未过，先修再销`
    );
  }
  process.exit(reds.length === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(`issue-audit: ${err && err.stack ? err.stack : err}`);
  process.exit(2);
});

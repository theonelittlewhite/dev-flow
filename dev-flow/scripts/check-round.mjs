#!/usr/bin/env node
/**
 * 每轮汇报四块机检（references/09-conductor.md §11）。
 *
 * 检查用户可见回复是否含四块标题（按固定顺序）：
 *   🚧 本路由正在干的活
 *   👉 需要你拍板或动手的事
 *   📋 下一步可以开的任务
 *   🔍 阶段性综合评审触发点
 *
 * 单会话形态（04 形态 A/C）首块标题写「本会话正在干的活」，机检同样放行（别名）。
 * 匹配宽松：标题可带 emoji、Markdown 标题/加粗/列表符号，冒号全半角均可；
 * 只要该行含块名文本即算。``` / ~~~ 围栏内的行一律忽略（防模板示例假绿）。
 * W-03 标准格式：每块用「### <emoji> <块名>」标题独立成行，块与块之间至少空一行
 * （references/09-conductor.md §11，禁止四行紧贴）。机检只校验块名齐备，不强制
 * 标题级别与空行——旧紧凑四行仍放行不误伤，空行分隔由 §11 与模板 router-round.md 约束。
 * 只管标题齐备，不校验每块内容是否为空（「无」由人/模型按规范填写）。
 *
 * 用法：
 *   node check-round.mjs <回复文件>   # 0=四块齐全；1=缺块（列出缺什么）；2=用法/读取错误
 *   node check-round.mjs -            # 从 stdin 读
 *   node check-round.mjs --self-test  # 内置好坏样例各跑一次
 */
import fs from 'node:fs';

const BLOCKS = [
  '本路由正在干的活',
  '需要你拍板或动手的事',
  '下一步可以开的任务',
  '阶段性综合评审触发点',
];

/** 单会话形态首块别名：报告里写「本会话正在干的活」等同首块（09-conductor §11） */
const BLOCK_ALIASES = { 本路由正在干的活: '本会话正在干的活' };

/** 四块固定图标（与 BLOCKS 一一对应，--help 用） */
const BLOCK_EMOJI = ['🚧', '👉', '📋', '🔍'];

function validate(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = Object.fromEntries(BLOCKS.map(b => [b, false]));
  let inFence = false;
  for (const raw of lines) {
    const line = raw.replace(/^\s+/, '');
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const block of BLOCKS) {
      const names = [block, BLOCK_ALIASES[block]].filter(Boolean);
      if (!found[block] && names.some(name => line.includes(name))) found[block] = true;
    }
  }
  return BLOCKS.map(name => ({ name, ok: found[name] }));
}

function printResults(source, results) {
  const bad = results.filter(r => !r.ok);
  console.log(`【check-round】${source}`);
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);
  console.log(bad.length === 0 ? '结论：PASS（四块齐全）' : `结论：FAIL（缺 ${bad.length} 块：${bad.map(r => r.name).join('、')}）`);
  return bad.length === 0 ? 0 : 1;
}

function run(path) {
  const source = path === '-' ? '<stdin>' : path;
  const text = path === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path, 'utf8');
  return printResults(source, validate(text));
}

function selfTest() {
  // W-03 标准格式：### 标题 + 内容行，块与块之间空一行（09-conductor §11）
  const good = [
    '### 🚧 本路由正在干的活',
    'T-12（glm-5.3-flash，截止 12:00）',
    '',
    '### 👉 需要你拍板或动手的事',
    '无',
    '',
    '### 📋 下一步可以开的任务',
    'T-13（前置：T-12 已销单）',
    '',
    '### 🔍 阶段性综合评审触发点',
    '无',
    '',
  ].join('\n');
  const tolerant = `## 🚧 本路由正在干的活\n- sess_x——glm-5.3-flash，截止 12:00\n\n### 需要你拍板或动手的事\n- 停掉 sess_x——原因：跑偏\n\n**📋 下一步可以开的任务**\n- T-13（前置未满足）\n\n**阶段性综合评审触发点**：第 2 批后\n`;
  const single = [
    '### 🚧 本会话正在干的活',
    '修 check-round 自检（截止 12:00）',
    '',
    '### 👉 需要你拍板或动手的事',
    '无',
    '',
    '### 📋 下一步可以开的任务',
    '无',
    '',
    '### 🔍 阶段性综合评审触发点',
    '无',
    '',
  ].join('\n');
  // 旧紧凑格式（四行紧贴、无空行）：文档规则违例，但机检只校验块名，仍放行不误伤
  const compact = `🚧 本路由正在干的活：无\n👉 需要你拍板或动手的事：无\n📋 下一步可以开的任务：无\n🔍 阶段性综合评审触发点：无\n`;
  const fenced = '回复正文没有四块，只有模板示例：\n\n```\n### 🚧 本路由正在干的活\n### 👉 需要你拍板或动手的事\n### 📋 下一步可以开的任务\n### 🔍 阶段性综合评审触发点\n```\n';
  const missingFirst = [
    '### 👉 需要你拍板或动手的事',
    '无',
    '',
    '### 📋 下一步可以开的任务',
    '无',
    '',
    '### 🔍 阶段性综合评审触发点',
    '无',
    '',
  ].join('\n');
  const missingLast = [
    '### 🚧 本路由正在干的活',
    '无',
    '',
    '### 👉 需要你拍板或动手的事',
    '无',
    '',
    '### 📋 下一步可以开的任务',
    '无',
    '',
  ].join('\n');
  const r1 = validate(good);
  const r2 = validate(tolerant);
  const rSingle = validate(single);
  const rCompact = validate(compact);
  const r3 = validate(fenced);
  const r4 = validate(missingFirst);
  const r5 = validate(missingLast);
  const p1 = r1.every(r => r.ok);
  const p2 = r2.every(r => r.ok);
  const pSingle = rSingle.every(r => r.ok);
  const pCompact = rCompact.every(r => r.ok);
  const p3 = r3.every(r => !r.ok);
  const p4 = r4.filter(r => !r.ok).length === 1 && r4[0].name === '本路由正在干的活' && !r4[0].ok;
  const p5 = r5.filter(r => !r.ok).length === 1 && r5[3].name === '阶段性综合评审触发点' && !r5[3].ok;
  console.log('【check-round --self-test】');
  console.log(`  标准格式（### 标题+块间空行）      期望 PASS → ${p1 ? 'PASS' : 'FAIL'}`);
  console.log(`  宽松格式（Markdown 标题/加粗）    期望 PASS → ${p2 ? 'PASS' : 'FAIL'}`);
  console.log(`  单会话变体（本会话正在干的活）    期望 PASS → ${pSingle ? 'PASS' : 'FAIL'}`);
  console.log(`  紧贴四行（无空行，机检只看块名）  期望 PASS → ${pCompact ? 'PASS' : 'FAIL'}`);
  console.log(`  围栏假绿防御（四块只在代码块）    期望 FAIL → ${p3 ? 'FAIL（正确拦下）' : '意外放行'}`);
  console.log(`  缺首块样例（只有旧三块）          期望 FAIL → ${p4 ? 'FAIL（正确拦下）' : '意外放行'}`);
  console.log(`  缺尾块样例（缺评审触发点）        期望 FAIL → ${p5 ? 'FAIL（正确拦下）' : '意外放行'}`);
  const ok = p1 && p2 && pSingle && pCompact && p3 && p4 && p5;
  console.log(ok ? '结论：SELF-TEST PASS' : '结论：SELF-TEST FAIL');
  return ok ? 0 : 1;
}

const arg = process.argv[2];
if (arg === '--self-test') process.exit(selfTest());
if (!arg || arg === '--help' || arg === '-h') {
  if (!arg && !process.stdin.isTTY) process.exit(run('-'));
  console.log('用法：node check-round.mjs <回复文件> | -（stdin） | --self-test');
  console.log('检查每轮汇报四块标题（顺序固定）：');
  BLOCKS.forEach((block, i) => console.log(`  ${BLOCK_EMOJI[i]} ${block}`));
  console.log('单会话形态首块可写「🚧 本会话正在干的活」（机检同放行）；围栏内示例不算数。');
  console.log('标准格式（09 §11）：每块「### <emoji> <块名>」标题独立成行，块间空一行（机检只看块名，不强制）。');
  process.exit(2);
}
if (arg !== '-' && !fs.existsSync(arg)) {
  console.error(`check-round: 文件不存在：${arg}`);
  process.exit(2);
}
try {
  process.exit(run(arg));
} catch (e) {
  console.error(`check-round: 读取失败：${e.message}`);
  process.exit(2);
}

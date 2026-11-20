#!/usr/bin/env node
/**
 * 派工令六字段机检（路由编排层批一，references/09-conductor.md §2）。
 *
 * 校验派工令六字段齐备且非空，缺项拒绝开工：
 *   单号 / 目标与验收 / 文件地盘 / 基线 + 验证命令 / 模型 + 槽位 / 回传格式 + 截止
 *
 * 认两种行格式（行首，全半角冒号均可；序号认 `1.`/`1、`，序号后空格可省；同字段以首次出现为准）：
 *   **字段**：值        （templates/dispatch-order.md 模板格式）
 *   字段：值            （设计稿 §5.2 列表格式）
 * ``` / ~~~ 围栏内的行一律忽略（防示例代码块假绿，手册/模板自身可安全喂入）。
 * 值为空的判定：本行冒号后无内容，且紧随的下一个非空行不是 `- ` 列表项。
 * 已知宽松性：空值后的 `- ` 无法区分「本字段的取值列表」与「无关列表段」（模板依赖前者，属设计权衡）。
 *
 * 用法：
 *   node check-order.mjs <派工令.md>     # 退出码 0=六字段齐备；1=有缺项（列出清单）；2=用法/读文件错误
 *   node check-order.mjs --self-test     # 内置好坏样例各跑一次，两者行为符合预期才绿
 */
import fs from 'node:fs';

const FIELDS = ['单号', '目标与验收', '文件地盘', '基线 + 验证命令', '模型 + 槽位', '回传格式 + 截止'];

function fieldLineRe(name) {
  // 字段名按「+」分段转义后拼回，使「基线 + 验证命令」也匹配「基线+验证命令」等空格变体
  const escaped = name
    .split('+')
    .map(s => s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*\\+\\s*');
  return new RegExp(`^(?:\\d+[.、]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[：:]\\s*(.*)$`);
}

function validate(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = {};
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const name of FIELDS) {
      if (found[name]) continue;
      const m = line.match(fieldLineRe(name));
      if (!m) continue;
      if (m[1].trim()) {
        found[name] = 'ok';
      } else {
        const next = lines.slice(i + 1).find(l => l.trim());
        found[name] = next && /^\s*-\s+/.test(next) ? 'ok' : 'empty';
      }
    }
  }
  return FIELDS.map(name => ({ name, state: found[name] || 'missing' }));
}

function run(path) {
  const results = validate(fs.readFileSync(path, 'utf8'));
  const bad = results.filter(r => r.state !== 'ok');
  console.log(`【check-order】${path}`);
  for (const r of results) console.log(`  ${r.state === 'ok' ? '✓' : '✗'} ${r.name}${r.state === 'empty' ? '（存在但为空）' : ''}`);
  console.log(bad.length === 0 ? '结论：PASS（六字段齐备）' : `结论：FAIL（缺 ${bad.length} 项：${bad.map(r => r.name).join('、')}）`);
  return bad.length === 0 ? 0 : 1;
}

function selfTest() {
  const good = `# 派工令 T-09：示例单\n\n**单号**：T-09（对应 issues/T-09.md）\n**目标与验收**：跑通 X，测试绿\n**文件地盘**：\n- 允许：src/a/\n- 禁入：src/b/\n**基线 + 验证命令**：基线 120，npm test\n**模型 + 槽位**：xxx/yyy，slot-1\n**回传格式 + 截止**：report.md 七行块，router_session_id=sess_x，今天 18:00\n`;
  const tolerant = `# 派工令 T-11：宽容格式\n\n1、单号:T-11\n2、目标与验收:做成 Y\n3、文件地盘:src/b/ 全部\n4、基线+验证命令:基线 99，npm test\n5、模型+槽位:xxx/zzz，slot-2\n6、回传格式+截止:report 块，明天 09:00\n`;
  const fenced = `# 手册假绿防御\n\n正文缺六字段，只有代码块示例：\n\n\`\`\`\n**单号**：T-fake\n**目标与验收**：假的\n\`\`\`\n`;
  const bad = `# 派工令 T-10：坏样例\n\n**单号**：T-10\n**目标与验收**：做成东西\n3. 基线 + 验证命令：基线 100\n**回传格式 + 截止**：report 块，今天 18:00\n**模型 + 槽位**：\n（这里本来该有模型，但空着，且下一行不是列表项）\n`;
  const r1 = validate(good);
  const r2 = validate(tolerant);
  const r3 = validate(fenced);
  const r4 = validate(bad);
  const p1 = r1.every(r => r.state === 'ok');
  const p2 = r2.every(r => r.state === 'ok');
  const p3 = r3.every(r => r.state === 'missing');
  const r4m = Object.fromEntries(r4.map(r => [r.name, r.state]));
  const p4 = r4m['文件地盘'] === 'missing' && r4m['模型 + 槽位'] === 'empty' && r4.filter(r => r.state !== 'ok').length === 2;
  console.log('【check-order --self-test】');
  console.log(`  好样例（模板格式齐全）          期望 PASS → ${p1 ? 'PASS' : 'FAIL'}`);
  console.log(`  宽容格式（半角冒号+顿号序号）    期望 PASS → ${p2 ? 'PASS' : 'FAIL'}`);
  console.log(`  围栏假绿防御（字段只在代码块）    期望 FAIL → ${p3 ? 'FAIL（正确拦下）' : '意外放行'}`);
  console.log(`  坏样例（缺文件地盘+空模型）      期望 FAIL → ${p4 ? 'FAIL（正确拦下）' : '意外放行'}`);
  const ok = p1 && p2 && p3 && p4;
  console.log(ok ? '结论：SELF-TEST PASS' : '结论：SELF-TEST FAIL');
  return ok ? 0 : 1;
}

const arg = process.argv[2];
if (arg === '--self-test') process.exit(selfTest());
if (!arg || arg === '--help' || arg === '-h') {
  console.log('用法：node check-order.mjs <派工令.md> | --self-test');
  process.exit(2);
}
if (!fs.existsSync(arg)) {
  console.error(`check-order: 文件不存在：${arg}`);
  process.exit(2);
}
try {
  process.exit(run(arg));
} catch (e) {
  console.error(`check-order: 读取失败：${e.message}`);
  process.exit(2);
}

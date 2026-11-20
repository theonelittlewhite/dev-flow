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
 * 非阻断警告（W-09 P0-2）：六字段全过但「文件地盘」字段段内（围栏外）未出现「关联只读检查」时提示——
 * 文件地盘应列 capability/manifest/权限配置文件（禁改也要列；无则写「无需变更（理由）」）。
 * 只提示不拦，退出码仍 0，六字段语义不变；已知宽松性：子项行格式不限（列表/散文均可），但只认文件地盘段内出现。
 *
 * 用法：
 *   node check-order.mjs <派工令.md>     # 退出码 0=六字段齐备；1=有缺项（列出清单）；2=用法/读文件错误
 *   node check-order.mjs --self-test     # 内置好坏样例各跑一次，两者行为符合预期才绿
 */
import fs from 'node:fs';

const FIELDS = ['单号', '目标与验收', '文件地盘', '基线 + 验证命令', '模型 + 槽位', '回传格式 + 截止'];
const CAP_NOTE = '关联只读检查';

// 「关联只读检查」子项是否缺失：只认「文件地盘」字段段内（围栏外）的出现，其他字段/散文提及不算数。
// 字段段＝「文件地盘」字段行起、下一字段行（六字段任一）前的区间；围栏纪律与六字段识别一致。
function capabilityNoteMissing(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  let inTerritory = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (FIELDS.some(name => fieldLineRe(name).test(line))) {
      inTerritory = fieldLineRe('文件地盘').test(line);
      continue;
    }
    if (inTerritory && line.includes(CAP_NOTE)) return false;
  }
  return true;
}

// run() 的警告闸门：六字段全过且文件地盘段内无子项才提示（抽出成函数便于 --self-test 断言接线）
function shouldWarn(text, results) {
  return results.every(r => r.state === 'ok') && capabilityNoteMissing(text);
}

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
  const text = fs.readFileSync(path, 'utf8');
  const results = validate(text);
  const bad = results.filter(r => r.state !== 'ok');
  console.log(`【check-order】${path}`);
  for (const r of results) console.log(`  ${r.state === 'ok' ? '✓' : '✗'} ${r.name}${r.state === 'empty' ? '（存在但为空）' : ''}`);
  if (shouldWarn(text, results)) {
    console.log(`  ⚠ 非阻断警告：文件地盘缺「${CAP_NOTE}」子项——列 capability/manifest/权限配置文件（禁改也要列；无则写「无需变更（理由）」）`);
  }
  console.log(bad.length === 0 ? '结论：PASS（六字段齐备）' : `结论：FAIL（缺 ${bad.length} 项：${bad.map(r => r.name).join('、')}）`);
  return bad.length === 0 ? 0 : 1;
}

function selfTest() {
  const good = `# 派工令 T-09：示例单\n\n**单号**：T-09（对应 issues/T-09.md）\n**目标与验收**：跑通 X，测试绿\n**文件地盘**：\n- 允许：src/a/\n- 禁入：src/b/\n- 关联只读检查：src-tauri/capabilities/main.json\n**基线 + 验证命令**：基线 120，npm test\n**模型 + 槽位**：xxx/yyy，slot-1\n**回传格式 + 截止**：report.md 七行块，router_session_id=sess_x，今天 18:00\n`;
  const tolerant = `# 派工令 T-11：宽容格式\n\n1、单号:T-11\n2、目标与验收:做成 Y\n3、文件地盘:src/b/ 全部\n4、基线+验证命令:基线 99，npm test\n5、模型+槽位:xxx/zzz，slot-2\n6、回传格式+截止:report 块，明天 09:00\n`;
  const fenced = `# 手册假绿防御\n\n正文缺六字段，只有代码块示例：\n\n\`\`\`\n**单号**：T-fake\n**目标与验收**：假的\n\`\`\`\n`;
  const bad = `# 派工令 T-10：坏样例\n\n**单号**：T-10\n**目标与验收**：做成东西\n3. 基线 + 验证命令：基线 100\n**回传格式 + 截止**：report 块，今天 18:00\n**模型 + 槽位**：\n（这里本来该有模型，但空着，且下一行不是列表项）\n`;
  const noCap = `# 派工令 T-12：六字段齐但无能力子项\n\n**单号**：T-12\n**目标与验收**：跑通 Z，测试绿\n**文件地盘**：\n- 允许：src/c/\n- 禁入：src/d/\n**基线 + 验证命令**：基线 80，npm test\n**模型 + 槽位**：xxx/yyy，slot-3\n**回传格式 + 截止**：report 块，今天 18:00\n`;
  const capInFence = `# 派工令 T-13：关键词只在代码块\n\n**单号**：T-13\n**目标与验收**：跑通 W，测试绿\n**文件地盘**：\n- 允许：src/e/\n- 禁入：src/f/\n**基线 + 验证命令**：基线 70，npm test\n**模型 + 槽位**：xxx/yyy，slot-4\n**回传格式 + 截止**：report 块，今天 18:00\n\n\`\`\`\n- 关联只读检查：示例\n\`\`\`\n`;
  const capElsewhere = `# 派工令 T-14：关键词在其他字段\n\n**单号**：T-14\n**目标与验收**：跑通 V 并核对本单关联只读检查义务，测试绿\n**文件地盘**：\n- 允许：src/g/\n- 禁入：src/h/\n**基线 + 验证命令**：基线 60，npm test\n**模型 + 槽位**：xxx/yyy，slot-5\n**回传格式 + 截止**：report 块，今天 18:00\n`;
  const r1 = validate(good);
  const r2 = validate(tolerant);
  const r3 = validate(fenced);
  const r4 = validate(bad);
  const p1 = r1.every(r => r.state === 'ok');
  const p2 = r2.every(r => r.state === 'ok');
  const p3 = r3.every(r => r.state === 'missing');
  const r4m = Object.fromEntries(r4.map(r => [r.name, r.state]));
  const p4 = r4m['文件地盘'] === 'missing' && r4m['模型 + 槽位'] === 'empty' && r4.filter(r => r.state !== 'ok').length === 2;
  // 非阻断警告（W-09 P0-2）：六字段语义不变，验提示开关与 run() 接线——退出码路径不经过这些样例
  const p5 = capabilityNoteMissing(noCap) === true;
  const p6 = capabilityNoteMissing(capInFence) === true;
  const p7 = capabilityNoteMissing(good) === false;
  const p8 = capabilityNoteMissing(capElsewhere) === true;
  const p9 = shouldWarn(noCap, validate(noCap)) === true;
  const p10 = shouldWarn(bad, validate(bad)) === false;
  const p11 = shouldWarn(good, validate(good)) === false;
  console.log('【check-order --self-test】');
  console.log(`  好样例（模板格式齐全）          期望 PASS → ${p1 ? 'PASS' : 'FAIL'}`);
  console.log(`  宽容格式（半角冒号+顿号序号）    期望 PASS → ${p2 ? 'PASS' : 'FAIL'}`);
  console.log(`  围栏假绿防御（字段只在代码块）    期望 FAIL → ${p3 ? 'FAIL（正确拦下）' : '意外放行'}`);
  console.log(`  坏样例（缺文件地盘+空模型）      期望 FAIL → ${p4 ? 'FAIL（正确拦下）' : '意外放行'}`);
  console.log(`  警告：六字段齐但缺关联只读检查    期望提示 → ${p5 ? 'PASS（正确提示）' : 'FAIL（漏提示）'}`);
  console.log(`  警告：关键词只在代码块不算数      期望提示 → ${p6 ? 'PASS（正确提示）' : 'FAIL（漏提示）'}`);
  console.log(`  警告：有关联只读检查不提示        期望静默 → ${p7 ? 'PASS（正确静默）' : 'FAIL（误报）'}`);
  console.log(`  警告：关键词在其他字段不算数      期望提示 → ${p8 ? 'PASS（正确提示）' : 'FAIL（漏提示）'}`);
  console.log(`  接线：齐+缺子项 → shouldWarn 真   期望 真 → ${p9 ? 'PASS' : 'FAIL'}`);
  console.log(`  接线：六字段缺项 → 无警告         期望 假 → ${p10 ? 'PASS' : 'FAIL'}`);
  console.log(`  接线：有子项 → 无警告             期望 假 → ${p11 ? 'PASS' : 'FAIL'}`);
  const ok = p1 && p2 && p3 && p4 && p5 && p6 && p7 && p8 && p9 && p10 && p11;
  console.log(ok ? '结论：SELF-TEST PASS' : '结论：SELF-TEST FAIL');
  return ok ? 0 : 1;
}

const arg = process.argv[2];
if (arg === '--self-test') process.exit(selfTest());
if (!arg || arg === '--help' || arg === '-h') {
  console.log('用法：node check-order.mjs <派工令.md> | --self-test');
  console.log('附：六字段全过但文件地盘缺「关联只读检查」子项时给非阻断警告，退出码仍 0。');
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

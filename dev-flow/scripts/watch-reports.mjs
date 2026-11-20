#!/usr/bin/env node
/**
 * 报告监视器（路由编排层，references/09-conductor.md §3「报告监视器」小节）。
 *
 * 后台任务挂载，只读盯 specs/<feature>/evidence/*.md（启动做 mtime+size 基线快照，
 * 之后每 interval 秒对比）：工人手递降级把报告块落 evidence 后，本脚本发现
 * 新文件/内容变化，等稳定窗（连续 settle 秒无进一步变化，防读到半写报告），
 * 打印新报告清单退出；宿主在后台任务退出时唤醒路由会话，路由据此收账。
 *
 * 双保险纪律（不是唯一通道）：监视器只负责缩短延迟——机器休眠、后台进程被杀、
 * 监视器漏跑都会断。路由每轮开头仍必须主动扫一遍 evidence 兜底（对照台账
 * 已收账行），监视器 + 每轮开头扫，缺一不可。
 *
 * 输出契约：
 *   触发：stdout 打印 NEW_OR_CHANGED_REPORTS=<逗号分隔文件名>，退出码 0
 *   超时：stdout 打印 WATCH_TIMEOUT_NO_REPORT，退出码 0（没等到报告是正常返回，不是错误）
 *   参数/读取错误：stderr 说明，退出码 1
 *
 * 只读：不写仓库、不占端口、零外部依赖；Node 22+；Windows/Ubuntu 均可跑。
 *
 * 用法：
 *   node watch-reports.mjs --root <项目根> --feature <feature>
 *                          [--interval-sec 5] [--settle-sec 15] [--timeout-min 240] [--json]
 *   node watch-reports.mjs --self-test
 *   node watch-reports.mjs --help
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const DEFAULTS = { intervalSec: 5, settleSec: 15, timeoutMin: 240 };

const HELP = `【watch-reports】报告监视器——盯 specs/<feature>/evidence/*.md，新报告稳定后打印清单退出（宿主在后台任务退出时唤醒路由收账）

用法：
  node watch-reports.mjs --root <项目根> --feature <feature>
                         [--interval-sec 5] [--settle-sec 15] [--timeout-min 240] [--json]
  node watch-reports.mjs --self-test     内置场景自检（临时目录，跑完即删）
  node watch-reports.mjs --help          本说明

参数：
  --root <项目根>        必填，仓库根目录
  --feature <feature>    必填，功能名（specs/<feature>/evidence/，禁路径分隔符）
  --interval-sec N       轮询间隔秒数（默认 5，可小数）
  --settle-sec N         稳定窗秒数：变化后连续 N 秒无进一步变化才触发（默认 15，防半写）
  --timeout-min N        总超时分钟数（默认 240，可小数）
  --json                 以 JSON 输出（含 line 字段，与纯文本同义）

输出契约（退出码）：
  触发：stdout 「NEW_OR_CHANGED_REPORTS=<逗号分隔文件名>」（exit 0）
  超时：stdout 「WATCH_TIMEOUT_NO_REPORT」（exit 0，正常返回不是错误）
  参数/读取错误：stderr 说明（exit 1）

双保险：监视器只缩短延迟、不是唯一通道——机器休眠/后台任务被杀会断；
路由每轮开头仍须主动扫一遍 evidence 兜底（详见 references/09-conductor.md §3）。
`;

function parseFlags(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--self-test' || a === '--help') opts[a.slice(2)] = true;
    else if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opts[a.slice(2)] = true;
      else {
        opts[a.slice(2)] = next;
        i++;
      }
    } else opts._.push(a);
  }
  return opts;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** 参数校验：合法返回运行参数对象，否则返回 { error }（exit 1） */
function validateOpts(flags) {
  const root = flags.root;
  const feature = flags.feature;
  if (!root) return { error: '缺 --root <项目根>' };
  if (!feature) return { error: '缺 --feature <feature>' };
  if (/[\\/]/.test(feature) || feature === '.' || feature === '..') {
    return { error: `--feature 含路径分隔符或非法：${feature}` };
  }
  const intervalSec = flags['interval-sec'] !== undefined ? num(flags['interval-sec']) : DEFAULTS.intervalSec;
  if (!(intervalSec > 0)) return { error: `--interval-sec 需为正数（秒），得到：${flags['interval-sec']}` };
  const settleSec = flags['settle-sec'] !== undefined ? num(flags['settle-sec']) : DEFAULTS.settleSec;
  if (!(settleSec >= 0)) return { error: `--settle-sec 需为不小于 0 的数（秒），得到：${flags['settle-sec']}` };
  const timeoutMin = flags['timeout-min'] !== undefined ? num(flags['timeout-min']) : DEFAULTS.timeoutMin;
  if (!(timeoutMin > 0)) return { error: `--timeout-min 需为正数（分钟），得到：${flags['timeout-min']}` };
  return { root, feature, intervalSec, settleSec, timeoutMin, json: !!flags.json };
}

/** 快照：evidence 目录下 *.md → Map<文件名, {mtimeMs, size}>。目录未建按空盯（等它出现）；可读但读不了抛错 */
function snapshotDir(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    if (e && e.code === 'ENOENT') return new Map();
    throw new Error(`evidence 目录不可读：${dir}（${(e && e.code) || ''} ${e.message}）`);
  }
  const map = new Map();
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.md')) continue;
    try {
      const st = fs.statSync(path.join(dir, name));
      if (!st.isFile()) continue;
      map.set(name, { mtimeMs: st.mtimeMs, size: st.size });
    } catch {
      /* 快照瞬间被删：本轮跳过 */
    }
  }
  return map;
}

/** 对比两轮快照：新出现的文件 + mtime 或 size 变了的基线文件 */
function diffSnapshots(prev, curr) {
  const fresh = [];
  const changed = [];
  for (const [name, info] of curr) {
    const was = prev.get(name);
    if (!was) fresh.push(name);
    else if (was.mtimeMs !== info.mtimeMs || was.size !== info.size) changed.push(name);
  }
  return { fresh, changed };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 监视主循环：新文件/内容变化且稳定 settle 秒 → reports；到 deadline 无报告 → timeout；读不了 → error */
async function watch(root, feature, intervalSec, settleSec, timeoutMin) {
  const evidenceDir = path.join(path.resolve(root), 'specs', feature, 'evidence');
  let baseline;
  try {
    baseline = snapshotDir(evidenceDir);
  } catch (e) {
    return { event: 'error', message: e.message };
  }
  const deadline = Date.now() + timeoutMin * 60000;
  let pending = []; // 已发现待稳定的文件名
  let lastChangeAt = null;
  for (;;) {
    await sleep(intervalSec * 1000);
    let curr;
    try {
      curr = snapshotDir(evidenceDir);
    } catch (e) {
      return { event: 'error', message: e.message };
    }
    const { fresh, changed } = diffSnapshots(baseline, curr);
    if (fresh.length > 0 || changed.length > 0) {
      for (const name of [...fresh, ...changed]) if (!pending.includes(name)) pending.push(name);
      lastChangeAt = Date.now();
      baseline = curr;
    } else if (pending.length > 0 && Date.now() - lastChangeAt >= settleSec * 1000) {
      pending = pending.filter(name => curr.has(name)); // 稳定窗内被删的临时文件不算报告
      if (pending.length > 0) return { event: 'reports', files: [...pending].sort(), evidenceDir };
      pending = [];
      lastChangeAt = null;
    }
    if (Date.now() >= deadline) return { event: 'timeout', evidenceDir };
  }
}

function printResult(res, json) {
  const line =
    res.event === 'reports'
      ? `NEW_OR_CHANGED_REPORTS=${res.files.join(',')}`
      : res.event === 'timeout'
        ? 'WATCH_TIMEOUT_NO_REPORT'
        : '';
  if (json) console.log(JSON.stringify({ ...res, line }));
  else if (res.event === 'error') console.error(`【watch-reports】${res.message}`);
  else console.log(line);
}

/* ---------------- self-test：夹具在系统临时目录，跑完即删 ---------------- */
async function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-watch-reports-test-'));
  let pass = 0;
  let fail = 0;
  const ok = (name, cond) => {
    console.log(`  ${name} 期望 ${cond ? '√' : '×'} → ${cond ? 'PASS' : 'FAIL'}`);
    cond ? pass++ : fail++;
  };
  try {
    const root = path.join(tmp, 'repo');
    const ev = path.join(root, 'specs', 'demo', 'evidence');
    fs.mkdirSync(ev, { recursive: true });
    fs.writeFileSync(path.join(ev, 'T-01-report.md'), '# 旧（启动基线）\n');

    // S1 新文件触发 + 基线不算新
    let w = watch(root, 'demo', 0.05, 0.2, 1);
    setTimeout(() => fs.writeFileSync(path.join(ev, 'T-42-report.md'), '# 新报告\n'), 150);
    let r = await w;
    ok('S1 新文件触发 event=reports', r.event === 'reports');
    ok('S1 只报新文件不含基线', r.files && r.files.length === 1 && r.files[0] === 'T-42-report.md');

    // S2 内容变化触发（mtime/size 变）
    w = watch(root, 'demo', 0.05, 0.2, 1);
    setTimeout(() => fs.writeFileSync(path.join(ev, 'T-01-report.md'), '# 旧\n完工补写了更长的正文\n'), 150);
    r = await w;
    ok('S2 内容变化触发', r.event === 'reports' && r.files.join(',') === 'T-01-report.md');

    // S3 稳定等待：0.9s 内持续改写（settle 0.5s）→ 不早于最后改写+settle 触发
    const started = Date.now();
    w = watch(root, 'demo', 0.05, 0.5, 1);
    void (async () => {
      for (let i = 1; i <= 6; i++) {
        await sleep(150);
        fs.writeFileSync(path.join(ev, 'T-08-report.md'), `# 稳定窗测试 第 ${i} 次\n${'x'.repeat(i * 20)}\n`);
      }
    })();
    r = await w;
    const elapsed = Date.now() - started;
    ok('S3 等稳定窗后才触发（≥ 最后改写+settle）', r.event === 'reports' && r.files[0] === 'T-08-report.md' && elapsed >= 1100);

    // S4 超时退出（无变化）
    r = await watch(root, 'demo', 0.05, 0.2, 0.01); // 0.6s
    ok('S4 超时 event=timeout', r.event === 'timeout');

    // S5 evidence 目录后建：启动时目录不存在也触发
    const root2 = path.join(tmp, 'repo2');
    w = watch(root2, 'late', 0.05, 0.2, 1);
    setTimeout(() => {
      fs.mkdirSync(path.join(root2, 'specs', 'late', 'evidence'), { recursive: true });
      fs.writeFileSync(path.join(root2, 'specs', 'late', 'evidence', 'W-99-report.md'), '# 目录后建\n');
    }, 150);
    r = await w;
    ok('S5 evidence 目录后建仍触发', r.event === 'reports' && r.files[0] === 'W-99-report.md');

    // S6 参数校验
    ok('S6 缺 --root 拒绝', validateOpts({}).error !== undefined);
    ok('S6 缺 --feature 拒绝', validateOpts({ root }).error !== undefined);
    ok('S6 interval-sec=0 拒绝', validateOpts({ root, feature: 'demo', 'interval-sec': '0' }).error !== undefined);
    ok('S6 feature 带分隔符拒绝', validateOpts({ root, feature: 'a/b' }).error !== undefined);

    // S7 CLI 子进程 --json 真跑（超时事件，0.3s）
    let cli = null;
    try {
      const p = spawnSync(
        process.execPath,
        [process.argv[1], '--root', root, '--feature', 'demo', '--interval-sec', '0.05', '--timeout-min', '0.005', '--json'],
        { encoding: 'utf8', timeout: 15000 }
      );
      cli = p.status === 0 ? JSON.parse(p.stdout) : null;
    } catch {
      cli = null;
    }
    ok('S7 CLI --json 超时事件可解析', cli !== null && cli.event === 'timeout' && cli.line === 'WATCH_TIMEOUT_NO_REPORT');

    console.log(fail === 0 ? '结论：SELF-TEST PASS' : `结论：SELF-TEST FAIL（${fail} 项）`);
    return fail === 0 ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (flags['self-test']) process.exit(await selfTest());
  const opts = validateOpts(flags);
  if (opts.error) {
    console.error(`watch-reports: ${opts.error}（--help 看用法）`);
    process.exit(1);
  }
  if (!fs.existsSync(path.resolve(opts.root))) {
    console.error(`watch-reports: --root 不存在：${path.resolve(opts.root)}`);
    process.exit(1);
  }
  let res;
  try {
    res = await watch(opts.root, opts.feature, opts.intervalSec, opts.settleSec, opts.timeoutMin);
  } catch (e) {
    console.error(`watch-reports: 运行时错误（exit 1）：${e.message}`);
    process.exit(1);
  }
  printResult(res, opts.json);
  process.exit(res.event === 'error' ? 1 : 0);
}

main().catch(e => {
  console.error(`watch-reports: 未捕获异常（exit 1）：${e.message}`);
  process.exit(1);
});

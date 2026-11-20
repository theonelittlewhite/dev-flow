#!/usr/bin/env node
/**
 * dev-flow-setup：体检 / 安装 / 验证 / 项目配置初始化。
 *
 * 设计原则：
 *   - 零依赖，只用 Node 内置模块；Node >= 20。
 *   - 只动清单内的 dev-flow* 与上游技能，绝不删除其他技能。
 *   - 替换前先备份到 <skills-root>/.dev-flow-backup/<时间戳>/。
 *   - 安装写回执 <skills-root>/.dev-flow-install.json，--verify 按回执校验。
 *   - 检测到现有维护者副本（dev-flow/IMPLEMENTATION）时默认拒绝，--force 才替换。
 *
 * 用法：
 *   node setup.mjs --check [--from <包根>] [--skills-root <技能根>] [--json]
 *   node setup.mjs --install [--from <包根>] [--skills-root <技能根>] [--force] [--force-upstream] [--json]
 *   node setup.mjs --verify [--skills-root <技能根>] [--json]
 *   node setup.mjs --project-init [--root <项目根>] [--dry-run] [--force] [--json]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FROM = path.resolve(HERE, '..', '..');
const DEFAULT_SKILLS_ROOT = path.join(os.homedir(), '.zcode', 'skills');
// 运行时清单：hub/contracts/deploy 属 slot-fabric（D25）；目录尚未落位时自动跳过。
export const RUNTIME_ITEMS = ['SKILL.md', 'references', 'templates', 'scripts', 'hub', 'contracts', 'deploy'];
const CORE_SKILLS = [
  'dev-flow',
  'dev-flow-grill-with-docs',
  'dev-flow-handoff',
  'dev-flow-retro',
  'dev-flow-to-questionnaire',
  'dev-flow-to-spec',
  'dev-flow-to-tickets',
  'dev-flow-triage',
  'dev-flow-wayfinder',
  'dev-flow-setup',
];
const LOCK_TTL_MS = 10 * 60 * 1000;

const DEFAULT_PROFILE = {
  version: 1,
  project: null,
  docs: {
    glossary: null,
    design: 'docs/design',
    implemented: 'docs/implemented',
  },
  ledger: {
    mode: 'manual',
    add: null,
    index: null,
    pitfalls: 'docs/issues/pitfalls.md',
    deferred: 'docs/issues/deferred.md',
  },
  changelog: {
    mode: 'none',
    dir: 'changelog',
  },
  finishGate: {
    command: null,
    required: false,
  },
  taskchron: {
    mode: 'auto',
  },
  slots: {
    enabled: false,
    claim: null,
    done: null,
    dir: null,
  },
  audit: {
    designDocGlobs: ['docs/design/**/*.yaml', 'docs/design/**/*.yml'],
    allowNonCodeGlobs: [],
  },
};

function fail(message) {
  // 抛错而不是直接 exit：install 的 finally 要负责释放安装锁。
  const error = new Error(message);
  error.devFlowSetup = true;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (isObject(base) && isObject(override)) {
    const out = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = key in base ? deepMerge(base[key], value) : value;
    }
    return out;
  }
  return override === undefined ? base : override;
}

// —— models 块（模型分工）——
// 形状契约见 dev-flow/references/10-project-profile.md：9 个必填槽位（worker 按 default 计），
// worker.light 可缺省（回退 default）；ticketReview/finalReview 数组 1 项=三路同型号、3 项=逐路指定、
// 2 项=非法（提醒补齐，不静默补默认）；缺失/null/空数组=未配置；未知字段原样保留；
// 模型 ID 形如 provider/model，宿主相关——脚本只查形状，不做在线可用性校验。
export function normalizeModels(raw) {
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
  if (!isObject(raw)) return models;
  const cleanId = value => (typeof value === 'string' ? value.trim() : '');
  for (const slot of ['router', 'early', 'ticketJudge', 'inspector', 'finalJudge', 'offpeak']) {
    const value = raw[slot];
    if (value === null || value === undefined) continue;
    const id = cleanId(value);
    models[slot] = id || value; // 非法形状原样保留，交给 modelsStatus 判「非法」
  }
  const worker = raw.worker;
  if (worker !== null && worker !== undefined) {
    if (isObject(worker)) {
      for (const key of ['default', 'light']) {
        const value = worker[key];
        if (value === null || value === undefined) continue;
        const id = cleanId(value);
        models.worker[key] = id || value;
      }
      for (const [key, value] of Object.entries(worker)) {
        if (!(key in models.worker)) models.worker[key] = clone(value);
      }
    } else {
      models.worker = worker; // worker 整块形状非法 → 原样保留
    }
  }
  for (const slot of ['ticketReview', 'finalReview']) {
    const value = raw[slot];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const ids = value.map(cleanId);
      if (ids.length === 0) continue; // 空数组 = 未配置
      if (ids.every(Boolean) && (ids.length === 1 || ids.length === 3)) {
        models[slot] = ids.length === 1 ? [ids[0], ids[0], ids[0]] : ids;
        continue;
      }
    }
    models[slot] = value; // 长度 2 / 含非字符串项 / 非数组 → 非法，原样保留
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in models)) models[key] = clone(value); // 未知槽位保留
  }
  return models;
}

export function modelsStatus(models) {
  const m = isObject(models) ? models : {};
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
  const slots = {
    router: 'string',
    early: 'string',
    ticketReview: 'array',
    ticketJudge: 'string',
    inspector: 'string',
    finalReview: 'array',
    finalJudge: 'string',
    offpeak: 'string',
  };
  for (const [name, kind] of Object.entries(slots)) {
    const state = stateOf(m[name], kind);
    if (state === 'ok') configured += 1;
    else if (state === 'invalid') invalid.push(name);
    else missing.push(name);
  }
  const workerRaw = m.worker;
  const worker = isObject(workerRaw) ? workerRaw : {};
  if (workerRaw !== null && workerRaw !== undefined && !isObject(workerRaw)) invalid.push('worker');
  const defaultState = stateOf(worker.default, 'string');
  if (defaultState === 'ok') configured += 1;
  else if (defaultState === 'invalid') invalid.push('worker.default');
  else missing.push('worker.default');
  const lightState = stateOf(worker.light, 'string');
  if (lightState === 'invalid') invalid.push('worker.light');
  const workerLight =
    lightState === 'ok' ? 'configured' : defaultState === 'ok' ? 'fallback' : lightState === 'invalid' ? 'invalid' : 'missing';
  return {
    configured,
    total: 9,
    missing,
    invalid,
    workerLight,
    reminder: missing.length > 0 || invalid.length > 0 || workerLight === 'fallback' || workerLight === 'invalid',
  };
}

export function modelsLine(status) {
  const detail = [
    ...status.missing,
    ...status.invalid.map(name => `${name}（非法）`),
    ...(status.workerLight === 'fallback' ? ['worker.light(回退worker.default)'] : []),
  ];
  return `模型分工：${status.configured}/${status.total} 已配置` + (detail.length ? `（缺：${detail.join('、')}）` : '');
}

export function modelsSnippet() {
  return JSON.stringify(
    {
      models: {
        router: null,
        early: null,
        ticketReview: [null, null, null],
        ticketJudge: null,
        worker: { default: null, light: null },
        inspector: null,
        finalReview: [null, null, null],
        finalJudge: null,
        offpeak: null,
      },
    },
    null,
    2
  );
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function exists(file) {
  return fs.existsSync(file);
}

function walk(root, rel = '', out = []) {
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, child, out);
    else out.push(child);
  }
  return out;
}

function runtimeFiles(root) {
  const out = [];
  for (const item of RUNTIME_ITEMS) {
    const full = path.join(root, item);
    if (!exists(full)) continue;
    if (fs.statSync(full).isDirectory()) {
      for (const file of walk(full)) out.push(`${item}/${file}`);
    } else {
      out.push(item);
    }
  }
  return out.sort();
}

function digestFiles(root, files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update('\0');
  }
  return { files: files.length, sha256: hash.digest('hex') };
}

export function digestDir(root) {
  return digestFiles(root, walk(root).sort());
}

function digestSkill(root, name) {
  return name === 'dev-flow' ? digestFiles(root, runtimeFiles(root)) : digestDir(root);
}

function copyRuntimeSkill(from, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of RUNTIME_ITEMS) {
    const source = path.join(from, item);
    if (!exists(source)) continue;
    const target = path.join(dest, item);
    fs.cpSync(source, target, { recursive: true });
  }
}

function copySkill(from, name, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  if (name === 'dev-flow') copyRuntimeSkill(path.join(from, name), dest);
  else fs.cpSync(path.join(from, name), dest, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function acquireLock(skillsRoot) {
  fs.mkdirSync(skillsRoot, { recursive: true });
  const lock = path.join(skillsRoot, '.dev-flow-install.lock');
  try {
    const fd = fs.openSync(lock, 'wx');
    fs.writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }, null, 2)
    );
    fs.closeSync(fd);
    return lock;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let stale = false;
    try {
      stale = Date.now() - fs.statSync(lock).mtimeMs > LOCK_TTL_MS;
    } catch {
      stale = true;
    }
    if (!stale) {
      fail(`安装锁存在：${lock}（另一个安装进程在运行；10 分钟后自动失效）`);
    }
    fs.rmSync(lock, { force: true });
    return acquireLock(skillsRoot);
  }
}

function releaseLock(lock) {
  try {
    fs.rmSync(lock, { force: true });
  } catch {
    /* 锁清理失败不掩盖安装结果 */
  }
}

function loadKit(from) {
  const kitPath = path.join(from, 'kit.json');
  if (!exists(kitPath)) throw new Error(`缺少 ${kitPath}`);
  return readJson(kitPath);
}

function loadSources(from) {
  const file = path.join(from, 'vendor', 'upstream', 'SOURCES.json');
  if (!exists(file)) throw new Error(`缺少 ${file}`);
  return readJson(file);
}

function nodeMajor() {
  return Number(process.versions.node.split('.')[0]);
}

function hasCommand(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', stdio: 'ignore' });
  return result.status === 0;
}

function canWriteDir(dir) {
  // --check 不落盘：只对最近一个已存在的父目录做 W_OK 判断。
  let probe = path.resolve(dir);
  while (!exists(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  try {
    fs.accessSync(probe, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveProfile(root) {
  const file = path.join(root, '.dev-flow.json');
  if (!exists(file)) {
    const profile = clone(DEFAULT_PROFILE);
    profile.models = normalizeModels(null);
    return profile;
  }
  let raw;
  try {
    raw = readJson(file);
  } catch (error) {
    throw new Error(`无法解析 ${file}：${error.message}`);
  }
  const profile = deepMerge(DEFAULT_PROFILE, raw);
  profile.models = normalizeModels(isObject(raw) ? raw.models : null);
  return profile;
}

function scriptsOf(root) {
  const file = path.join(root, 'package.json');
  if (!exists(file)) return {};
  try {
    return readJson(file).scripts || {};
  } catch {
    return {};
  }
}

export function detectProfile(root) {
  const pkgFile = path.join(root, 'package.json');
  let pkg = {};
  try {
    pkg = exists(pkgFile) ? readJson(pkgFile) : {};
  } catch {
    pkg = {};
  }
  const scripts = pkg.scripts || {};
  const firstExisting = candidates =>
    candidates.find(item => exists(path.join(root, item))) || null;
  const glossary =
    firstExisting(['docs/dev-guide/glossary.md', 'docs/glossary.md', 'GLOSSARY.md']) || null;
  const hasIssues = Boolean(scripts['issues:add'] || scripts['issues:index']);
  const hasSlots = Boolean(scripts['wt:claim'] && scripts['wt:done']);

  return {
    version: 1,
    project: pkg.name || path.basename(path.resolve(root)),
    docs: {
      glossary,
      design: 'docs/design',
      implemented: 'docs/implemented',
    },
    ledger: hasIssues
      ? {
          mode: 'command',
          add: scripts['issues:add'] ? 'npm run issues:add --' : null,
          index: scripts['issues:index'] ? 'npm run issues:index' : null,
          pitfalls: 'docs/issues/pitfalls.md',
          deferred: 'docs/issues/deferred.md',
        }
      : {
          mode: 'manual',
          add: null,
          index: null,
          pitfalls: 'docs/issues/pitfalls.md',
          deferred: 'docs/issues/deferred.md',
        },
    changelog: exists(path.join(root, 'changelog'))
      ? { mode: 'fragment', dir: 'changelog' }
      : { mode: 'none', dir: 'changelog' },
    finishGate: scripts['wt:done']
      ? { command: 'npm run wt:done', required: true }
      : scripts['test:release']
        ? { command: 'npm run test:release', required: false }
        : { command: null, required: false },
    taskchron: { mode: 'auto' },
    slots: hasSlots
      ? {
          enabled: true,
          claim: 'npm run wt:claim --',
          done: 'npm run wt:done',
          dir: null,
        }
      : { enabled: false, claim: null, done: null, dir: null },
    audit: {
      designDocGlobs: ['docs/design/**/*.yaml', 'docs/design/**/*.yml'],
      allowNonCodeGlobs: [],
    },
  };
}

function check(opts) {
  let kit;
  let sources;
  try {
    kit = loadKit(opts.from);
    sources = loadSources(opts.from);
  } catch (error) {
    return {
      ok: false,
      mode: 'check',
      error: error.message,
      skillsRoot: path.resolve(opts.skillsRoot),
    };
  }
  const major = nodeMajor();
  const minNode = Number(kit.minNode || 20);
  const skillsRoot = path.resolve(opts.skillsRoot);
  const missing = [];
  const problems = [];
  const skills = [];

  for (const name of CORE_SKILLS) {
    const sourceDir = path.join(opts.from, name);
    const installedDir = path.join(skillsRoot, name);
    if (!exists(sourceDir)) {
      missing.push(name);
      skills.push({ name, state: 'missing-source' });
      continue;
    }
    if (!exists(installedDir)) {
      missing.push(name);
      skills.push({ name, state: 'missing' });
      continue;
    }
    const same = digestSkill(sourceDir, name).sha256 === digestSkill(installedDir, name).sha256;
    skills.push({ name, state: same ? 'current' : 'different' });
    if (!same) problems.push(name);
  }

  const upstreamMissing = [];
  const upstreamDifferent = [];
  for (const item of sources.skills.filter(entry => entry.install)) {
    const sourceDir = path.join(opts.from, 'vendor', 'upstream', item.name);
    const installedDir = path.join(skillsRoot, item.name);
    if (!exists(installedDir)) upstreamMissing.push(item.name);
    else if (exists(sourceDir) && digestDir(sourceDir).sha256 !== digestDir(installedDir).sha256) {
      upstreamDifferent.push(item.name);
    }
  }

  return {
    ok:
      major >= minNode &&
      missing.length === 0 &&
      problems.length === 0 &&
      upstreamMissing.length === 0,
    mode: 'check',
    node: process.versions.node,
    minNode,
    nodeOk: major >= minNode,
    git: hasCommand('git'),
    skillsRoot,
    writable: canWriteDir(skillsRoot),
    source: path.resolve(opts.from),
    version: kit.version,
    skills,
    missing,
    problems,
    upstreamMissing,
    upstreamDifferent,
  };
}

function install(opts) {
  let kit;
  let sources;
  try {
    kit = loadKit(opts.from);
    sources = loadSources(opts.from);
  } catch (error) {
    fail(error.message);
  }
  const major = nodeMajor();
  if (major < Number(kit.minNode || 20)) {
    fail(`Node ${process.versions.node} 低于要求 ${kit.minNode}，请先升级 Node。`);
  }
  const missingCore = CORE_SKILLS.filter(name => !exists(path.join(opts.from, name, 'SKILL.md')));
  if (missingCore.length) fail(`安装源缺少核心技能：${missingCore.join('、')}`);

  const skillsRoot = path.resolve(opts.skillsRoot);
  const lock = acquireLock(skillsRoot);
  try {
    const maintainer = exists(path.join(skillsRoot, 'dev-flow', 'IMPLEMENTATION'));
    if (maintainer && !opts.force) {
      fail(
        `检测到维护者副本（${path.join(skillsRoot, 'dev-flow', 'IMPLEMENTATION')}）。` +
          ' 安装会备份并替换它；确认继续请加 --force。'
      );
    }

    const stamp = timestamp();
    const backupRoot = path.join(skillsRoot, '.dev-flow-backup', stamp);
    const result = {
      ok: true,
      mode: 'install',
      version: kit.version,
      skillsRoot,
      source: path.resolve(opts.from),
      backupDir: null,
      installed: [],
      kept: [],
      replaced: [],
      warnings: [],
      skills: {},
    };

    const backup = (name, dest) => {
      const target = path.join(backupRoot, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(dest, target, { recursive: true });
      result.backupDir = backupRoot;
      return target;
    };

    for (const name of CORE_SKILLS) {
      const sourceDir = path.join(opts.from, name);
      const dest = path.join(skillsRoot, name);
      const sourceDigest = digestSkill(sourceDir, name);
      if (exists(dest)) {
        const installedDigest = digestSkill(dest, name);
        if (installedDigest.sha256 === sourceDigest.sha256) {
          result.kept.push(name);
          result.skills[name] = { ...sourceDigest, status: 'kept' };
          continue;
        }
        backup(name, dest);
        result.replaced.push(name);
      }
      try {
        copySkill(opts.from, name, dest);
      } catch (error) {
        const restored = exists(path.join(backupRoot, name));
        if (restored) {
          fs.rmSync(dest, { recursive: true, force: true });
          fs.cpSync(path.join(backupRoot, name), dest, { recursive: true });
        }
        fail(
          `写入 ${name} 失败：${error.message}` +
            (restored ? '（已从备份恢复）' : '') +
            '。若文件被占用，请关闭相关会话后重试。'
        );
      }
      if (!result.replaced.includes(name)) result.installed.push(name);
      result.skills[name] = { ...digestSkill(dest, name), status: 'installed' };
    }

    for (const item of sources.skills.filter(entry => entry.install)) {
      const sourceDir = path.join(opts.from, 'vendor', 'upstream', item.name);
      const dest = path.join(skillsRoot, item.name);
      if (!exists(sourceDir)) {
        result.warnings.push(`安装源缺少上游技能：${item.name}`);
        continue;
      }
      const sourceDigest = digestDir(sourceDir);
      if (exists(dest)) {
        const installedDigest = digestDir(dest);
        if (installedDigest.sha256 === sourceDigest.sha256) {
          result.kept.push(item.name);
          result.skills[item.name] = { ...installedDigest, status: 'kept' };
          continue;
        }
        if (!opts.forceUpstream) {
          result.kept.push(item.name);
          result.skills[item.name] = { ...installedDigest, status: 'kept-existing' };
          result.warnings.push(
            `保留已存在的上游技能 ${item.name}（版本不同；--force-upstream 可备份后替换）`
          );
          continue;
        }
        backup(item.name, dest);
        result.replaced.push(item.name);
      }
      fs.cpSync(sourceDir, dest, { recursive: true });
      if (!result.replaced.includes(item.name)) result.installed.push(item.name);
      result.skills[item.name] = { ...digestDir(dest), status: 'installed' };
    }

    const receipt = {
      version: kit.version,
      installedAt: new Date().toISOString(),
      source: path.resolve(opts.from),
      skillsRoot,
      backupDir: result.backupDir,
      skills: result.skills,
      warnings: result.warnings,
    };
    writeJson(path.join(skillsRoot, '.dev-flow-install.json'), receipt);
    result.receipt = path.join(skillsRoot, '.dev-flow-install.json');
    return result;
  } finally {
    releaseLock(lock);
  }
}

function verify(opts) {
  const skillsRoot = path.resolve(opts.skillsRoot);
  const receiptPath = path.join(skillsRoot, '.dev-flow-install.json');
  if (!exists(receiptPath)) {
    fail(`缺少安装回执：${receiptPath}。先运行 --install。`);
  }
  const receipt = readJson(receiptPath);
  const problems = [];
  const checked = [];

  for (const [name, info] of Object.entries(receipt.skills || {})) {
    const dir = path.join(skillsRoot, name);
    if (!exists(dir)) {
      problems.push(`${name}: 缺失`);
      continue;
    }
    const digest = digestSkill(dir, name);
    if (digest.sha256 !== info.sha256) problems.push(`${name}: 哈希不一致`);
    else checked.push(name);
  }

  const smokeScript = path.join(skillsRoot, 'dev-flow', 'scripts', 'flow-status.mjs');
  const smoke = exists(smokeScript)
    ? spawnSync(process.execPath, [smokeScript, '--help'], { encoding: 'utf8' })
    : { status: 1, stderr: '缺少 flow-status.mjs' };
  if (smoke.status !== 0) problems.push('flow-status.mjs --help 冒烟失败');

  return {
    ok: problems.length === 0,
    mode: 'verify',
    skillsRoot,
    receipt: receiptPath,
    version: receipt.version,
    checked: checked.length,
    problems,
  };
}

function projectInit(opts) {
  const root = path.resolve(opts.root);
  const file = path.join(root, '.dev-flow.json');
  const profile = detectProfile(root);
  // models 块不由 setup 生成/维护（路由维护），一致性比对忽略它，避免「只为 models 差异就要 --force」。
  const modelsOf = existing => modelsStatus(normalizeModels(isObject(existing) ? existing.models : null));
  if (exists(file)) {
    let existing;
    try {
      existing = readJson(file);
    } catch (error) {
      fail(`现有 ${file} 无法解析：${error.message}`);
    }
    const { models: _ignored, ...rest } = existing;
    if (JSON.stringify(rest) === JSON.stringify(profile)) {
      return {
        ok: true,
        mode: 'project-init',
        path: file,
        created: false,
        dryRun: opts.dryRun,
        profile,
        models: modelsOf(existing),
      };
    }
    if (!opts.force) {
      fail(`${file} 已存在且内容不同；确认覆盖请加 --force。`);
    }
  }
  if (!opts.dryRun) writeJson(file, profile);
  return {
    ok: true,
    mode: 'project-init',
    path: file,
    created: !exists(file) || !opts.dryRun,
    dryRun: opts.dryRun,
    profile,
    models: modelsOf(profile.models ?? null),
  };
}

function printHuman(result) {
  if (result.mode === 'check') {
    console.log('【dev-flow-setup 体检】');
    console.log(`Node：${result.node || process.versions.node}（要求 >= ${result.minNode || 20}）`);
    console.log(`技能根：${result.skillsRoot}`);
    console.log(`安装源：${result.source || '(缺失)'}`);
    if (result.error) console.log(`错误：${result.error}`);
    for (const item of result.skills || []) {
      console.log(`  ${item.state === 'current' ? '✔' : '✘'} ${item.name} [${item.state}]`);
    }
    if (result.upstreamMissing?.length) {
      console.log(`  缺少上游技能 ${result.upstreamMissing.length} 个：${result.upstreamMissing.join('、')}`);
    }
    if (result.upstreamDifferent?.length) {
      console.log(`  上游技能版本不同 ${result.upstreamDifferent.length} 个：${result.upstreamDifferent.join('、')}`);
    }
    console.log(`结论：${result.ok ? 'PASS' : 'FAIL（先跑 --install）'}`);
    return;
  }
  if (result.mode === 'install') {
    console.log('【dev-flow-setup 安装】');
    console.log(`版本：${result.version}`);
    console.log(`技能根：${result.skillsRoot}`);
    console.log(`安装：${result.installed.length ? result.installed.join('、') : '无'}`);
    console.log(`保留：${result.kept.length ? result.kept.join('、') : '无'}`);
    if (result.backupDir) console.log(`备份：${result.backupDir}`);
    if (result.warnings.length) console.log(`提示：\n  - ${result.warnings.join('\n  - ')}`);
    console.log(`回执：${result.receipt}`);
    return;
  }
  if (result.mode === 'verify') {
    console.log('【dev-flow-setup 验证】');
    console.log(`技能根：${result.skillsRoot}`);
    console.log(`已校验：${result.checked} 项`);
    if (result.problems.length) console.log(`问题：\n  - ${result.problems.join('\n  - ')}`);
    console.log(`结论：${result.ok ? 'PASS' : 'FAIL'}`);
    return;
  }
  if (result.mode === 'project-init') {
    console.log('【dev-flow-setup 项目配置】');
    console.log(`文件：${result.path}`);
    console.log(`模式：${result.dryRun ? 'dry-run（未写盘）' : result.created ? '已写入' : '已存在且一致'}`);
    console.log(JSON.stringify(result.profile, null, 2));
    const models = result.models;
    if (models?.reminder) {
      console.log(`【缺模型配置】${modelsLine(models)}`);
      if (models.invalid.length) {
        console.log(`  非法配置（须补齐，不静默补默认）：${models.invalid.join('、')}`);
      }
      console.log('  把下面片段粘进 .dev-flow.json 顶层对象，null 换成实际模型 ID（形如 provider/model；');
      console.log('  ticketReview/finalReview 数组给 1 项=三路同型号、3 项=逐路指定，2 项非法）：');
      for (const line of modelsSnippet().split('\n')) console.log(`  ${line}`);
      console.log('  未配置时 dev-flow 会在对应环节停下问你，不静默用默认。');
    }
  }
}

function parseArgs(argv) {
  const opts = {
    mode: null,
    from: DEFAULT_FROM,
    skillsRoot: DEFAULT_SKILLS_ROOT,
    root: process.cwd(),
    json: false,
    force: false,
    forceUpstream: false,
    dryRun: false,
  };
  const setMode = mode => {
    if (opts.mode && opts.mode !== mode) fail(`一次只能选一个模式（已选 ${opts.mode}，又给 ${mode}）`);
    opts.mode = mode;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) fail(`参数 ${arg} 需要一个路径值`);
      i += 1;
      return next;
    };
    switch (arg) {
      case '--check':
        setMode('check');
        break;
      case '--install':
        setMode('install');
        break;
      case '--verify':
        setMode('verify');
        break;
      case '--project-init':
        setMode('project-init');
        break;
      case '--from':
        opts.from = path.resolve(value());
        break;
      case '--skills-root':
        opts.skillsRoot = path.resolve(value());
        break;
      case '--root':
        opts.root = path.resolve(value());
        break;
      case '--json':
        opts.json = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--force-upstream':
        opts.forceUpstream = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(
          [
            '用法：node setup.mjs <--check|--install|--verify|--project-init> [选项]',
            '  --from <dir>           安装源（默认：本脚本所在包的根目录）',
            '  --skills-root <dir>    技能根（默认：~/.zcode/skills）',
            '  --root <dir>           --project-init 的项目根（默认：当前目录）',
            '  --json                 输出机器可读 JSON',
            '  --force                允许替换维护者副本 / 覆盖已有配置',
            '  --force-upstream       允许备份后替换已存在的不同版本上游技能',
            '  --dry-run              --project-init 只打印不写盘',
            '  --help                 显示本帮助',
          ].join('\n')
        );
        process.exit(0);
        break;
      default:
        fail(`未知参数 ${arg}（用 --help 查看用法）`);
    }
  }
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
    opts.mode = opts.mode || 'check';
    let result;
    if (opts.mode === 'check') result = check(opts);
    else if (opts.mode === 'install') result = install(opts);
    else if (opts.mode === 'verify') result = verify(opts);
    else result = projectInit(opts);

    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);

    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(`[dev-flow-setup] ✘ ${error.message}`);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();

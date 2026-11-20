#!/usr/bin/env node
/**
 * 一键安装入口：node install.mjs [--check|--install|--verify|--project-init] [...]
 *
 * 默认执行 --install，安装源固定为本仓根目录。其余参数原样转给
 * dev-flow-setup/scripts/setup.mjs。
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SETUP = path.join(ROOT, 'dev-flow-setup', 'scripts', 'setup.mjs');
const args = process.argv.slice(2);
const modes = ['--check', '--install', '--verify', '--project-init'];
if (!args.some(arg => modes.includes(arg))) args.unshift('--install');
if (!args.includes('--from')) args.push('--from', ROOT);

const result = spawnSync(process.execPath, [SETUP, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);

#!/usr/bin/env node
// @ts-check
// Opens the office dashboard for a project.
// Usage: npm run office -- --project <path to a project with a .team folder> [--port 4317]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createOfficeServer } from '../dashboard/server.mjs';

const KIT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 4317;
const PROJECT_HINT = 'Use --project <path to a project with a .team folder>';

/**
 * @param {string[]} argv arguments after the script name
 * @param {{ cwd: string }} io
 * @returns {{ project: string, port: number } | { error: string }}
 */
export function parseOfficeArgs(argv, { cwd }) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { project: { type: 'string' }, port: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    return { error: `${/** @type {Error} */ (e).message}. ${PROJECT_HINT} [--port <1-65535>]` };
  }
  if (!values.project) return { error: PROJECT_HINT };
  const project = path.resolve(cwd, values.project);
  if (!fs.statSync(path.join(project, '.team'), { throwIfNoEntry: false })?.isDirectory()) {
    return { error: `${project} has no .team folder. ${PROJECT_HINT}` };
  }
  let port = DEFAULT_PORT;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!/^\d+$/.test(values.port) || port < 1 || port > 65535) {
      return { error: `--port must be a whole number from 1 to 65535 (got "${values.port}").` };
    }
  }
  return { project, port };
}

/** Run `npm run build` in the kit folder and wait for it. @returns {Promise<void>} */
function defaultBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: KIT_DIR, stdio: 'inherit', shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm run build exited with ${code}`))));
  });
}

/**
 * Open a URL in the default browser. Errors are ignored: the URL is printed anyway.
 * @param {string} url
 */
function defaultOpen(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignore
  }
}

/**
 * @param {string[]} argv
 * @param {{
 *   cwd: string, stdout: (s: string) => void, stderr: (s: string) => void,
 *   open?: (url: string) => void, build?: () => Promise<void> | void, distDir?: string,
 *   onReady?: (info: { server: import('node:http').Server, url: string }) => void | Promise<void>,
 * }} io
 * @returns {Promise<number>} exit code, once the server has stopped
 */
export async function main(argv, io) {
  const fail = (/** @type {string} */ s) => { io.stderr(`${s}\n`); return 1; };
  const parsed = parseOfficeArgs(argv, { cwd: io.cwd });
  if ('error' in parsed) return fail(parsed.error);

  const distDir = io.distDir ?? path.join(KIT_DIR, 'dashboard', 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    io.stdout('Building the office (first run only)...\n');
    try {
      await (io.build ?? defaultBuild)();
    } catch (e) {
      return fail(`The office build failed: ${/** @type {Error} */ (e).message}`);
    }
  }

  const server = createOfficeServer({ projectDir: parsed.project, distDir });
  const listenError = await new Promise((resolve) => {
    server.once('error', resolve);
    server.listen(parsed.port, '127.0.0.1', () => resolve(null));
  });
  if (listenError) {
    const e = /** @type {NodeJS.ErrnoException} */ (listenError);
    if (e.code === 'EADDRINUSE') return fail(`Port ${parsed.port} is already in use. Try another with --port <number>.`);
    return fail(`Cannot start the office: ${e.message}`);
  }

  const url = `http://127.0.0.1:${parsed.port}`;
  io.stdout(`Office is open at ${url}\n`);
  (io.open ?? defaultOpen)(url);
  const closed = new Promise((resolve) => server.once('close', resolve));
  if (io.onReady) await io.onReady({ server, url });
  await closed;
  return 0;
}

/** True when this file is the entry script, directly or through a symlink. */
function isMain() {
  try {
    const arg = process.argv[1];
    if (!arg) return false;
    if (import.meta.url === pathToFileURL(arg).href) return true;
    return fs.realpathSync(arg) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const running = main(process.argv.slice(2), {
    cwd: process.env.INIT_CWD ?? process.cwd(), // npm sets INIT_CWD to where the user ran it
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    onReady: ({ server }) => {
      process.once('SIGINT', () => { server.closeAllConnections(); server.close(); });
      process.once('SIGTERM', () => { server.closeAllConnections(); server.close(); });
    },
  });
  process.exit(await running);
}

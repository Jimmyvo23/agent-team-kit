// @ts-check
/**
 * Local office dashboard server. Folds `.team/events.jsonl` into TeamState,
 * serves it at GET /api/team (and writes agent-status.json), and serves the built UI.
 * Node built-ins only. The caller listens, on 127.0.0.1.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loadTeam } from '../lib/team.mjs';
import { readEvents } from '../lib/events.mjs';
import { buildState } from '../lib/state.mjs';
import { rotateIfNeeded, DEFAULT_MAX_BYTES } from '../lib/rotate.mjs';
import { logPath } from '../lib/paths.mjs';

const ROTATE_EVERY_MS = 60_000;
const TEAM_HINT = 'Fix .team/team.json and this page will reload.';

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/**
 * @param {{ projectDir: string, distDir: string, now?: () => Date, maxBytes?: number, rotate?: typeof rotateIfNeeded }} options
 * @returns {http.Server}
 */
export function createOfficeServer({ projectDir, distDir, now = () => new Date(), maxBytes = DEFAULT_MAX_BYTES, rotate = rotateIfNeeded }) {
  const root = path.resolve(distDir);
  const teamFile = path.join(projectDir, '.team', 'team.json');
  const log = logPath(projectDir);
  const warned = new Set();
  let lastRotation = -Infinity;

  /** @param {string} text */
  function warnOnce(text) {
    if (warned.has(text)) return;
    warned.add(text);
    console.warn(`[agent-team-kit] ${text}`);
  }

  /** @param {http.ServerResponse} res @param {number} status @param {unknown} body @param {Record<string,string>} [headers] */
  function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  /** @param {http.ServerResponse} res */
  function handleTeam(res) {
    const loaded = loadTeam(teamFile);
    if (!loaded.ok) return sendJson(res, 500, { error: loaded.error, hint: TEAM_HINT });
    try {
      const at = now();
      if (at.getTime() - lastRotation >= ROTATE_EVERY_MS) {
        lastRotation = at.getTime();
        try {
          rotate(log, loaded.team, at, maxBytes);
        } catch (err) {
          warnOnce(`log rotation failed: ${/** @type {Error} */ (err).message}`);
        }
      }
      const { events, warnings } = readEvents(log);
      for (const w of warnings) warnOnce(`events.jsonl: ${w}`);
      const state = buildState(events, loaded.team, at);
      writeStatusFile(state);
      sendJson(res, 200, state);
    } catch (err) {
      sendJson(res, 500, { error: `cannot read team activity: ${/** @type {Error} */ (err).message}`, hint: 'Check .team/events.jsonl and reload.' });
    }
  }

  /** Atomic write: temp file in the same folder, then rename. @param {unknown} state */
  function writeStatusFile(state) {
    const target = path.join(projectDir, 'agent-status.json');
    const tmp = `${target}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
      fs.renameSync(tmp, target);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      warnOnce(`could not write agent-status.json: ${/** @type {Error} */ (err).message}`);
    }
  }

  /** @param {string} file @returns {boolean} true when file is a regular file inside the dist root */
  function isServable(file) {
    try {
      if (!fs.statSync(file).isFile()) return false;
      const real = fs.realpathSync(file);
      return real.startsWith(fs.realpathSync(root) + path.sep);
    } catch {
      return false;
    }
  }

  /** @param {http.ServerResponse} res @param {string} file */
  function sendFile(res, file) {
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  /** @param {http.ServerResponse} res */
  function notFound(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }

  /** @param {string} rawUrl @param {http.ServerResponse} res */
  function handleStatic(rawUrl, res) {
    // Not `new URL()`: it would collapse ".." before we can reject it.
    const rawPath = rawUrl.split(/[?#]/)[0];
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return notFound(res);
    }
    if (decoded.includes('\0')) return notFound(res);
    const file = path.resolve(root, '.' + path.sep + decoded.replace(/^\/+/, ''));
    if (file !== root && !file.startsWith(root + path.sep)) return notFound(res);
    if (isServable(file)) return sendFile(res, file);
    const index = path.join(root, 'index.html');
    if (isServable(index)) return sendFile(res, index);
    return notFound(res);
  }

  return http.createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end('Method not allowed');
    }
    const url = req.url ?? '/';
    if (url.split(/[?#]/)[0] === '/api/team') return handleTeam(res);
    return handleStatic(url, res);
  });
}

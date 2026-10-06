// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * Is there a plugin directory called `name` under any `<cacheDir>/<marketplace>/`?
 * @param {string} cacheDir
 * @param {string} name
 * @returns {boolean}
 */
function hasPlugin(cacheDir, name) {
  let markets;
  try {
    markets = fs.readdirSync(cacheDir);
  } catch {
    return false;
  }
  return markets.some((m) => {
    try {
      return fs.statSync(path.join(cacheDir, m, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * Report everything that stops the installer from running.
 * @param {{ targetDir: string, nodeVersion: string, homeDir: string }} opts
 * @returns {string[]} one sentence per problem; empty when all is well
 */
export function checkPrereqs({ targetDir, nodeVersion, homeDir }) {
  /** @type {string[]} */
  const problems = [];
  const major = Number.parseInt(String(nodeVersion).replace(/^v/i, ''), 10);
  if (!(major >= 20)) {
    problems.push(`Node 20 or newer is required but this is ${nodeVersion}; install a current Node LTS and re-run.`);
  }
  if (!fs.existsSync(path.join(targetDir, '.git'))) {
    problems.push(`${targetDir} is not a Git repository; run "git init" there (or pick the right folder) and re-run.`);
  }
  const cacheDir = path.join(homeDir, '.claude', 'plugins', 'cache');
  if (!hasPlugin(cacheDir, 'superpowers')) {
    problems.push('The Superpowers plugin is not installed; install it in Claude Code with /plugin and re-run.');
  }
  if (!hasPlugin(cacheDir, 'frontend-design')) {
    problems.push('The frontend-design plugin is not installed; install it in Claude Code with /plugin and re-run.');
  }
  return problems;
}

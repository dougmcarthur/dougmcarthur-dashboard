/**
 * Run this repository's wrangler from a script, the same way on every platform.
 *
 * The scripts used to call `execFileSync('npx', ['wrangler', ...])`, which
 * works on macOS and Linux and fails on Windows with `spawnSync npx ENOENT`:
 * there `npx` is `npx.cmd`, and Node does not resolve a `.cmd` without a
 * shell. Adding `shell: true` would fix the lookup and break the arguments —
 * a temp-file path with a space in it, or SQL with an apostrophe, would then
 * need quoting for `cmd.exe`, which is its own dialect.
 *
 * So this skips the launcher and runs wrangler's own JS entry under the Node
 * already running the script. No shell, no quoting, and it is the installed
 * wrangler that `npx wrangler` would have found anyway — resolved from here,
 * so it never falls through to a download.
 */

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Resolved on first call, so a dry run or a refused flag never needs wrangler. */
function entry() {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('wrangler/package.json')
  return join(dirname(manifestPath), require(manifestPath).bin.wrangler)
}

/**
 * `execFileSync` with wrangler as the program: `args` are wrangler's
 * arguments, `options` pass through unchanged — including `stdio`, which
 * callers rely on.
 */
export function wrangler(args, options) {
  return execFileSync(process.execPath, [entry(), ...args], options)
}

// Use the supported public migration command, not private bundled module names.
const {execFileSync} = require('node:child_process');
try {
  execFileSync('openclaw', ['doctor', '--fix', '--non-interactive'], {
    env: process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
  });
  console.log('[alphaclaw] OpenClaw public state/auth migration completed');
} catch {
  console.error('[alphaclaw] OpenClaw migration failed; inspect doctor diagnostics');
  process.exitCode = 1;
}

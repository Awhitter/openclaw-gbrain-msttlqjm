// A single PGLite owner serves all OpenClaw sessions. Render supervises this process.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    process.exit(code);
  }, 15000);
  const check = () => {if (children.every(c => c.exitCode !== null || c.signalCode !== null)) {clearTimeout(timer); process.exit(code);}};
  children.forEach(c => c.once('exit', check)); check();
}
function start(command, args) {
  const child = spawn(command, args, {env: process.env, stdio: 'inherit'});
  children.push(child);
  child.once('error', () => {console.error('[supervisor] Required service failed to start'); stop(1);});
  child.once('exit', code => {if (!stopping) {console.error('[supervisor] Required service exited'); stop(code || 1);}});
  return child;
}
function privateValue(file, create) {
  if (!fs.existsSync(file)) {
    const value = create();
    const temporary = file + '.new';
    fs.writeFileSync(temporary, value, {mode: 0o600}); fs.renameSync(temporary, file);
  }
  fs.chmodSync(file, 0o600);
  return fs.readFileSync(file, 'utf8').trim();
}
async function main() {
  if (process.env.GBRAIN_WEB_CHAT !== '1') {start(process.argv[2], process.argv.slice(3)); return;}
  process.env.OPENCLAW_STATE_DIR = path.join(process.env.ALPHACLAW_ROOT_DIR, '.openclaw');
  process.env.ALPHACLAW_SKIP_SYSTEM_CRON_INSTALL = '1';
  const envFile = path.join(process.env.ALPHACLAW_ROOT_DIR, '.env');
  const managedKeys = ['SETUP_PASSWORD', 'OPENCLAW_GATEWAY_TOKEN', 'REMOTE_MCP_API_TOKEN', 'REMOTE_MCP_URL', 'REMOTE_MCP_NAME', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GBRAIN_WEB_CHAT'];
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split('\n') : [];
  const retained = lines.filter(line => !managedKeys.includes(line.split('=')[0].trim()));
  for (const key of managedKeys) if (process.env[key]) retained.push(`${key}=${process.env[key]}`);
  fs.writeFileSync(envFile, retained.join('\n'), {mode: 0o600}); fs.chmodSync(envFile, 0o600);
  const stateDir = path.join(process.env.OPENCLAW_STATE_DIR, 'state');
  const stateBackup = path.join(process.env.ALPHACLAW_ROOT_DIR, 'backups', 'openclaw-state-before-2026.9.8');
  if (fs.existsSync(stateDir) && !fs.existsSync(stateBackup)) {
    fs.mkdirSync(path.dirname(stateBackup), {recursive: true, mode: 0o700});
    fs.cpSync(stateDir, stateBackup, {recursive: true});
  }
  // Upgrade existing shared state before the gateway or CLI agent opens it.
  execFileSync('openclaw', ['doctor', '--fix', '--non-interactive'], {stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000});
  console.log('[supervisor] OpenClaw state migration completed');
  const cronDir = path.join(process.env.OPENCLAW_STATE_DIR, 'cron');
  fs.mkdirSync(cronDir, {recursive: true});
  fs.writeFileSync(path.join(cronDir, 'system-sync.json'), JSON.stringify({enabled: false, schedule: '0 * * * *'}));
  const dir = path.join(process.env.GBRAIN_HOME, '.gbrain', 'serve');
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  process.env.GBRAIN_ADMIN_BOOTSTRAP_TOKEN = privateValue(path.join(dir, 'admin-token'), () => crypto.randomBytes(32).toString('hex'));
  process.env.GBRAIN_LOCAL_MCP_TOKEN = privateValue(path.join(dir, 'openclaw-token'), () => {
    // Capture the credential; never copy the CLI's credential output into service logs.
    const output = execFileSync('gbrain', ['auth', 'create', 'openclaw-' + crypto.randomUUID(), '--scopes', 'read,write'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    const token = output.match(/^\s*(gbrain_[A-Za-z0-9_-]+)\s*$/m)?.[1];
    if (!token) throw new Error('GBrain local credential creation did not return a token');
    return token;
  });
  start('gbrain', ['serve', '--http', '--port', '3131', '--bind', '127.0.0.1', '--surface', 'full', '--suppress-bootstrap-token']);
  let ready = false;
  for (let n = 0; n < 120 && !stopping; n++) {
    try { const response = await fetch('http://127.0.0.1:3131/health', {signal: AbortSignal.timeout(1500)}); if (response.ok) {ready = true; break;} } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('GBrain memory service did not become healthy');
  console.log('[supervisor] Shared memory service ready; starting authenticated chat');
  start(process.argv[2], process.argv.slice(3));
}
process.on('SIGTERM', () => stop(0)); process.on('SIGINT', () => stop(0));
main().catch(() => {console.error('[supervisor] Startup failed; credentials withheld from logs'); stop(1);});

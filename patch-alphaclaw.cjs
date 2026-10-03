// Enable an explicit browser-chat deployment profile in the pinned wrapper.
// Authentication, provider validation and the normal onboarding sequence remain intact.
const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Pinned AlphaClaw source changed; review the browser profile patch');
  return source.replace(before, after);
}

function patchValidation(source) {
  return replaceOnce(source,
    '  const hasGithub = !!(githubToken && githubRepoInput);\n  const hasChannel = !!(',
    '  const webChat = process.env.GBRAIN_WEB_CHAT === "1" && varMap.GBRAIN_WEB_CHAT === "1";\n  const hasGithub = webChat || !!(githubToken && githubRepoInput);\n  const hasChannel = webChat || !!(');
}

function patchService(source) {
  source = replaceOnce(source,
    '    } = validation.data;\n\n    const repoUrl = resolveGithubRepoUrl(githubRepoInput);',
    '    } = validation.data;\n\n    const localWorkspace = process.env.GBRAIN_WEB_CHAT === "1" && varMap.GBRAIN_WEB_CHAT === "1";\n    const repoUrl = localWorkspace ? "local/workspace" : resolveGithubRepoUrl(githubRepoInput);');
  source = replaceOnce(source,
    '    upsertEnvVar(varsToSave, "GITHUB_WORKSPACE_REPO", repoUrl);',
    '    if (!localWorkspace) upsertEnvVar(varsToSave, "GITHUB_WORKSPACE_REPO", repoUrl);');
  source = replaceOnce(source,
    '    const repoCheck = await ensureGithubRepoAccessible({',
    '    const repoCheck = localWorkspace ? { ok: true } : await ensureGithubRepoAccessible({');
  source = replaceOnce(source,
    '    const hadImportedGit = importMode && fs.existsSync(`${OPENCLAW_DIR}/.git`);',
    '    if (!localWorkspace) {\n    const hadImportedGit = importMode && fs.existsSync(`${OPENCLAW_DIR}/.git`);');
  source = replaceOnce(source,
    '    if (!fs.existsSync(`${OPENCLAW_DIR}/.gitignore`)) {',
    '    }\n    if (!fs.existsSync(`${OPENCLAW_DIR}/.gitignore`)) {');
  source = replaceOnce(source,
    '    installHourlyGitSyncScript({ fs, openclawDir: OPENCLAW_DIR });\n    await installHourlyGitSyncCron({ fs, openclawDir: OPENCLAW_DIR });',
    '    if (!localWorkspace) {\n      installHourlyGitSyncScript({ fs, openclawDir: OPENCLAW_DIR });\n      await installHourlyGitSyncCron({ fs, openclawDir: OPENCLAW_DIR });\n    }');
  source = replaceOnce(source,
    '    reportProgress("initial_git_push");\n    try {',
    '    if (!localWorkspace) {\n    reportProgress("initial_git_push");\n    try {');
  source = replaceOnce(source,
    '    reportProgress("starting_gateway");',
    '    }\n    reportProgress("starting_gateway");');
  return source;
}

function patchGateway(source) {
  return replaceOnce(source,
    '    if (mcpChanged) changed = true;',
    '    if (mcpChanged) changed = true;\n    if (require("/app/gbrain-config.cjs").configure(cfg)) changed = true;');
}

function patchEnv(source) {
  source = replaceOnce(source, 'let envWatchDebounceTimer = null;',
    'const deploymentEnv = Object.fromEntries(["SETUP_PASSWORD", "OPENCLAW_GATEWAY_TOKEN", "REMOTE_MCP_API_TOKEN", "REMOTE_MCP_URL", "REMOTE_MCP_NAME"].filter(key => process.env[key]).map(key => [key, process.env[key]]));\nlet envWatchDebounceTimer = null;');
  source = replaceOnce(source, '  const vars = readEnvFile();\n  const signature',
    '  const vars = readEnvFile();\n  if (process.env.GBRAIN_WEB_CHAT === "1") for (const [key, value] of Object.entries(deploymentEnv)) {\n    const entry = vars.find(v => v.key === key);\n    if (entry) entry.value = value; else vars.push({key, value});\n  }\n  const signature');
  return source;
}

function patchCommands(source) {
  source = replaceOnce(source, 'const createCommands = ({ gatewayEnv }) => {',
    'const redact = value => { let text = String(value || ""); for (const [key, secret] of Object.entries(process.env)) if (/token|key|password/i.test(key) && secret.length > 6) text = text.split(secret).join("[redacted]"); return text.replace(/(?:sk-|gbrain_)[A-Za-z0-9_-]{16,}/g, "[redacted]"); };\nconst createCommands = ({ gatewayEnv }) => {');
  source = replaceOnce(source, '`[onboard] Running: ${cmd', '`[onboard] Running: ${redact(cmd)');
  source = replaceOnce(source, '          err.cmd = cmd;',
    '          err.cmd = redact(cmd);\n          err.message = redact(err.message);\n          err.stack = redact(err.stack);\n          err.stdout = redact(err.stdout);\n          err.stderr = redact(err.stderr);');
  source = replaceOnce(source, 'String(stderr || err.message || "").slice(0, 300)', 'redact(stderr || err.message || "").slice(0, 300)');
  source = replaceOnce(source, 'stdout.trim().slice(0, 300)', 'redact(stdout.trim()).slice(0, 300)');
  return source;
}

function patchSystem(source) {
  return replaceOnce(source, 'const result = await clawCmd(command, { quiet: true });',
    'const result = await clawCmd(command, { quiet: true, timeoutMs: 180000 });');
}

if (require.main === module) {
  const base = path.dirname(require.resolve('@chrysb/alphaclaw/package.json'));
  const changes = [
    ['lib/server/onboarding/validation.js', patchValidation],
    ['lib/server/onboarding/index.js', patchService],
    ['lib/server/gateway.js', patchGateway],
    ['lib/server/env.js', patchEnv],
    ['lib/server/commands.js', patchCommands],
    ['lib/server/routes/system.js', patchSystem],
  ].map(([relative, transform]) => {
    const file = path.join(base, relative);
    const patched = transform(fs.readFileSync(file, 'utf8'));
    new Function('require', 'module', 'exports', patched);
    return [file, patched];
  });
  for (const [file, patched] of changes) fs.writeFileSync(file, patched);
  console.log('Applied explicit authenticated browser-chat onboarding profile');
}
module.exports = {patchValidation, patchService, patchGateway, patchEnv, patchCommands, patchSystem};

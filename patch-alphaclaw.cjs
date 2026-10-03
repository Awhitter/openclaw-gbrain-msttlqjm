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

if (require.main === module) {
  const base = path.dirname(require.resolve('@chrysb/alphaclaw/package.json'));
  const changes = [
    ['lib/server/onboarding/validation.js', patchValidation],
    ['lib/server/onboarding/index.js', patchService],
    ['lib/server/gateway.js', patchGateway],
  ].map(([relative, transform]) => {
    const file = path.join(base, relative);
    const patched = transform(fs.readFileSync(file, 'utf8'));
    new Function('require', 'module', 'exports', patched);
    return [file, patched];
  });
  for (const [file, patched] of changes) fs.writeFileSync(file, patched);
  console.log('Applied explicit authenticated browser-chat onboarding profile');
}
module.exports = {patchValidation, patchService, patchGateway};

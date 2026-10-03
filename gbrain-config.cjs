// Keep memory MCP and versioned skills wired through the normal gateway config writer.
function configure(cfg, env = process.env) {
  if (env.GBRAIN_WEB_CHAT !== '1' || !env.GBRAIN_LOCAL_MCP_TOKEN) return false;
  const before = JSON.stringify(cfg);
  cfg.mcp ??= {}; cfg.mcp.servers ??= {};
  cfg.mcp.servers.gbrain = {
    url: 'http://127.0.0.1:3131/mcp', transport: 'streamable-http',
    headers: {Authorization: 'Bearer ${GBRAIN_LOCAL_MCP_TOKEN}'},
    supportsParallelToolCalls: false,
  };
  cfg.skills ??= {}; cfg.skills.load ??= {};
  cfg.skills.load.extraDirs = [...new Set([
    ...(cfg.skills.load.extraDirs || []), '/app/skills-seed', '/app/managed-skills',
  ])];
  if (cfg.mcp.servers.katailyst2) {
    cfg.mcp.servers.katailyst2.headers ??= {};
    cfg.mcp.servers.katailyst2.headers['X-Katailyst-MCP-Tool-Names'] = 'openai';
  }
  return before !== JSON.stringify(cfg);
}
module.exports = {configure};

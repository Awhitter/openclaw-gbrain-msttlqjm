const {test} = require('node:test');
const assert = require('node:assert/strict');
const {configure} = require('../gbrain-config.cjs');
test('memory wiring preserves K2 and existing skills, remains idempotent, and stores only a credential reference', () => {
  const cfg = {mcp:{servers:{katailyst2:{url:'https://fixture.invalid'}}},skills:{load:{extraDirs:['/custom']}}};
  const env = {GBRAIN_WEB_CHAT:'1',GBRAIN_LOCAL_MCP_TOKEN:'fixture-secret'};
  assert.equal(configure(cfg, {}), false);
  assert.equal(configure(cfg, env), true);
  assert.equal(configure(cfg, env), false);
  assert.equal(cfg.mcp.servers.katailyst2.url, 'https://fixture.invalid');
  assert.ok(cfg.skills.load.extraDirs.includes('/custom'));
  assert.ok(cfg.skills.load.extraDirs.includes('/app/skills-seed'));
  assert.ok(!JSON.stringify(cfg).includes('fixture-secret'));
  assert.equal(cfg.mcp.servers.gbrain.supportsParallelToolCalls, false);
});
test('strong model defaults preserve explicit user choices', () => {
 const cfg={agents:{defaults:{model:{primary:'openai/gpt-6-astra'}}}};
 const env={GBRAIN_WEB_CHAT:'1',GBRAIN_LOCAL_MCP_TOKEN:'fixture'};
 configure(cfg,env);
 assert.equal(cfg.agents.defaults.thinkingDefault,'high');
 assert.deepEqual(cfg.agents.defaults.model.fallbacks,['anthropic/claude-opus-5-5']);
 cfg.agents.defaults.thinkingDefault='medium'; cfg.agents.defaults.model.fallbacks=[];
 configure(cfg,env);assert.equal(cfg.agents.defaults.thinkingDefault,'medium');
 assert.deepEqual(cfg.agents.defaults.model.fallbacks,[]);
});

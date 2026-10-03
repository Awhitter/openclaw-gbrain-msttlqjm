const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {patchEnv, patchCommands} = require('../patch-alphaclaw.cjs');
test('browser deployment auth survives empty wrapper env values', () => {
 const env={GBRAIN_WEB_CHAT:'1',SETUP_PASSWORD:'fixture-password'};
 const module={exports:{}};
 const source=patchEnv(fs.readFileSync(require.resolve('@chrysb/alphaclaw/lib/server/env.js'),'utf8'));
 vm.runInNewContext(source,{module,process:{env},console:{log:()=>{}},require:name=>name==='fs'?{readFileSync:()=> 'SETUP_PASSWORD=\n'}:{ENV_FILE_PATH:'/fixture',kKnownVars:[{key:'SETUP_PASSWORD'}]}});
 module.exports.reloadEnv(); assert.equal(env.SETUP_PASSWORD,'fixture-password');
});
test('onboarding errors and command logging redact deployment credentials', async () => {
 const secret='fixture-gateway-token'; const output=[]; const module={exports:{}};
 const source=patchCommands(fs.readFileSync(require.resolve('@chrysb/alphaclaw/lib/server/commands.js'),'utf8'));
 vm.runInNewContext(source,{module,process:{env:{OPENCLAW_GATEWAY_TOKEN:secret}},console:{log:x=>output.push(x),error:x=>output.push(x)},require:name=>name==='child_process'?{exec:(cmd,opts,cb)=>cb(new Error('Command failed: '+cmd),'',secret)}:{}});
 const commands=module.exports.createCommands({gatewayEnv:()=>({})});
 await assert.rejects(commands.shellCmd('openclaw onboard --gateway-token '+secret), error=>!String(error.stack).includes(secret)&&!error.cmd.includes(secret)&&!error.stderr.includes(secret));
 assert.ok(!output.join('\n').includes(secret));
});

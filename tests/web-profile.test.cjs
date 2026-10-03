const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gbrain-web-profile-'));
process.env.ALPHACLAW_ROOT_DIR = root;
process.env.OPENCLAW_STATE_DIR = path.join(root, '.openclaw');
const {validateOnboardingInput} = require('@chrysb/alphaclaw/lib/server/onboarding/validation');
const {createOnboardingService} = require('@chrysb/alphaclaw/lib/server/onboarding');
const modelKey = 'openai/gpt-6-astra';
const base = {modelKey,resolveModelProvider:()=> 'openai',hasCodexOauthProfile:()=>false};
const vars = [{key:'OPENAI_API_KEY',value:'fixture-provider-key'},{key:'GBRAIN_WEB_CHAT',value:'1'}];

test('web profile is explicit; provider credentials remain required',()=>{
 delete process.env.GBRAIN_WEB_CHAT;
 assert.equal(validateOnboardingInput({...base,vars}).ok,false);
 process.env.GBRAIN_WEB_CHAT='1';
 assert.equal(validateOnboardingInput({...base,vars:vars.slice(0,1)}).ok,false);
 assert.equal(validateOnboardingInput({...base,vars:vars.slice(1)}).ok,false);
 assert.equal(validateOnboardingInput({...base,vars}).ok,true);
});

test('normal channel onboarding still requires GitHub and a channel',()=>{
 delete process.env.GBRAIN_WEB_CHAT;
 const gh=[vars[0],{key:'GITHUB_TOKEN',value:'fixture'},{key:'GITHUB_WORKSPACE_REPO',value:'fixture/workspace'}];
 assert.equal(validateOnboardingInput({...base,vars:gh}).ok,false);
 assert.equal(validateOnboardingInput({...base,vars:[...gh,{key:'SLACK_BOT_TOKEN',value:'fixture-bot'},{key:'SLACK_APP_TOKEN',value:'fixture-app'}]}).ok,true);
});

test('failed CLI onboarding cannot mark a browser workspace complete',async()=>{
 process.env.GBRAIN_WEB_CHAT='1';
 let booted=false;
 const constants={OPENCLAW_DIR:path.join(root,'.openclaw'),WORKSPACE_DIR:path.join(root,'.openclaw/workspace'),kOnboardingMarkerPath:path.join(root,'onboarded.json')};
 const service=createOnboardingService({fs,constants,
  shellCmd:async(command)=>{assert.ok(!command.includes('git init'));throw new Error('fixture CLI failure')},
  gatewayEnv:()=>({}),readEnvFile:()=>[],writeEnvFile:()=>{},reloadEnv:()=>{},
  resolveGithubRepoUrl:()=>{throw new Error('GitHub must not be used in browser mode')},
  resolveModelProvider:base.resolveModelProvider,hasCodexOauthProfile:()=>false,
  ensureGatewayProxyConfig:()=>{},getBaseUrl:()=> 'https://fixture.invalid',
  runOnboardedBootSequence:()=>{booted=true},
 });
 await assert.rejects(service.completeOnboarding({req:{},vars,modelKey}),/fixture CLI failure/);
 assert.equal(fs.existsSync(constants.kOnboardingMarkerPath),false);
 assert.equal(booted,false);
});

process.on('exit',()=>fs.rmSync(root,{recursive:true,force:true}));

test('browser profile completes real OpenClaw onboarding with valid managed config',async()=>{
 const {execSync}=require('node:child_process');
 process.env.GBRAIN_WEB_CHAT='1';
 const constants={OPENCLAW_DIR:path.join(root,'.openclaw'),WORKSPACE_DIR:path.join(root,'.openclaw/workspace'),kOnboardingMarkerPath:path.join(root,'onboarded.json')};
 const env={...process.env,PATH:path.resolve('node_modules/.bin')+':'+process.env.PATH,OPENCLAW_CONFIG_PATH:path.join(constants.OPENCLAW_DIR,'openclaw.json')};
 let booted=false;
 const commands=[];
 const service=createOnboardingService({fs,constants,
  shellCmd:async(command,options={})=>{commands.push(command);return execSync(command,{...options,env:{...env,...options.env},encoding:'utf8',stdio:'pipe'})},
  gatewayEnv:()=>env,readEnvFile:()=>[],writeEnvFile:()=>{},reloadEnv:()=>{},
  resolveGithubRepoUrl:()=>{throw new Error('unexpected GitHub dependency')},
  resolveModelProvider:base.resolveModelProvider,hasCodexOauthProfile:()=>false,
  ensureGatewayProxyConfig:()=>{},getBaseUrl:()=> 'https://fixture.invalid',runOnboardedBootSequence:()=>{booted=true},
 });
 const result=await service.completeOnboarding({req:{},vars,modelKey});
 assert.equal(result.body.ok,true);assert.equal(booted,true);
 assert.ok(fs.existsSync(constants.kOnboardingMarkerPath));
 assert.ok(!commands.some(command=>command.includes('git-sync')||command.includes('git init')));
 // Resolve fixture references without saving any real provider credential.
 env.OPENAI_API_KEY='fixture-provider-key';
 env.GBRAIN_LOCAL_MCP_TOKEN='fixture-memory-key';
 const managed=JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH,'utf8'));
 require('../gbrain-config.cjs').configure(managed,env);
 fs.writeFileSync(env.OPENCLAW_CONFIG_PATH,JSON.stringify(managed));
 execSync('openclaw config validate',{env,stdio:'pipe'});
 const cfg=JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH,'utf8'));
 assert.equal(cfg.gateway.auth.mode,'token');assert.equal(cfg.gateway.bind,'loopback');
 assert.equal(cfg.agents.defaults.model.primary,modelKey);
});

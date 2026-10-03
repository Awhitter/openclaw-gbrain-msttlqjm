const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {stopChild}=require('../shutdown-child.cjs');
test('shutdown waits for its real owned child to finish cleanup', async()=>{
 const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>setTimeout(()=>{process.stdout.write("lease released");process.exit(0)},100));process.stdout.write("ready");setInterval(()=>{},1000)'],{stdio:['ignore','pipe','pipe']});
 let output=''; child.stdout.on('data',b=>output+=b);
 await once(child.stdout,'data');
 assert.equal(await stopChild(child,2000),true);
 assert.equal(child.exitCode,0); assert.ok(output.includes('lease released'));
 assert.equal(await stopChild(child),true);
});

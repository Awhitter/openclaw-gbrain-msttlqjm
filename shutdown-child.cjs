// Signal only the child we own, and allow its persistent leases to be released.
async function stopChild(child, timeoutMs = 20000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise(resolve => {
    const timer = setTimeout(() => {child.off('exit', exited); resolve(false);}, timeoutMs);
    function exited() {clearTimeout(timer); resolve(true);}
    child.once('exit', exited);
    child.kill('SIGTERM');
  });
}
module.exports = {stopChild};

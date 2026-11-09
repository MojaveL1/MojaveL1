// one mining thread: Argon2id in WebAssembly, the same hash the node checks
importScripts('/vendor-hw/argon2.umd.min.js');
let job = null, run = false;
const meets = (hex, diff) => BigInt('0x' + hex) * BigInt(diff) < 2n ** 256n;
onmessage = (e) => { if (e.data.job) job = e.data.job; if ('run' in e.data) { const was = run; run = e.data.run; if (run && !was) loop(); } };
async function loop() {
  let n = 0, t = Date.now();
  while (run) {
    if (!job) { await new Promise((r) => setTimeout(r, 500)); continue; }
    const j = job, nonce = Math.floor(Math.random() * 2 ** 47), a = j.argon;
    const h = await hashwasm.argon2id({ password: j.hdr + '|' + nonce, salt: a.salt, parallelism: a.parallelism, iterations: a.iterations, memorySize: a.memoryKiB, hashLength: a.hashLength, outputType: 'hex' });
    n++; if (Date.now() - t > 1000) { postMessage({ hashes: n }); n = 0; t = Date.now(); }
    if (j === job && meets(h, j.diff)) { postMessage({ found: { id: j.id, nonce } }); job = null; }
  }
}

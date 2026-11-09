// Mojavechain CPU miner. Mines Argon2id blocks on any node and pays the reward to your own address.
//   node miner/miner.js <mjc1… or mjcq1… address> [--node https://mojavechain.org] [--threads N]
import crypto from 'node:crypto'; import os from 'node:os';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ADDR = args.find((a) => /^kybq?1/.test(a)), NODE = opt('--node', 'https://mojavechain.org').replace(/\/$/, ''), THREADS = +opt('--threads', Math.max(1, os.availableParallelism() - 1));
if (!ADDR) { console.log('usage: node miner/miner.js <your mjc1/mjcq1 address> [--node URL] [--threads N]'); process.exit(1); }

const get = (p) => fetch(NODE + p).then((r) => r.json()), post = (p, d) => fetch(NODE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }).then((r) => r.json());
const hash = (job, nonce) => new Promise((ok, no) => crypto.argon2('argon2id', { message: Buffer.from(job.hdr + '|' + nonce), nonce: Buffer.from(job.argon.salt), parallelism: job.argon.parallelism, tagLength: job.argon.hashLength, memory: job.argon.memoryKiB, passes: job.argon.iterations }, (e, h) => e ? no(e) : ok(h)));
const meets = (h, diff) => BigInt('0x' + h.toString('hex')) * BigInt(diff) < 2n ** 256n;

let job = null, hashes = 0, found = 0, t0 = Date.now();
async function refresh() { try { const j = await get('/api/work?address=' + encodeURIComponent(ADDR)); if (j.error) throw new Error(j.error); if (!job || j.id !== job.id) job = j; } catch (e) { console.log('work:', e.message); } }
async function thread() {
  for (;;) {
    if (!job) { await new Promise((r) => setTimeout(r, 1000)); continue; }
    const j = job, nonce = crypto.randomInt(2 ** 47), h = await hash(j, nonce); hashes++;
    if (j === job && meets(h, j.diff)) { const r = await post('/api/work', { id: j.id, nonce }); if (r.ok) { found++; console.log(`★ block ${r.height} found · reward ${(Number(j.reward) / 1e6).toFixed(4)} tMOJAVE → your wallet`); } else console.log('submit:', r.error); job = null; await refresh(); }
  }
}
console.log(`Mojave miner · ${NODE} · ${THREADS} threads · paying ${ADDR.slice(0, 18)}…`);
await refresh(); setInterval(refresh, 5000);
setInterval(() => { const s = (Date.now() - t0) / 1000; console.log(`${(hashes / s).toFixed(1)} H/s · height ${job ? job.height : '?'} · diff ${job ? job.diff : '?'} · blocks found ${found}`); }, 15000);
for (let i = 0; i < THREADS; i++) thread();

// Boots nodes on temp chains and checks the http surface, the save path and the boot chain check.
import { spawn } from 'node:child_process'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mojave-test-')), DATA = path.join(dir, 'chain.json');
const PORT = String(19000 + Math.floor(Math.random() * 800)), API = 'http://localhost:' + PORT;
const chainFile = (p) => p.replace(/.json$/, '') + '-r2.json';   // the node keeps its own -r2 file next to DATA_PATH
const run = (env) => { const p = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = ''; p.err = ''; p.stdout.on('data', (c) => (p.out += c)); p.stderr.on('data', (c) => (p.err += c)); return p; };
const waitExit = (p, ms = 20000) => Promise.race([new Promise((r) => (p.exitCode !== null ? r(p.exitCode) : p.on('exit', (c) => r(c)))), new Promise((r) => setTimeout(() => r('timeout'), ms))]);
const req = async (p, opt = {}) => { const r = await fetch(API + p, opt); const t = await r.text(); let b = null;
  try { b = JSON.parse(t); } catch {} return { code: r.status, type: r.headers.get('content-type') || '', body: b, raw: t }; };
const post = (p, b) => req(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
const up = async (base) => { for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/api/stats')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 250)); } throw new Error('node did not start'); };

const NODE = run({ PORT, DATA_PATH: DATA, BLOCK_SEC: '30' });
try {
  await up(API);
  const s = await req('/api/stats');
  ok(s.code === 200 && s.body.network === 'testnet' && s.body.ring === 16, 'stats: testnet, ring of 16');
  ok(typeof s.body.height === 'number' && typeof s.body.faucet === 'string' && /Argon2id/.test(s.body.pow), 'stats: height, faucet and pow rule');
  const health = await req('/api/health');
  ok(health.code === 200 && health.body.ready === true && typeof health.body.uptime === 'number', 'health: 200 and ready on a fresh chain');

  // a broken body is a client error, not a silently empty request
  const bad = await post('/api/spent', '{"kis":');
  ok(bad.code === 400 && /json/.test(bad.body.error), 'truncated json is a 400: ' + bad.code);
  const arr = await post('/api/tx', '[]');
  ok(arr.code === 400 && /object/.test(arr.body.error), 'a json array is not a request body: ' + arr.code);
  const nul = await post('/api/faucet', 'null');
  ok(nul.code === 400 && /object/.test(nul.body.error), 'null body rejected: ' + nul.code);
  const empty = await post('/api/spent', '');
  ok(empty.code === 200, 'an empty body still means an empty request');

  const big = await post('/api/tx', 'x'.repeat((1 << 20) + 128));
  ok(big.code === 413, 'a body over 1 MiB is refused before parsing: ' + big.code);
  const fits = await post('/api/spent', { kis: Array.from({ length: 5000 }, () => 'ab'.repeat(32)) });
  ok(fits.code === 200 && fits.body.spent.length === 5000, '5000 key images are under the limit and answered');

  // decoys on a chain that is too young to fill a ring: shaped like the rest of the api, not a 500
  const d = await req('/api/decoys?n=15');
  ok(d.code === 200 && (Array.isArray(d.body.decoys) || typeof d.body.error === 'string') && typeof d.body.height === 'number', 'decoys: 200 with decoys or a reason');
  const o = await req('/api/outputs?from=0&limit=5');
  ok(o.code === 200 && Array.isArray(o.body.outs) && typeof o.body.total === 'number', 'outputs: paged list with a total');

  const miss = await req('/api/block/999999');
  ok(miss.code === 404 && /no such block/.test(miss.body.error), 'unknown block is a json 404');
  const raw = await req('/api/rawtx/' + 'a'.repeat(64));
  ok(raw.code === 404 && /no such transaction/.test(raw.body.error), 'unknown tx is a json 404');
  const page = await req('/nope');
  ok(page.code === 404 && /text\/html/.test(page.type), 'unknown page is the html 404');
  const q = await req('/api/search?q=zzz');
  ok(q.code === 404 && /nothing found/.test(q.body.error), 'search with no match says so');
} catch (e) { fail++; console.log('FAIL', e.message); }
NODE.kill(); await waitExit(NODE);

// persistence: a chain with a few blocks, then a shutdown, a corrupted link and a file that is not json
try {
  const P2 = String(+PORT + 1), D2 = path.join(dir, 'keep.json'), F2 = chainFile(D2), B2 = 'http://localhost:' + P2;
  const keeper = run({ PORT: P2, DATA_PATH: D2, BLOCK_SEC: '2' });
  let seen = 0;
  for (let i = 0; i < 160; i++) { try { seen = (await (await fetch(B2 + '/api/stats')).json()).height; if (seen >= 2) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  ok(seen >= 2, 'the miner produced blocks: height ' + seen);
  await new Promise((r) => setTimeout(r, 2500));                       // leave the debounced save its window
  if (process.platform === 'win32') { keeper.kill(); await waitExit(keeper); console.log('SKIP sigterm is a unix signal; this path is covered on linux'); }
  else { keeper.kill('SIGTERM'); ok((await waitExit(keeper)) === 0, 'sigterm leaves with exit 0'); ok(/state saved/.test(keeper.out), 'sigterm writes the state first'); }

  const saved = JSON.parse(fs.readFileSync(F2, 'utf8'));
  ok(saved.blocks.length > 1 && saved.blocks.at(-1).height === saved.blocks.length - 1, 'the file holds a whole chain: ' + saved.blocks.length + ' blocks');
  ok(saved.blocks.length - 1 >= seen, 'no block was lost between the api and the file');

  // readiness: enough outputs that the rescan is still running when the first request lands
  const D3 = path.join(dir, 'slow.json'), F3 = chainFile(D3), slow = JSON.parse(fs.readFileSync(F2, 'utf8')), some = slow.outs.slice(0, 12);
  slow.outs = Array.from({ length: 120 }, (_, i) => ({ ...some[i % some.length] }));
  fs.writeFileSync(F3, JSON.stringify(slow));
  const warm = run({ PORT: P2, DATA_PATH: D3, BLOCK_SEC: '2' });
  let first = null;
  for (let i = 0; i < 300 && !first; i++) { try { first = await fetch(B2 + '/api/health'); } catch { await new Promise((r) => setTimeout(r, 25)); } }
  ok(first && first.status === 503, 'health: 503 while the wallet view is still being rebuilt: ' + (first && first.status));
  const hb = first ? await first.json() : {};
  ok(hb.ready === false && hb.outputs === 120, 'it says ready false and how many outputs are on disk');
  const hold = await fetch(B2 + '/api/faucet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: 'mjc1nope' }) });
  ok(hold.status === 503 && hold.headers.get('retry-after') === '2', 'a write during the rebuild is a 503 with retry after');
  let later = null;
  for (let i = 0; i < 600 && !later; i++) { const r = await fetch(B2 + '/api/health'); if (r.status === 200) later = await r.json(); else await new Promise((r2) => setTimeout(r2, 100)); }
  ok(later && later.ready === true && later.ok === true, 'health: 200 and ready once the rescan finishes');
  warm.kill(); await waitExit(warm);

  saved.blocks[1].prev = 'f'.repeat(64); fs.writeFileSync(F2, JSON.stringify(saved));
  const broken = run({ PORT: P2, DATA_PATH: D2, BLOCK_SEC: '2' });
  ok((await waitExit(broken)) === 1, 'a broken prev link stops the node with exit 1');
  ok(/chain check failed: block 1 does not follow/.test(broken.err), 'it names the block: ' + broken.err.trim().split('\n')[0].slice(0, 70));

  fs.writeFileSync(F2, '{"blocks": [');
  const junk = run({ PORT: P2, DATA_PATH: D2, BLOCK_SEC: '2' });
  ok((await waitExit(junk)) === 1, 'a file that is not json stops the node with exit 1');
  ok(/cannot read/.test(junk.err), 'it says the file cannot be read');
} catch (e) { fail++; console.log('FAIL', e.message); }
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

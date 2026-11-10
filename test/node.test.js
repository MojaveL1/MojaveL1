// Boots a node on a temp chain and checks the http surface: body limits, 404s, decoy shape.
import { spawn } from 'node:child_process'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const PORT = String(19000 + Math.floor(Math.random() * 1000));
const DATA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mojave-http-')), 'chain.json');
const NODE = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, DATA_PATH: DATA, BLOCK_SEC: '30' }, stdio: ['ignore', 'ignore', 'inherit'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const API = 'http://localhost:' + PORT;
const req = async (p, opt = {}) => { const r = await fetch(API + p, opt); const t = await r.text(); let b = null;
  try { b = JSON.parse(t); } catch {} return { code: r.status, type: r.headers.get('content-type') || '', body: b, raw: t }; };
const post = (p, b) => req(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
const up = async () => { for (let i = 0; i < 80; i++) { try { if ((await req('/api/stats')).code === 200) return; } catch {} await new Promise((r) => setTimeout(r, 250)); } throw new Error('node did not start'); };

try {
  await up();
  const s = await req('/api/stats');
  ok(s.code === 200 && s.body.network === 'testnet' && s.body.ring === 16, 'stats: testnet, ring of 16');
  ok(typeof s.body.height === 'number' && typeof s.body.faucet === 'string' && /Argon2id/.test(s.body.pow), 'stats: height, faucet and pow rule');

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
NODE.kill(); await new Promise((r) => (NODE.exitCode !== null ? r() : NODE.on('exit', r)));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

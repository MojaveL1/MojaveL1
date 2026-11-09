// End-to-end against a running node, doing exactly what the browser wallet does. `npm run test:e2e` boots its own node.
//   API=http://localhost:8267 node test/e2e.test.js   (against a node you started yourself)
import * as K from '../client/rct.js';
const B = process.env.API || 'http://localhost:8267';
const get = (p) => fetch(B + p).then((r) => r.json()), post = (p, d) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }).then((r) => r.json());
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sync(w) { const { outs } = await get('/api/outputs?from=0&limit=4000'); const mine = [];
  for (const o of outs) { const r = K.scan(w, o, o.R, o.i); if (r) mine.push({ ...r, gidx: o.g, P: o.P, C: o.C, h: o.h, ki: K.keyImage(r.x, o.P) }); }
  const { spent } = await post('/api/spent', { kis: mine.map((m) => m.ki) }); return mine.map((m, i) => ({ ...m, spent: spent[i] })); }
async function waitFor(fn, ms = 120000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(1500); } return false; }

const s = await get('/api/stats'); ok(s.height >= 3 && s.ring === 16, `node live at height ${s.height}, ${s.pow}`);
const alice = K.wallet(), bob = K.wallet();
ok((await post('/api/faucet', { address: 'mjc1nope' })).error, 'faucet rejects a bad address');
const f = await post('/api/faucet', { address: alice.address }); ok(f.ok, 'faucet sends a private tx to alice: ' + (f.error || f.id.slice(0, 12)));
ok((await post('/api/faucet', { address: alice.address })).error, 'faucet limited to one drip per hour');
const pend = await get('/api/tx/' + f.id); ok(pend.vin[0].ring.length === 16 && pend.vout.every((o) => o.amount === null), 'pending tx: ring of 16, amounts hidden');
ok(await waitFor(async () => (await get('/api/tx/' + f.id)).confirmations >= 1), 'faucet tx mined into a block');
let mine = await sync(alice); ok(mine.length === 1 && mine[0].v === 25_000_000n, 'alice wallet scans 25 MOJAVE');
ok(await waitFor(async () => (await get('/api/stats')).height - mine[0].h >= 3), 'output matures (3 blocks)');
const u = mine[0], { decoys } = await get('/api/decoys?avoid=' + u.gidx);
ok(decoys.length === 15 && !decoys.some((d) => d.gidx === u.gidx), '15 decoys picked from the chain');
const tx = K.buildTx([{ ...u, decoys }], [{ address: bob.qaddress, v: 10_000_000n }, { address: alice.address, v: 14_990_000n }], 10_000n);
const sent = await post('/api/tx', { tx }); ok(sent.ok, 'alice → bob (quantum address) accepted: ' + (sent.error || ''));
ok((await post('/api/tx', { tx })).error, 'same tx again is rejected as a double spend');
const forged = JSON.parse(JSON.stringify(tx)); forged.vout[0].C = forged.vout[1].C; ok((await post('/api/tx', { tx: forged })).error, 'forged commitment rejected');
ok(await waitFor(async () => (await get('/api/tx/' + sent.id)).confirmations >= 1), 'transfer mined');
const bobs = await sync(bob); ok(bobs.length === 1 && bobs[0].v === 10_000_000n, 'bob finds 10 MOJAVE through ML-KEM-768');
mine = await sync(alice); ok(mine.find((m) => m.gidx === u.gidx).spent === 'chain' && mine.some((m) => m.v === 14_990_000n), 'alice sees the spend + her change');
const d = await get('/api/tx/' + sent.id); ok(d.vout[0].quantum && d.vout[0].ctBytes === 1088 && d.vout[0].amount === null, 'explorer: quantum output, 1088-byte ciphertext, no amount');
ok((await get('/api/search?q=' + tx.vin[0].ki)).id === sent.id, 'search by key image finds the tx');
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}/${pass + fail})`); process.exit(fail ? 1 : 0);

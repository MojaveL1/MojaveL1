// Unit test for client/rct.js: stealth scan (classic + ML-KEM), range proofs, MLSAG, full tx balance + tamper cases.
import * as K from '../client/rct.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const t0 = Date.now();
const alice = K.wallet(), bob = K.wallet(), eve = K.wallet();
ok(alice.address.startsWith('mjc1') && alice.qaddress.startsWith('mjcq1'), `addresses ${alice.address.length} / ${alice.qaddress.length} chars`);
ok(K.wallet(alice.seed).address === alice.address, 'seed restores the same wallet');
let bad = false; try { K.parseAddress(alice.address.slice(0, -1) + (alice.address.endsWith('a') ? 'b' : 'a')); } catch { bad = true; } ok(bad, 'checksum rejects a typo');

// funding outputs (clear, like coinbase) to alice, plus 40 decoys to others
const outs = []; const r0 = K.rand(), R0 = K.ph(K.G.multiply(r0));
for (let i = 0; i < 40; i++) { const m = K.makeOutput(i === 7 ? alice.address : K.wallet().address, i === 7 ? 50_000_000 : 1_000_000, i, r0, true); outs.push({ ...m.o, clear: true, R: R0, i }); }
const mine = outs.map((o) => K.scan(alice, o, o.R, o.i)).map((s, g) => s && { ...s, gidx: g }).filter(Boolean);
ok(mine.length === 1 && mine[0].v === 50_000_000n, 'alice scans exactly her output (50 MOJAVE)');
ok(outs.every((o) => !K.scan(eve, o, o.R, o.i)), 'eve sees nothing');

const getOut = (g) => outs[g] && { P: outs[g].P, C: outs[g].C }; const spent = new Set();
const decoys = (avoid) => { const s = new Set([avoid]); const d = []; while (d.length < 15) { const g = Math.floor(Math.random() * outs.length); if (s.has(g)) continue; s.add(g); d.push({ gidx: g, ...getOut(g) }); } return d; };
const m = mine[0], inp = { ...m, P: outs[m.gidx].P, C: outs[m.gidx].C, decoys: decoys(m.gidx) };
const t1 = Date.now();
const tx = K.buildTx([inp], [{ address: bob.qaddress, v: 30_000_000n }, { address: alice.address, v: 19_990_000n }], 10_000n);
console.log('  build ms', Date.now() - t1, 'size KB', (JSON.stringify(tx).length / 1024).toFixed(1));
const t2 = Date.now(); const err = K.verifyTx(tx, getOut, (k) => spent.has(k)); console.log('  verify ms', Date.now() - t2);
ok(err === null, 'private tx verifies: ' + err);
ok(tx.vin[0].ring.length === 16 && tx.vin[0].ring.includes(m.gidx), 'ring of 16 hides the real input');
ok(tx.vout[0].ct && tx.vout[0].ct.length === 2176, 'quantum output carries an ML-KEM-768 ciphertext');
const bobScan = K.scan(bob, { ...tx.vout[0] }, tx.R, 0); ok(bobScan && bobScan.v === 30_000_000n, 'bob decrypts 30 MOJAVE via ML-KEM');
const change = K.scan(alice, { ...tx.vout[1] }, tx.R, 1); ok(change && change.v === 19_990_000n, 'alice finds her change via ECDH');
ok(!K.scan(eve, { ...tx.vout[0] }, tx.R, 0) && !K.scan(eve, { ...tx.vout[1] }, tx.R, 1), 'eve cannot read either output');
ok(K.keyImage(m.x, outs[m.gidx].P) === tx.vin[0].ki, 'key image matches the spent output');
spent.add(tx.vin[0].ki); ok(K.verifyTx(tx, getOut, (k) => spent.has(k)) === 'key image already spent', 'double spend rejected');
spent.clear();
const t3 = JSON.parse(JSON.stringify(tx)); t3.fee = '0'; ok(K.verifyTx(t3, getOut, () => false) !== null, 'changing the fee breaks it');
const t4 = JSON.parse(JSON.stringify(tx)); t4.vout[0].C = tx.vout[1].C; ok(K.verifyTx(t4, getOut, () => false) !== null, 'swapping a commitment breaks it');
let threw = false; try { K.buildTx([inp], [{ address: bob.address, v: 60_000_000n }], 0n); } catch { threw = true; } ok(threw, 'cannot spend more than you have');
const t5 = JSON.parse(JSON.stringify(tx)); t5.vin[0].ring[3] = (t5.vin[0].ring[3] + 1) % 40; ok(K.verifyTx(t5, getOut, () => false) !== null, 'swapping a ring member breaks it');

// ring policy: every member, not just the one that gets spent
const ring16 = Array.from({ length: 16 }, (_, i) => i);
ok(K.vetRing(ring16, () => 100, 103) === null, 'mature ring passes');
ok(/not mature/.test(K.vetRing(ring16, () => 100, 102)), 'one immature member refuses the ring');
ok(/not mature/.test(K.vetRing(ring16, (g) => (g === 9 ? 102 : 100), 103)), 'a member mined seconds ago is refused');
ok(/not found/.test(K.vetRing(ring16, (g) => (g === 4 ? null : 100), 103)), 'a member that is not on the chain is refused');
ok(/distinct/.test(K.vetRing([...ring16.slice(0, 15), 0], () => 100, 103)), 'a repeated member is refused');
ok(/16 outputs/.test(K.vetRing(ring16.slice(0, 15), () => 100, 103)), '15 members is not a ring');

// decoys: flat selection would give the recent window 15%, weighting should bring it near half
const ages = Array.from({ length: 400 }, (_, d) => d + 3);   // 400 candidates, 3 to 402 blocks deep
let picks = 0, recent = 0, dupes = 0;
for (let r = 0; r < 200; r++) { const idx = K.pickDecoys(ages, 15); if (new Set(idx).size !== 15) dupes++;
  for (const j of idx) { picks++; if (ages[j] <= 61) recent++; } }
const share = recent / picks;
ok(dupes === 0 && picks === 3000, `every ring gets 15 distinct decoys (${picks} picks)`);
ok(share > 0.35 && share < 0.75, `the recent 15% of the chain takes ${(share * 100).toFixed(0)}% of decoys`);
const seedRnd = (s) => () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
ok(JSON.stringify(K.pickDecoys(ages, 15, seedRnd(7))) === JSON.stringify(K.pickDecoys(ages, 15, seedRnd(7))), 'a seeded sampler repeats');

// relay: the same fee on a bigger tx is worth less
const small = { fee: '100000', vin: [], vout: [] }, large = { fee: '100000', vin: [{ sig: { r: 'f'.repeat(4000) } }], vout: [] };
ok(K.feeRate(small) > K.feeRate(large) * 10, `the smaller tx ranks first (${K.feeRate(small).toFixed(0)} vs ${K.feeRate(large).toFixed(0)})`);
const queue = [large, small, { fee: '500000', vin: [], vout: [] }].sort((a, b) => K.feeRate(b) - K.feeRate(a));
ok(queue[0].fee === '500000' && queue[2] === large, 'the cheapest tx sorts last');
ok(K.feeRate(small) === K.feeRate(small) && JSON.stringify(small) === '{"fee":"100000","vin":[],"vout":[]}', 'the cached rate never reaches the serialised tx');

// mutations: change one field and the tx must stop verifying
const clone = () => JSON.parse(JSON.stringify(tx)), refuse = (m, name) => ok(K.verifyTx(m, getOut, () => false) !== null, name + ' is refused');
let x;
x = clone(); x.vin[0].ring = [...x.vin[0].ring.slice(1), x.vin[0].ring[0]]; refuse(x, 'a ring rotated one slot');
x = clone(); x.vin[0].pseudo = x.vout[0].C; refuse(x, 'a pseudo input borrowed from an output');
x = clone(); x.vin[0].sig.c0 = (x.vin[0].sig.c0[0] === '0' ? '1' : '0') + x.vin[0].sig.c0.slice(1); refuse(x, 'one flipped signature scalar');
x = clone(); x.vin[0].ki = x.vout[1].C; refuse(x, 'a key image that does not match the signature');
x = clone(); x.vout[0].rp = x.vout[1].rp; refuse(x, 'another output range proof');
x = clone(); x.vout[0].rp[3].C = K.ph(K.G); refuse(x, 'a rewritten bit commitment');
x = clone(); x.vout[0].rp.pop(); refuse(x, 'a 47-bit range proof');
x = clone(); x.fee = '-10000'; refuse(x, 'a negative fee');
x = clone(); x.R = K.ph(K.G); refuse(x, 'a swapped tx secret');
x = clone(); x.vout = [x.vout[0], x.vout[1], x.vout[0], x.vout[1], x.vout[0], x.vout[1], x.vout[0], x.vout[1], x.vout[1]]; refuse(x, 'a ninth output');
x = clone(); x.vin = []; refuse(x, 'an empty vin');
ok(K.verifyTx(tx, getOut, () => false) === null, 'the untouched tx still verifies after all of that');

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}/${pass + fail}) in ${Date.now() - t0} ms`); process.exit(fail ? 1 : 0);

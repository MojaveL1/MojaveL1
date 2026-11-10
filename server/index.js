// Mojavechain node: a private proof-of-work testnet.
//   Argon2id proof of work, blocks every ~30s, private transactions only:
//   16-member MLSAG ring signatures + key images, stealth one-time outputs, Pedersen-committed amounts with
//   range proofs, and ML-KEM-768 payment detection for quantum ("mjcq1") addresses.
// One process serves the chain API, the explorer, the browser wallet and the site.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import * as K from '../client/rct.js'; import { Worker } from 'node:worker_threads';

if (typeof crypto.argon2 !== "function") { console.error(`Mojavechain needs Node 24+ (Argon2id). This is Node ${process.version}. Set NODE_VERSION=24 on the host.`); process.exit(1); }
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), CLIENT = path.join(ROOT, 'client');
const PORT = +process.env.PORT || 8266, DATA = (process.env.DATA_PATH || path.join(ROOT, 'data.json')).replace(/.json$/, '') + '-r2.json';   // r2: testnet reset 2026-11-02
const BLOCK_SEC = +process.env.BLOCK_SEC || 30, ARGON_KIB = +process.env.ARGON_KIB || 8192, MIN_FEE = 10_000n;
const MOJAVE_MINT = process.env.MOJAVE_MINT || '', NODE_PAUSE = +process.env.NODE_PAUSE || 0;   // ms the node's own miner rests between hashes, leaving room for public miners                         // $MOJAVE on Solana, shown on the site once set
const FAUCET = 25n * K.UNIT, MATURITY = K.MATURITY, SUPPLY = 100_000_000n * K.UNIT, TAIL = 2n * K.UNIT, MEMPOOL_MAX = 200;
const now = () => Date.now(), big = (x) => BigInt(x), fmt = (v) => (Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 });

// ---------- state ----------
let S = { blocks: [], outs: [], kis: {}, txs: {}, emitted: '0', seeds: null, faucet: {} };
try { S = { ...S, ...JSON.parse(fs.readFileSync(DATA, 'utf8')) }; }
catch (e) { if (e.code !== 'ENOENT') { console.error('cannot read ' + DATA + ' (' + e.message + '). Move it aside to start a fresh chain.'); process.exit(1); } }
if (!S.seeds) S.seeds = Array.from({ length: 7 }, () => K.wallet().seed);
const W = S.seeds.map((s) => K.wallet(s)), MINER = W[0], BOTS = W.slice(1);
const NAMES = ['miner', 'nyx', 'umbra', 'vesper', 'halcyon', 'ghostline', 'cipher'];
let mempool = [], saveT = 0, ready = false; const started = now();
const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = 0; flush(); }, 1500); };
// write a temp file, fsync it, then rename: a kill or a power cut leaves the last good chain, never half of a new one
function flush() { if (saveT) { clearTimeout(saveT); saveT = 0; }
  try { fs.mkdirSync(path.dirname(DATA), { recursive: true }); const tmp = DATA + '.tmp', fd = fs.openSync(tmp, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(S)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, DATA); return true; }
  catch (e) { console.error('save failed (' + DATA + '): ' + e.message); return false; } }
// heavy proof work runs on a worker thread so a ring signature never stalls the API
const worker = new Worker(new URL('./worker.js', import.meta.url)), jobs = new Map(); let jobId = 0;
worker.on('message', ({ id, ok, err }) => { const j = jobs.get(id); jobs.delete(id); err ? j[1](err) : j[0](ok); });
const work = (op, ...args) => new Promise((ok, no) => { const id = ++jobId; jobs.set(id, [ok, no]); worker.postMessage({ id, op, args }); });
const reserved = new Set();
const tip = () => S.blocks[S.blocks.length - 1], height = () => S.blocks.length - 1;
const getOut = (g) => S.outs[g] && { P: S.outs[g].P, C: S.outs[g].C };
const spent = (ki) => !!S.kis[ki] || mempool.some((t) => t.vin.some((v) => v.ki === ki));

// ---------- server-held wallets (miner + bots) scan the chain like any wallet ----------
const owned = W.map(() => []);                                        // [{g,v,mask,x,ki}]
function scanOut(g) { const o = S.outs[g]; W.forEach((w, k) => { const r = K.scan(w, o, o.R, o.i); if (r) owned[k].push({ g, v: r.v, mask: r.mask, x: r.x, ki: K.keyImage(r.x, o.P) }); }); }
function balance(k) { return owned[k].filter((u) => !S.kis[u.ki]).reduce((a, u) => a + u.v, 0n); }
// mature outputs only, recent ones weighted up (pickDecoys). rings padded with minutes-old outputs
// say as much about who is spending as a bad ring member does
function decoys(avoid, n = 15) { const tipH = height(), s = new Set(avoid), pool = [];
  for (let g = 0; g < S.outs.length; g++) if (tipH - S.outs[g].h >= MATURITY && !s.has(g)) pool.push(g);
  if (pool.length < n) throw 'not enough mature outputs for a ring yet';
  return K.pickDecoys(pool.map((g) => tipH - S.outs[g].h), n).map((i) => ({ gidx: pool[i], ...getOut(pool[i]) })); }
async function walletSend(k, address, v) {
  const fee = MIN_FEE, need = big(v) + fee, inflight = new Set(mempool.flatMap((t) => t.vin.map((x) => x.ki)));
  const utxo = owned[k].filter((u) => !S.kis[u.ki] && !inflight.has(u.ki) && !reserved.has(u.ki) && height() - S.outs[u.g].h >= MATURITY).sort((a, b) => (a.v > b.v ? -1 : 1));
  const pick = []; let sum = 0n; for (const u of utxo) { if (sum >= need) break; pick.push(u); sum += u.v; } if (sum < need) throw 'faucet is refilling, try again in a minute';
  const ins = pick.map((u) => ({ v: u.v, mask: u.mask, x: u.x, gidx: u.g, ...getOut(u.g), decoys: decoys([u.g]) }));
  const outs = [{ address, v: big(v) }]; if (sum - need > 0n) outs.push({ address: W[k].address, v: sum - need });
  pick.forEach((u) => reserved.add(u.ki));
  try { return await work('build', ins, outs, fee); } finally { pick.forEach((u) => reserved.delete(u.ki)); }
}

// ---------- blocks ----------
function reward() { const left = SUPPLY - big(S.emitted); const r = left >> 19n; return r > TAIL ? r : TAIL; }
function header(b) { return JSON.stringify({ h: b.height, prev: b.prev, ts: b.ts, diff: b.diff, root: b.root, miner: b.minerTx }); }
function nextDiff() { const n = S.blocks.length; if (n < 3) return 6; const t = tip(), back = S.blocks[Math.max(0, n - 6)], span = (t.ts - back.ts) / 1000 / Math.max(1, n - 1 - back.height);
  return Math.max(2, Math.round(t.diff * Math.min(1.25, Math.max(0.8, BLOCK_SEC / Math.max(1, span))))); }
const powHash = (hdr, nonce) => new Promise((ok, no) => crypto.argon2('argon2id', { message: Buffer.from(hdr + '|' + nonce), nonce: Buffer.from('mojave-chain-pow!'), parallelism: 1, tagLength: 32, memory: ARGON_KIB, passes: 1 }, (e, h) => e ? no(e) : ok(h)));
const meets = (h, diff) => BigInt('0x' + h.toString('hex')) * BigInt(diff) < 2n ** 256n;
// the last 100 blocks have to agree with each other and with their own header before the node mines on top of them
function checkChain() { const n = S.blocks.length, from = Math.max(0, n - 100);
  for (let i = from; i < n; i++) { const b = S.blocks[i], at = 'block ' + i + ' ';
    if (b.height !== i) return at + 'says height ' + b.height;
    if (i && b.prev !== S.blocks[i - 1].hash) return at + 'does not follow the one before it';
    if (K.txhash(header(b) + '|' + b.nonce) !== b.hash) return at + 'does not hash to its own header';
    if (b.txs?.[0] !== b.minerTx || K.txhash(b.txs) !== b.root) return at + 'has a broken transaction root';
    try { if (typeof b.pow !== 'string' || b.pow.length !== 64 || !meets(Buffer.from(b.pow, 'hex'), b.diff)) return at + 'does not meet difficulty ' + b.diff; }
    catch { return at + 'has an unreadable proof of work'; } }
  return null; }
function addOutputs(txid, tx, h, clear) { tx.vout.forEach((o, i) => { const g = S.outs.length; S.outs.push({ P: o.P, C: o.C, amt: o.amt, ...(o.ct ? { ct: o.ct } : {}), ...(clear ? { clear: true } : {}), R: tx.R, i, h, txid }); scanOut(g); }); }
// a block template paying the coinbase to `addr` (any mjc1/mjcq1 address); public miners and the node's own miner both use it
function template(addr) {
  const txs = mempool.slice(0, 20), fees = txs.reduce((a, t) => a + big(t.fee), 0n), h = S.blocks.length, r = K.rand();
  // genesis pays 64 small outputs across the wallets so the first rings of 16 have members to hide among
  const pay = h === 0 ? Array.from({ length: 64 }, (_, i) => [W[i % W.length].address, reward() / 64n]) : [[addr, reward() + fees]];
  const cb = { v: 1, coinbase: true, height: h, R: K.ph(K.G.multiply(r)), vout: pay.map(([a, v], i) => K.makeOutput(a, v, i, r, true).o) };
  const ids = [K.txhash(cb), ...txs.map((t) => K.txhash(t))];
  const b = { height: h, prev: h ? tip().hash : '0'.repeat(64), ts: now(), diff: nextDiff(), root: K.txhash(ids), minerTx: ids[0] };
  return { b, cb, txs, ids, fees, hdr: header(b) };
}
function accept(T, nonce, pow, by) {
  const { b, cb, txs, ids, fees, hdr } = T, h = b.height;
  b.nonce = nonce; b.pow = pow.toString('hex'); b.hash = K.txhash(hdr + '|' + nonce); b.txs = ids; b.size = JSON.stringify(txs).length + 400; b.reward = String(reward()); b.fees = String(fees); b.by = by;
  const live = txs.filter((t) => t.vin.every((v) => !S.kis[v.ki]));
  S.txs[ids[0]] = { ...cb, h, ts: b.ts }; addOutputs(ids[0], cb, h, true);
  for (const t of live) { const id = K.txhash(t); S.txs[id] = { ...t, h, ts: b.ts }; t.vin.forEach((v) => (S.kis[v.ki] = id)); addOutputs(id, t, h, false); }
  S.emitted = String(big(S.emitted) + reward()); S.blocks.push(b); mempool = mempool.filter((t) => !txs.includes(t)); prune(); save();
  console.log(`block ${h} diff ${b.diff} by ${by} txs ${live.length}`);
}
async function mine() {
  for (;;) {
    const T = template(MINER.address), h = T.b.height; let nonce = Math.floor(Math.random() * 1e9), pow;
    for (;;) { pow = await powHash(T.hdr, nonce); if (meets(pow, T.b.diff)) break; nonce++; if (S.blocks.length !== h) break;
      if (NODE_PAUSE) await new Promise((ok) => setTimeout(ok, NODE_PAUSE)); }
    if (S.blocks.length !== h) continue;
    accept(T, nonce, pow, 'node');
  }
}
// ---------- open mining: anyone fetches a template for their own address, solves Argon2id, submits the nonce ----------
const jobs2 = new Map(); let jobN = 0;
function getWork(addr) { K.parseAddress(addr); const key = addr.slice(0, 120), hit = jobs2.get(key);
  if (hit && hit.T.b.height === S.blocks.length && now() - hit.at < 20_000) return hit;
  const T = template(addr), j = { id: String(++jobN), T, at: now(), addr }; jobs2.set(key, j); jobs2.set('#' + j.id, j);
  if (jobs2.size > 4000) for (const [k, v] of jobs2) if (v.T.b.height < S.blocks.length) jobs2.delete(k);
  return j; }
async function submitWork(id, nonce) { const j = jobs2.get('#' + id); if (!j) throw new Error('unknown or expired job, fetch new work');
  if (j.T.b.height !== S.blocks.length) throw new Error('stale: block ' + j.T.b.height + ' was already found');
  nonce = Math.floor(+nonce); if (!Number.isFinite(nonce) || nonce < 0) throw new Error('bad nonce');
  const pow = await powHash(j.T.hdr, nonce); if (!meets(pow, j.T.b.diff)) throw new Error('hash does not meet difficulty');
  if (j.T.b.height !== S.blocks.length) throw new Error('stale: block was found while checking');
  accept(j.T, nonce, pow, 'public'); jobs2.delete('#' + id); jobs2.delete(j.addr.slice(0, 120)); S.pub = (S.pub || 0) + 1;
  // genesis leaderboard: blocks per payout address, listed by a short fingerprint so the address itself is never published
  const fp = minerId(j.addr), e = (S.board ||= {})[fp] ||= { blocks: 0, first: j.T.b.height, firstTs: now() }; e.blocks++; e.last = j.T.b.height; e.lastTs = now(); save();
  return j.T.b.height; }
const minerId = (addr) => crypto.createHash('sha256').update('mojave-miner|' + addr).digest('hex').slice(0, 16);
function board() { const rows = Object.entries(S.board || {}).map(([id, e]) => ({ id, ...e })).sort((a, b) => b.blocks - a.blocks || a.first - b.first);
  return { miners: rows.length, blocks: rows.reduce((a, r) => a + r.blocks, 0), top: rows.slice(0, 100).map((r, i) => ({ rank: i + 1, ...r })) }; }
// keep full signatures/proofs for recent blocks; older txs keep what wallets and explorers need
function prune() { const cut = height() - 3000; if (cut <= 0) return; for (const id of S.blocks[cut].txs || []) { const t = S.txs[id]; if (t && t.vin && !t.pruned) { t.vin.forEach((v) => { delete v.sig; }); t.vout.forEach((o) => delete o.rp); t.pruned = true; } } }

// ---------- activity: the bot wallets pay each other with real private transactions ----------
async function bots() {
  for (;;) { await new Promise((r) => setTimeout(r, 45_000 + Math.random() * 60_000));
    try { const from = 1 + Math.floor(Math.random() * BOTS.length), cands = W.filter((_, k) => k !== from); let to = cands[Math.floor(Math.random() * cands.length)];
      if (balance(from) < 5n * K.UNIT) { const tx = await walletSend(0, W[from][Math.random() < 0.5 ? 'qaddress' : 'address'], 400n * K.UNIT); await submit(tx); continue; }
      const amt = BigInt(Math.floor((0.5 + Math.random() * 20) * 1e6)); await submit(await walletSend(from, Math.random() < 0.35 ? to.qaddress : to.address, amt)); } catch (e) { /* not enough mature coins yet */ } }
}
async function submit(tx) { if (!tx || !Array.isArray(tx.vin) || !Array.isArray(tx.vout)) throw 'malformed';
  // all 16 members: the node cannot see which one is real, so maturity has to hold for every one
  for (const v of tx.vin) { const bad = K.vetRing(v && v.ring, (g) => (S.outs[g] ? S.outs[g].h : null), height()); if (bad) throw bad; }
  const ring = {}; for (const v of tx.vin) for (const g of Array.isArray(v.ring) ? v.ring.slice(0, 16) : []) { const o = getOut(g); if (o) ring[g] = o; }
  const kis = tx.vin.map((v) => v && v.ki).filter((k) => typeof k === 'string');
  const err = await work('verify', tx, ring, kis.filter(spent)); if (err) throw err; if (kis.some(spent)) throw 'key image already spent'; if (big(tx.fee) < MIN_FEE) throw 'fee below 0.01 MOJAVE';
  // full pool: drop the cheapest tx for one that pays more per byte, rather than refusing everyone
  if (mempool.length >= MEMPOOL_MAX) { const worst = mempool[mempool.length - 1]; if (K.feeRate(tx) <= K.feeRate(worst)) throw 'mempool full: fee too low to displace the cheapest tx'; mempool.pop(); }
  mempool.push(tx); mempool.sort((a, b) => K.feeRate(b) - K.feeRate(a)); return K.txhash(tx); }

// ---------- views ----------
const txSummary = (id) => { const t = S.txs[id]; if (!t) return null; return { id, h: t.h, ts: t.ts, coinbase: !!t.coinbase, ins: t.vin ? t.vin.length : 0, outs: t.vout.length, fee: t.fee || '0', quantum: t.vout.filter((o) => o.ct).length, amount: t.coinbase ? t.vout[0].amt : null }; };
const blockView = (b) => ({ height: b.height, hash: b.hash, prev: b.prev, ts: b.ts, diff: b.diff, nonce: b.nonce, pow: b.pow, size: b.size, reward: b.reward, by: b.by || 'node', fees: b.fees, txs: b.txs.length });
function stats() { const n = S.blocks.length, last = S.blocks.slice(-20), span = last.length > 1 ? (last[last.length - 1].ts - last[0].ts) / (last.length - 1) / 1000 : BLOCK_SEC;
  const priv = Object.values(S.txs).filter((t) => !t.coinbase), q = priv.reduce((a, t) => a + t.vout.filter((o) => o.ct).length, 0);
  return { name: 'Mojavechain', ticker: 'MOJAVE', network: 'testnet', height: n - 1, outputs: S.outs.length, keyImages: Object.keys(S.kis).length, privateTxs: priv.length, quantumOutputs: q, mempool: mempool.length,
    emitted: S.emitted, supply: String(SUPPLY), reward: String(reward()), diff: tip() ? tip().diff : 0, blockTime: +span.toFixed(1), targetTime: BLOCK_SEC, hashrate: tip() ? +(tip().diff / span).toFixed(2) : 0,
    ring: K.RING, bits: K.BITS, pow: `Argon2id (${ARGON_KIB / 1024} MiB)`, mint: MOJAVE_MINT || null, faucet: String(FAUCET), publicBlocks: S.pub || 0 }; }
function search(q) { q = String(q || '').trim(); if (/^\d+$/.test(q) && S.blocks[+q]) return { type: 'block', id: q };
  if (/^[0-9a-f]{64}$/.test(q)) { if (S.txs[q]) return { type: 'tx', id: q }; const b = S.blocks.find((x) => x.hash === q); if (b) return { type: 'block', id: String(b.height) }; if (S.kis[q]) return { type: 'tx', id: S.kis[q] }; }
  return null; }

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.pdf': 'application/pdf' };
const PAGES = { '/': 'index.html', '/explorer': 'explorer.html', '/wallet': 'wallet.html', '/docs': 'docs.html', '/whitepaper': 'whitepaper.html', '/mine': 'mine.html', '/faraday': 'faraday.html' };
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
// a json body, rejected properly. the old silent {} turned every bad request into a confusing error further down
const BODY_MAX = 1 << 20, HARD_MAX = BODY_MAX * 8;   // a 16 input ring signature body is about 40 kB
const httpError = (code, msg) => Object.assign(new Error(msg), { code });
const body = (req) => new Promise((ok, no) => {
  let d = '', n = 0, done = false;
  req.on('data', (c) => { n += c.length; if (done) { if (n > HARD_MAX) req.destroy(); return; }
    if (n > BODY_MAX) { done = true; return no(httpError(413, 'body is larger than ' + BODY_MAX + ' bytes')); } d += c; });
  req.on('end', () => { if (done) return; done = true; let v;
    try { v = JSON.parse(d || '{}'); } catch { return no(httpError(400, 'body is not valid json')); }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return no(httpError(400, 'body must be a json object'));
    ok(v); });
  req.on('error', (e) => { if (!done) { done = true; no(e); } });
});
const readJson = async (req, res) => { try { return await body(req); } catch (e) { json(res, e.code === 413 ? 413 : 400, { error: e.message }); return null; } };
// a write needs the wallet view. while the rescan is still walking outputs, say so instead of answering from a half built view
const gated = (res) => { if (ready) return false; res.setHeader('retry-after', '2'); json(res, 503, { error: 'node is rebuilding its wallet view, try again in a few seconds' }); return true; };
const hits = new Map(); const limited = (ip, key, per) => { const k = ip + key, t = hits.get(k) || 0; if (now() - t < per) return true; hits.set(k, now()); return false; };

// a chain that does not check out is not served: no mining on top of a corrupt file, and no overwriting it
const broken = checkChain();
if (broken) { console.error('chain check failed: ' + broken + ' · ' + DATA); process.exit(1); }
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname, ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0];
  try {
    if (p === '/api/stats') return json(res, 200, stats());
    if (p === '/api/health') return json(res, ready ? 200 : 503, { ok: ready, ready, network: 'testnet', height: height(), outputs: S.outs.length, mempool: mempool.length, uptime: Math.round((now() - started) / 1000) });
    if (p === '/api/blocks') { const lim = Math.min(100, +u.searchParams.get('limit') || 15), before = u.searchParams.has('before') ? +u.searchParams.get('before') : S.blocks.length; return json(res, 200, S.blocks.slice(Math.max(0, before - lim), before).reverse().map(blockView)); }
    if (p.startsWith('/api/block/')) { const id = decodeURIComponent(p.slice(11)), b = /^\d+$/.test(id) ? S.blocks[+id] : S.blocks.find((x) => x.hash === id); if (!b) return json(res, 404, { error: 'no such block' }); return json(res, 200, { ...blockView(b), tx: b.txs.map(txSummary).filter(Boolean) }); }
    if (p === '/api/txs') { const ids = []; for (let i = S.blocks.length - 1; i >= 0 && ids.length < 20; i--) for (const id of [...S.blocks[i].txs].reverse()) if (!S.txs[id]?.coinbase && ids.length < 20) ids.push(id); return json(res, 200, { mempool: mempool.map((t) => ({ id: K.txhash(t), ins: t.vin.length, outs: t.vout.length, fee: t.fee, quantum: t.vout.filter((o) => o.ct).length })), recent: ids.map(txSummary) }); }
    // full transaction + its ring members, so anyone can re-run verifyTx themselves (the explorer does it in the browser)
    if (p.startsWith('/api/rawtx/')) { const id = p.slice(11), t = S.txs[id] || mempool.find((x) => K.txhash(x) === id); if (!t) return json(res, 404, { error: 'no such transaction' }); if (t.coinbase) return json(res, 200, { coinbase: true });
      if (t.pruned) return json(res, 200, { pruned: true }); const ring = {}; for (const v of t.vin) for (const g of v.ring) ring[g] = getOut(g); const { h, ts, ...tx } = t; return json(res, 200, { tx, ring }); }
    if (p.startsWith('/api/tx/')) { const id = p.slice(8), t = S.txs[id] || mempool.find((x) => K.txhash(x) === id); if (!t) return json(res, 404, { error: 'no such transaction' });
      const ring = t.vin ? t.vin.map((v) => ({ ki: v.ki, pseudo: v.pseudo, ring: v.ring, sig: v.sig ? { c0: v.sig.c0, r: v.sig.r.length } : null })) : [];
      return json(res, 200, { id, h: t.h ?? null, ts: t.ts ?? null, confirmations: t.h != null ? height() - t.h + 1 : 0, coinbase: !!t.coinbase, fee: t.fee || '0', R: t.R, vin: ring,
        vout: t.vout.map((o) => ({ P: o.P, C: o.C, quantum: !!o.ct, ct: o.ct ? o.ct.slice(0, 96) : null, ctBytes: o.ct ? o.ct.length / 2 : 0, amount: t.coinbase ? o.amt : null, rangeBits: o.rp ? o.rp.length : t.coinbase ? 0 : K.BITS })), size: JSON.stringify(t).length }); }
    if (p === '/api/search') { const r = search(u.searchParams.get('q')); return json(res, r ? 200 : 404, r || { error: 'nothing found: try a block height, block hash, tx id or key image' }); }
    // wallet sync
    if (p === '/api/outputs') { const from = Math.max(0, +u.searchParams.get('from') || 0), lim = Math.min(4000, +u.searchParams.get('limit') || 2000); return json(res, 200, { height: height(), total: S.outs.length, outs: S.outs.slice(from, from + lim).map((o, k) => ({ g: from + k, ...o })) }); }    if (p === '/api/spent' && req.method === 'POST') { const d = await readJson(req, res); if (!d) return; return json(res, 200, { spent: (d.kis || []).slice(0, 5000).map((k) => (S.kis[k] ? 'chain' : mempool.some((t) => t.vin.some((v) => v.ki === k)) ? 'pool' : null)) }); }
    if (p === '/api/decoys') { const avoid = (u.searchParams.get('avoid') || '').split(',').filter(Boolean).map(Number), n = Math.min(15 * 8, +u.searchParams.get('n') || 15);
      // young chains cannot fill a big ring: say so in the same shape as the rest of the api instead of a 500
      try { return json(res, 200, { decoys: decoys(avoid, n), height: height() }); } catch (e) { return json(res, 200, { error: String(e), height: height() }); } }
    if (p === '/api/tx' && req.method === 'POST') { if (gated(res)) return; const d = await readJson(req, res); if (!d) return; try { return json(res, 200, { ok: true, id: await submit(d.tx) }); } catch (e) { return json(res, 200, { error: String(e) }); } }
    if (p === '/api/faucet' && req.method === 'POST') { if (gated(res)) return; const d = await readJson(req, res); if (!d) return; try { K.parseAddress(d.address); } catch (e) { return json(res, 200, { error: String(e) }); }
      const key = d.address.slice(0, 80); if (limited(ip, 'f', 30 * 60_000) || (S.faucet[key] && now() - S.faucet[key] < 60 * 60_000)) return json(res, 200, { error: 'one faucet drip per hour' });
      try { const id = await submit(await walletSend(0, d.address, FAUCET)); S.faucet[key] = now(); save(); return json(res, 200, { ok: true, id, amount: String(FAUCET) }); } catch (e) { hits.delete(ip + 'f'); return json(res, 200, { error: String(e) }); } }
    if (p === '/api/work' && req.method === 'GET') { try { const j = getWork(u.searchParams.get('address') || ''); return json(res, 200, { id: j.id, height: j.T.b.height, diff: j.T.b.diff, hdr: j.T.hdr, reward: String(reward() + j.T.fees),
        argon: { type: 'argon2id', salt: 'mojave-chain-pow!', memoryKiB: ARGON_KIB, iterations: 1, parallelism: 1, hashLength: 32 }, rule: 'argon2id(hdr + "|" + nonce) * diff < 2^256' }); } catch (e) { return json(res, 200, { error: String(e.message || e) }); } }
    if (p === '/api/work' && req.method === 'POST') { if (gated(res)) return; const d = await readJson(req, res); if (!d) return; if (now() - (hits.get(ip + 'wf') || 0) < 500) return json(res, 200, { error: 'slow down after a bad share' });   // only failed shares are throttled
      try { return json(res, 200, { ok: true, height: await submitWork(d.id, d.nonce) }); } catch (e) { const m = String(e.message || e); if (/difficulty|bad nonce/.test(m)) hits.set(ip + 'wf', now()); return json(res, 200, { error: m }); } }
    if (p === '/vendor-hw/argon2.umd.min.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=86400' }); return fs.createReadStream(path.join(ROOT, 'node_modules', 'hash-wasm', 'dist', 'argon2.umd.min.js')).pipe(res); }
    if (p === '/api/leaderboard') { const b = board(), a = u.searchParams.get('address'); if (a) { try { K.parseAddress(a); const id = minerId(a), all = Object.entries(S.board || {}).sort((x, y) => y[1].blocks - x[1].blocks || x[1].first - y[1].first), k = all.findIndex(([i]) => i === id); b.you = { id, rank: k >= 0 ? k + 1 : null, ...(S.board?.[id] || { blocks: 0 }) }; } catch {} } return json(res, 200, b); }
    if (p === '/api/miners') return json(res, 200, W.map((w, k) => ({ name: NAMES[k], address: w.address, outputs: owned[k].length })));
    // static
    if (p.startsWith('/vendor/')) { const f = path.join(ROOT, 'node_modules', '@noble', path.normalize(p.slice(8)).replace(/^(\.\.[\\/])+/, '')); if (!f.startsWith(path.join(ROOT, 'node_modules')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=86400' }); return fs.createReadStream(f).pipe(res); }
    const file = PAGES[p.replace(/\/$/, '') || '/'] || path.normalize(p).replace(/^(\.\.[\\/])+/, '').slice(1), full = path.join(CLIENT, file);
    if (!full.startsWith(CLIENT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(path.join(CLIENT, '404.html'))); }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(full).pipe(res);
  } catch (e) { json(res, 500, { error: String(e) }); }
}).listen(PORT, () => { console.log(`Mojavechain on :${PORT} · height ${height()} · outputs ${S.outs.length}`); });
// a signal stops the miner, writes the pending state and closes the listener, instead of dropping the last blocks
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  console.log('stopping · ' + (flush() ? 'state saved' : 'state not saved'));
  server.close(); worker.terminate().then(() => process.exit(0), () => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref(); });

// rebuild wallet views from stored outputs in short time slices so the API keeps answering during a long rescan, then run
let rescan = 0;
(function step() { const until = now() + 50; for (; rescan < S.outs.length && now() < until; rescan++) scanOut(rescan);   // a fixed 200 outputs can hold the loop for seconds
  if (rescan < S.outs.length) return setImmediate(step); console.log(`wallets rescanned · ${S.outs.length} outputs`); ready = true; mine(); bots(); })();

// shared pill nav, footer, CA bar, toasts, formatting
export const X_URL = 'https://x.com/MojavechainL1', GH_URL = 'https://github.com/MojaveL1/MojaveL1';
export const $ = (id) => document.getElementById(id), api = (p, d) => fetch(p, d ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) } : undefined).then((r) => r.json());
export const kyb = (v) => (Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 });
export const short = (h, n = 8) => (h ? h.slice(0, n) + '…' + h.slice(-6) : '');
export const ago = (ts) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 60 ? Math.floor(s) + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : Math.floor(s / 3600) + 'h ago'; };
export function toast(m, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3600); }
export const copy = (v, what) => navigator.clipboard.writeText(v).then(() => toast((what || 'copied') + ' copied'));
// the K mark, drawn as a stipple of squares so it matches the dot-field hero
export const MARK = (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="#e5c07b" aria-hidden="true">${[[5, 3], [5, 6], [5, 9], [5, 12], [5, 15], [5, 18], [5, 21], [8, 12], [11, 9], [14, 6], [17, 3], [11, 15], [14, 18], [17, 21]].map(([x, y]) => `<rect x="${x - 1.2}" y="${y - 1.2}" width="2.4" height="2.4"/>`).join('')}<rect x="19" y="10.5" width="3" height="3" fill="#ffffff"/></svg>`;
export const LANDING = [['/#top', 'home'], ['/#threat', 'threat'], ['/#design', 'design'], ['/#payments', 'payments'], ['/#compare', 'compare'], ['/#roadmap', 'roadmap']];
export const APP = [['/', 'home'], ['/explorer', 'explorer'], ['/wallet', 'wallet'], ['/docs', 'docs'], ['/whitepaper', 'whitepaper'], ['/mine', 'mine']];
export function chrome(links = APP, cta = ['/wallet', 'open wallet ↗']) {
  const h = document.createElement('header'); h.className = 'nav';
  h.innerHTML = `<a class="logo" href="/">${MARK()}<span>MOJAVE</span><small>CHAIN</small></a><nav>${links.map(([u, t]) => `<a href="${u}" data-k="${t}" class="${location.pathname === u ? 'on' : ''}">${t}</a>`).join('')}</nav><a class="pbtn xbtn" href="${GH_URL}" target="_blank" rel="noopener" aria-label="Mojavechain on GitHub"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z"/></svg></a><a class="pbtn xbtn" href="${X_URL}" target="_blank" rel="noopener" aria-label="Mojavechain on X"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 1.2h3.7l-8 9.2 9.4 12.4h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L.1 1.2h7.6l5.2 6.9 6-6.9Zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3Z"/></svg></a><a class="pbtn" href="${cta[0]}">${cta[1]}</a><button class="pbtn burger" aria-label="menu">menu</button>`;
  document.body.prepend(h); h.querySelector('.burger').onclick = () => h.classList.toggle('open'); h.querySelectorAll('nav a').forEach((a) => (a.onclick = () => h.classList.remove('open')));
  const f = document.createElement('footer'); f.className = 'foot';
  f.innerHTML = `<div class="wrap"><a class="logo" href="/">${MARK()}<span>MOJAVE</span><small>CHAIN</small></a><p>Mojavechain is a private proof-of-work chain running as a public testnet. tMOJAVE has no value; $MOJAVE is the Solana token that carries the project to mainnet. · <a href="${GH_URL}" target="_blank" rel="noopener">GitHub</a> · <a href="${X_URL}" target="_blank" rel="noopener">X</a></p></div>`;
  document.body.appendChild(f); return h;
}
export function caBar(el, mint) { if (!el) return; el.innerHTML = `<span class="cap">$MOJAVE</span><code>${mint || 'launching on pump.fun'}</code>`; el.onclick = () => mint && copy(mint, '$MOJAVE address'); }

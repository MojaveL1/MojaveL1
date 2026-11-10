// Mojavechain site: nav, reveal on scroll, and live testnet numbers with a quiet fallback
(() => {
  document.documentElement.classList.add('js');

  const nav = document.getElementById('nav'), burger = document.getElementById('burger');
  if (burger) burger.onclick = () => nav.classList.toggle('open');
  document.querySelectorAll('#nav nav a').forEach((a) => a.onclick = () => nav.classList.remove('open'));

  const y = document.getElementById('yr');
  if (y) y.textContent = new Date().getFullYear();

  // reveal
  const items = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && items.length) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '-8% 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
  } else items.forEach((el) => el.classList.add('in'));

  // live numbers. every page has the hero panel, some have a strip further down
  const put = (sel, v) => document.querySelectorAll(sel).forEach((el) => (el.textContent = v));
  const num = (v) => Number(v).toLocaleString('en-US');
  const when = (ts) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 60 ? Math.floor(s) + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : Math.floor(s / 3600) + 'h ago'; };

  const live = async () => {
    try {
      const r = await fetch('/api/stats', { cache: 'no-store' });
      if (!r.ok) throw 0;
      const s = await r.json();
      put('[data-h]', '#' + num(s.height));
      put('[data-diff]', num(s.diff));
      put('[data-time]', s.blockTime + 's');
      put('[data-pool]', num(s.mempool));
      put('[data-outs]', num(s.outputs));
      put('[data-ki]', num(s.keyImages));
      put('[data-txs]', num(s.privateTxs));
      put('[data-qt]', num(s.quantumOutputs));
      put('[data-reward]', (Number(s.reward) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }));
      put('[data-emitted]', (Number(s.emitted) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 }));
      put('[data-public]', num(s.publicBlocks));
      document.querySelectorAll('[data-live]').forEach((el) => { el.classList.remove('off'); });
      document.querySelectorAll('[data-live-txt]').forEach((el) => (el.textContent = 'testnet live'));
      const b = await fetch('/api/blocks?limit=1', { cache: 'no-store' }).then((x) => x.ok ? x.json() : []);
      if (b[0]) { put('[data-tip]', b[0].hash.slice(0, 16) + '…'); put('[data-ago]', when(b[0].ts)); }
    } catch {
      document.querySelectorAll('[data-live]').forEach((el) => el.classList.add('off'));
      document.querySelectorAll('[data-live-txt]').forEach((el) => (el.textContent = 'node offline'));
      put('[data-tip]', 'start the node to see this');
      put('[data-ago]', '');
    }
  };
  live();
  if (document.querySelector('[data-h]')) setInterval(live, 20000);
})();

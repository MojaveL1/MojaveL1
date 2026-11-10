// Builds client/whitepaper.html from WHITEPAPER.md
const fs = require('fs'), path = require('path');
const md = fs.readFileSync(path.join(__dirname, '../WHITEPAPER.md'), 'utf8').split(/\r?\n/);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>').replace(/(^|\s)(\/api\/[^\s]+|verifyTx|mjc1|mjcq1)(?=[\s.,:]|$)/g, '$1<code>$2</code>');
let out = [], i = 0, title = '', sub = '';
while (i < md.length) {
  const l = md[i];
  if (l.startsWith('# ')) { title = l.slice(2); i++; continue; }
  if (l.startsWith('## ')) { out.push(`<h3>${esc(l.slice(3))}</h3>`); i++; continue; }
  if (l.startsWith('```')) { const b = []; i++; while (!md[i].startsWith('```')) b.push(md[i++]); i++; out.push(`<pre>${esc(b.join('\n'))}</pre>`); continue; }
  if (/^(- |\d+\. )/.test(l)) { const ol = /^\d/.test(l), b = []; while (i < md.length && /^(- |\d+\. )/.test(md[i])) b.push(`<li>${inline(md[i++].replace(/^(- |\d+\. )/, ''))}</li>`); out.push(`<${ol ? 'ol' : 'ul'}>${b.join('')}</${ol ? 'ol' : 'ul'}>`); continue; }
  if (l.trim()) { if (!sub && !out.length) sub = l; else out.push(`<p>${inline(l)}</p>`); }
  i++;
}
fs.writeFileSync(path.join(__dirname, '../client/whitepaper.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mojave Whitepaper</title><meta name="description" content="Mojavechain whitepaper: private money for the quantum era."><link rel="icon" href="/favicon.svg"><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Geist+Mono:wght@400&display=swap" rel="stylesheet"><link rel="stylesheet" href="/style.css"></head><body>
<main class="wrap app prose">
<div class="pagehead"><h1>${esc(title)}</h1><span class="cap">${esc(sub)}</span></div>
<p style="margin-top:18px"><a href="https://github.com/MojaveL1/MojaveL1/blob/main/WHITEPAPER.md">also on GitHub ↗</a></p>
${out.join('\n')}
</main>
<script type="module">import { chrome } from '/common.js'; chrome();</script></body></html>
`);
console.log('ok');

// Local preview for site/: serves the marketing pages and passes /api to a node if one is up.
//   node _studio/site-preview.cjs [port]      then open http://localhost:4400
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const API = process.env.API || 'http://127.0.0.1:8266';
const PORT = +process.argv[2] || 4400;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

http.createServer((req, res) => {
  const u = req.url.split('?')[0];

  if (u.startsWith('/api/')) {
    const up = http.request(API + req.url, { method: req.method }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"error":"no node on ' + API + '"}'); });
    req.pipe(up); return;
  }

  const file = path.resolve(SITE, '.' + (u === '/' ? '/index.html' : u));
  if (file.startsWith(SITE) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res); return;
  }

  // anything that is not a site file belongs to the node: /wallet, /explorer, /docs, /whitepaper
  const up = http.request(API + req.url, { method: req.method }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(SITE, '404.html')).pipe(res);
  });
  req.pipe(up);
}).listen(PORT, () => console.log('site on http://localhost:' + PORT + ' (api ' + API + ')'));

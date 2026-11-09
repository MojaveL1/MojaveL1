// Boots a throwaway node (fast blocks, temp data file) and runs the end-to-end test against it.
import { spawn } from 'node:child_process'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const PORT = String(18000 + Math.floor(Math.random() * 1000)), DATA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mojave-')), 'chain.json');
const node = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, BLOCK_SEC: '5', DATA_PATH: DATA }, stdio: ['ignore', 'pipe', 'inherit'] });
const up = async () => { for (let i = 0; i < 60; i++) { try { const s = await (await fetch(`http://localhost:${PORT}/api/stats`)).json(); if (s.height >= 3) return; } catch {} await new Promise((r) => setTimeout(r, 1000)); } throw new Error('node did not start'); };
try { await up(); const t = spawn(process.execPath, ['test/e2e.test.js'], { env: { ...process.env, API: `http://localhost:${PORT}` }, stdio: 'inherit' });
  const code = await new Promise((r) => t.on('exit', r)); node.kill(); process.exit(code); } catch (e) { console.error(e.message); node.kill(); process.exit(1); }

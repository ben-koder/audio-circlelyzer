#!/usr/bin/env node
// Lightweight static server for testing the production build locally.
// Sets COOP/COEP headers so SharedArrayBuffer is available (matches the
// behavior provided by coi-serviceworker on GitHub Pages once registered).
//
// Usage: node scripts/serve-dist.mjs [port]
//   default port: 4300
//
// Serves files from dist/audio-circlelyzer-app/browser

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', 'dist', 'audio-circlelyzer-app', 'browser');
const PORT = Number.parseInt(process.argv[2] ?? process.env['PORT'] ?? '4300', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml':  'text/yaml; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
};

const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const safePath = normalize(join(ROOT, pathname));
    if (!safePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    let filePath = safePath;
    let info;
    try {
      info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, 'index.html');
        info = await stat(filePath);
      }
    } catch {
      // SPA fallback to index.html
      filePath = join(ROOT, 'index.html');
      info = await stat(filePath);
    }

    const body = await readFile(filePath);
    const headers = {
      ...COI_HEADERS,
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    };
    res.writeHead(200, headers);
    res.end(body);
  } catch (err) {
    console.error(err);
    res.writeHead(500); res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT}`);
  console.log(`  http://localhost:${PORT}/   (with COOP/COEP headers)`);
});

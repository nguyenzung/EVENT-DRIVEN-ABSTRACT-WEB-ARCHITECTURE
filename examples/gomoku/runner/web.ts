import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(process.env.WEB_PORT ?? '3000', 10);
const PUBLIC = join(fileURLToPath(import.meta.url), '../../public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
};

const server = createServer((req, res) => {
  const url  = req.url === '/' ? '/index.html' : (req.url ?? '/index.html');
  const file = join(PUBLIC, url);
  if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
  res.end(readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`[Web] Serving   →  http://localhost:${PORT}`);
  console.log(`[Web] Open 2 tabs  →  http://localhost:${PORT}`);
});

// ローカル確認用の静的サーバー: node scripts/serve.mjs [port] [dir]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
const port = Number(process.argv[2] || 8080), root = resolve(process.argv[3] || '.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let f = join(root, p); if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    if (!f.startsWith(root)) throw new Error('forbidden');
    const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`http://localhost:${port}/ (root: ${root})`));

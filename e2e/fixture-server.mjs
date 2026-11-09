// E2E 用の偽の辞書配信（本物は snstyping-dict の GitHub Pages）。
// e2e/fixtures/dict/ を静的に配る。画面（ブラウザ）からも Worker からも読むので CORS を付ける。
// Node の標準ライブラリだけで動かす。使い方: node e2e/fixture-server.mjs <port>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./fixtures/dict/', import.meta.url));
const port = Number(process.argv[2] ?? 8798);
const types = { '.json': 'application/json', '.tsv': 'text/tab-separated-values; charset=utf-8' };

createServer(async (req, res) => {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  // クエリ（?v=版）は無視する。.. で root の外へ出られないようにする
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.includes('..')) {
    res.writeHead(400, headers).end();
    return;
  }
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, headers).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`fixture server on http://127.0.0.1:${port}/`));

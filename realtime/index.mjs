// Cloudflare Worker エントリ。ルーム作成APIと、ルームDOへのWebSocket振り分け。
// デプロイ: npm run deploy:realtime / ローカル: npm run dev:realtime (port 8787)

export { Room } from './room.mjs';
export { Directory } from './directory.mjs';
export { Stats } from './stats.mjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // 紛らわしい文字(l,1,o,0,i)を除外
const CODE_LENGTH = 6;

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 統計の集計取得(表示用)
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      const stub = env.STATS.get(env.STATS.idFromName('global'));
      const res = await stub.fetch('https://stats/summary');
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // プレイ数の計上(solo / ghost はクライアントから。online は Room DO がサーバー側で叩く)
    // ボディ: { mode: 'solo'|'ghost'|'online', ruleKey: string }。検証は Stats DO 側。
    if (req.method === 'POST' && url.pathname === '/api/stats/hit') {
      const stub = env.STATS.get(env.STATS.idFromName('global'));
      await stub.fetch('https://stats/hit', {
        method: 'POST',
        body: await req.text(),
      });
      return json({ ok: true });
    }

    // 公開ルーム一覧
    if (req.method === 'GET' && url.pathname === '/api/rooms') {
      const stub = env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
      const res = await stub.fetch('https://directory/list');
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // 部屋作成。ruleType 'propose'(毎試合全員が提案・ランダム採用) or 'host'(幹事が固定)
    // isPublic: false で一覧に載せない(デフォルトは公開)
    // maxPlayers: 同時対戦人数の上限 2〜4(検証は Room DO 側)
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      let body = {};
      try {
        body = await req.json();
      } catch {
        // ボディなしは提案方式
      }
      // ルールの中身の検証・補正は Room DO 側(sanitizeProposal)で行う
      // コード衝突(=使用中の部屋に当たった)時は引き直す
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const res = await stub.fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({
            ruleType: body.ruleType,
            rule: body.rule,
            code,
            isPublic: body.isPublic !== false,
            maxPlayers: body.maxPlayers,
          }),
        });
        if (res.ok) return json({ code }, 201);
      }
      return json({ error: 'could not allocate room' }, 503);
    }

    // WebSocket 接続: /rooms/<code>/ws
    const match = url.pathname.match(/^\/rooms\/([a-z0-9]+)\/ws$/);
    if (match) {
      if (req.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426, headers: CORS_HEADERS });
      }
      const stub = env.ROOM.get(env.ROOM.idFromName(match[1]));
      return stub.fetch(req);
    }

    return new Response('not found', { status: 404, headers: CORS_HEADERS });
  },
};

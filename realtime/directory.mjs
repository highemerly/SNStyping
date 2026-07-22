// 公開ルームの一覧を保持する Durable Object(全体で1インスタンス)。
// 各 Room DO が参加者の増減・状態変化のたびに /update を叩いて自分を登録・更新する。
// 生きている部屋は Room 側のハートビート(2分間隔)でも更新されるため、
// それが2回以上途絶えたエントリは死んだ部屋とみなして一覧取得時に間引く。

const STALE_MS = 5 * 60 * 1000;
const MAX_LIST = 50;

export class Directory {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const rooms = (await this.ctx.storage.get('rooms')) ?? {};

    if (req.method === 'POST' && url.pathname === '/update') {
      const info = await req.json();
      if (!info?.code) return new Response('bad request', { status: 400 });
      if (info.playerCount > 0) {
        rooms[info.code] = { ...info, updatedAt: Date.now() };
      } else {
        delete rooms[info.code];
      }
      await this.ctx.storage.put('rooms', rooms);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/list') {
      const now = Date.now();
      let changed = false;
      for (const [code, room] of Object.entries(rooms)) {
        if (now - room.updatedAt > STALE_MS) {
          delete rooms[code];
          changed = true;
        }
      }
      if (changed) await this.ctx.storage.put('rooms', rooms);
      const list = Object.values(rooms)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_LIST);
      return Response.json(list);
    }

    return new Response('not found', { status: 404 });
  }
}

// プレイ数の統計を保持する Durable Object(全体で1インスタンス、SQLite バックエンド)。
// ユーザー名などの個人情報は一切持たず、「モード × ルール × 日付」ごとの累計回数だけを数える。
//
// - solo / ghost: クライアントがゲーム完了時に POST /api/stats/hit を1発(ベストエフォート)
// - online      : Room DO が試合開始時にサーバー側から直接叩く(改ざん不可)
// 日付はこの DO 側(サーバー時刻)で確定する。クライアントの時計は信用しない。
//
// rule_key の形式:
//   solo / online : `<wordListId>|<durationSec>`(例: basic|60)
//   ghost         : `<ghostId>`(ローカルファイルは 'file')

const MODES = new Set(['solo', 'ghost', 'online']);
// rule_key に許す文字。id(英数と _ - . と、Mastodonハンドル用の @)と区切りの | のみ。長さは80まで。
// 例: `@highemerly@handon.club|60`(SNS辞書リストは投稿者ハンドルがそのままリストID)。
const RULE_KEY_RE = /^[A-Za-z0-9_.@|-]{1,120}$/;
// 表示用タイムライン(日別)の取得日数
const DAILY_DAYS = 30;

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export class Stats {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS hits (
        mode TEXT NOT NULL,
        rule_key TEXT NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (mode, rule_key, day)
      )`,
    );
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/hit') {
      let body = {};
      try {
        body = await req.json();
      } catch {
        return Response.json({ ok: false }, { status: 400 });
      }
      const mode = body?.mode;
      const ruleKey = body?.ruleKey;
      // 不正な入力は黙って無視する(統計はベストエフォート・攻撃面を作らない)
      if (!MODES.has(mode) || typeof ruleKey !== 'string' || !RULE_KEY_RE.test(ruleKey)) {
        return Response.json({ ok: true });
      }
      this.sql.exec(
        `INSERT INTO hits (mode, rule_key, day, count) VALUES (?, ?, ?, 1)
         ON CONFLICT(mode, rule_key, day) DO UPDATE SET count = count + 1`,
        mode,
        ruleKey,
        today(),
      );
      return Response.json({ ok: true });
    }

    if (url.pathname === '/summary') {
      // ルールごとの累計(全期間)
      const rules = this.sql
        .exec(
          `SELECT mode, rule_key AS ruleKey, SUM(count) AS total
           FROM hits GROUP BY mode, rule_key ORDER BY total DESC`,
        )
        .toArray();
      // 直近 DAILY_DAYS 日の日別合計(いつプレイされたかのタイムライン)
      const daily = this.sql
        .exec(
          `SELECT day, SUM(count) AS total
           FROM hits GROUP BY day ORDER BY day DESC LIMIT ?`,
          DAILY_DAYS,
        )
        .toArray()
        .reverse();
      const totalsByMode = this.sql
        .exec(`SELECT mode, SUM(count) AS total FROM hits GROUP BY mode`)
        .toArray();
      const total = totalsByMode.reduce((s, r) => s + Number(r.total), 0);
      return Response.json({ total, byMode: totalsByMode, rules, daily });
    }

    return new Response('not found', { status: 404 });
  }
}

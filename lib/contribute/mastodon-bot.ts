// 本人確認Bot(handon.club 上のアカウント)の通知を照会して、
// "Bot宛にコードを投稿した人" の acct を確定する。
//
// 送信者(notification.account.acct)は ActivityPub の連合で認証済みなので詐称できない。
// = コードを含むメンションの送信者を、そのまま本人とみなせる。
//
// 必要な環境変数:
//   BOT_MASTODON_HOST   本人確認Botのインスタンス(既定 handon.club)
//   BOT_MASTODON_TOKEN  Botのアクセストークン(スコープ read:notifications)

export function botHost(): string {
  return process.env.BOT_MASTODON_HOST || 'handon.club';
}

function botToken(): string {
  const t = process.env.BOT_MASTODON_TOKEN;
  if (!t) throw new Error('BOT_MASTODON_TOKEN が未設定です');
  return t;
}

// Mastodon の acct は、Botと同一インスタンスのローカルユーザーだとドメインが付かない
// ("user")。リモートは "user@instance"。辞書のファイル名/idは "@user@instance" 形式なので
// ドメインを補って正規化する。使えない文字を含むものは弾く(ファイル名の許可文字に合わせる)。
export function normalizeAcct(rawAcct: string, host: string): string | null {
  let acct = rawAcct.trim().replace(/^@/, '');
  if (!acct.includes('@')) acct = `${acct}@${host}`;
  const [user, domain, ...rest] = acct.split('@');
  if (rest.length > 0 || !user || !domain) return null;
  const full = `@${user}@${domain.toLowerCase()}`;
  // 辞書ファイル名の許可文字(半角英数・@・.・-・_)に収まるか
  if (!/^@[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(full)) return null;
  return full;
}

type Notification = {
  id: string;
  type: string;
  account?: { acct?: string };
  status?: { content?: string };
};

// コードを含むメンションを探し、その送信者の正規化 acct を返す。
// 見つかった通知IDも返す(呼び出し側で dismiss して再マッチを防ぐため)。
export async function findVerifiedAcct(
  code: string,
): Promise<{ acct: string; notificationId: string } | null> {
  const host = botHost();
  const url = new URL(`https://${host}/api/v1/notifications`);
  url.searchParams.append('types[]', 'mention');
  url.searchParams.set('limit', '30');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken()}`, 'User-Agent': 'snstyping-verify' },
  });
  if (!res.ok) throw new Error(`bot notifications: HTTP ${res.status}`);
  const notifications: Notification[] = await res.json();

  for (const n of notifications) {
    if (n.type !== 'mention') continue;
    const content = n.status?.content ?? '';
    if (!content.includes(code)) continue;
    const acct = normalizeAcct(n.account?.acct ?? '', host);
    if (acct) return { acct, notificationId: n.id };
  }
  return null;
}

// マッチした通知を消化する(任意・失敗は無視)。同じコードでの再確認を防ぐ。
export async function dismissNotification(id: string): Promise<void> {
  try {
    await fetch(`https://${botHost()}/api/v1/notifications/${id}/dismiss`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken()}`, 'User-Agent': 'snstyping-verify' },
    });
  } catch {
    // 消化に失敗しても本人確認自体は成立しているので無視
  }
}

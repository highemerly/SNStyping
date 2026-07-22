// 本人確認の確認。challenge から取り出したコードが Bot への投稿に現れているか照会し、
// 現れていればその送信者の acct を本人とみなしてセッション Cookie を発行する。

import { NextResponse } from 'next/server';
import { readChallenge, createSession, SESSION_COOKIE } from '@/lib/contribute/session';
import { findVerifiedAcct, dismissNotification } from '@/lib/contribute/mastodon-bot';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let challenge: unknown;
  try {
    ({ challenge } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (typeof challenge !== 'string') {
    return NextResponse.json({ error: 'challenge がありません' }, { status: 400 });
  }

  const parsed = readChallenge(challenge);
  if (!parsed) {
    // 署名不一致 or 期限切れ。最初からやり直してもらう。
    return NextResponse.json({ error: 'expired', message: '確認用コードの有効期限が切れました。もう一度最初からやり直してください。' }, { status: 410 });
  }

  let found: Awaited<ReturnType<typeof findVerifiedAcct>>;
  try {
    found = await findVerifiedAcct(parsed.code);
  } catch (e) {
    return NextResponse.json({ error: 'bot_unreachable', message: 'Botの通知を確認できませんでした。しばらくして再試行してください。' }, { status: 502 });
  }

  if (!found) {
    // まだ投稿が届いていない(連合の遅延など)。ポーリングを続けてもらう。
    return NextResponse.json({ verified: false });
  }

  await dismissNotification(found.notificationId);
  const session = createSession(found.acct);
  const res = NextResponse.json({ verified: true, acct: found.acct });
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60,
  });
  return res;
}

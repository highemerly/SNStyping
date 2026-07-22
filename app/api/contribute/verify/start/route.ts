// 本人確認の開始。ランダムなコードを発行し、Bot宛に投稿してもらう文面を返す。
// サーバー側に状態は持たない: コードは署名付き challenge に包んで返し、確認時に検証する。

import { NextResponse } from 'next/server';
import { createChallenge } from '@/lib/contribute/session';
import { botHost } from '@/lib/contribute/mastodon-bot';

export const runtime = 'nodejs';

export async function POST() {
  const { code, challenge } = createChallenge();
  const botAcct = `@${process.env.BOT_MASTODON_USER || 'snstyping'}@${botHost()}`;
  // ユーザーがそのままコピペして投稿できる文面
  const postText = `${botAcct} 本人確認 ${code}`;
  return NextResponse.json({ challenge, code, botAcct, postText });
}

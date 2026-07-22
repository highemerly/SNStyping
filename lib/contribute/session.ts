// 投稿フローの本人確認チャレンジ と セッション の署名ヘルパー。
//
// どちらも「HMAC-SHA256 で署名した短命トークン」で、サーバー側に状態を持たない
// (KV不要)。チャレンジは "Bot宛にこのコードを投稿して" の code を server 署名で包み、
// 改ざん・総当たりを防ぐ。セッションは本人確認済みの acct を包む Cookie 値。
//
// 必要な環境変数: CONTRIBUTE_SESSION_SECRET(十分に長いランダム文字列)

import crypto from 'node:crypto';

const CHALLENGE_TTL_MS = 15 * 60 * 1000; // コード投稿までの猶予
const SESSION_TTL_MS = 30 * 60 * 1000; // 本人確認後、送信までの猶予

export const SESSION_COOKIE = 'contribute_session';

function secret(): string {
  const s = process.env.CONTRIBUTE_SESSION_SECRET;
  if (!s) throw new Error('CONTRIBUTE_SESSION_SECRET が未設定です');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hmac(data: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(data).digest());
}

// payload を署名して `<body>.<sig>` 形式のトークンにする
function sign(payload: Record<string, unknown>): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${hmac(body)}`;
}

// トークンを検証してペイロードを返す(署名不一致・期限切れ・種別違いは null)
function verify<T extends { exp: number; kind: string }>(token: string, kind: string): T | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // タイミング攻撃を避けて署名比較
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  let payload: T;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (payload.kind !== kind || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

// ---- チャレンジ(Bot宛に投稿してもらうコード)----
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい 0/O/1/I を除いた base32

export function createChallenge(): { code: string; challenge: string } {
  const bytes = crypto.randomBytes(10);
  let rand = '';
  for (const b of bytes) rand += CODE_ALPHABET[b % CODE_ALPHABET.length];
  const code = `snstyping-verify-${rand}`;
  const challenge = sign({ kind: 'challenge', code, exp: Date.now() + CHALLENGE_TTL_MS });
  return { code, challenge };
}

export function readChallenge(challenge: string): { code: string } | null {
  const p = verify<{ exp: number; kind: string; code: string }>(challenge, 'challenge');
  return p ? { code: p.code } : null;
}

// ---- セッション(本人確認済み acct)----
export function createSession(acct: string): string {
  return sign({ kind: 'session', acct, exp: Date.now() + SESSION_TTL_MS });
}

export function readSession(token: string | undefined): { acct: string } | null {
  if (!token) return null;
  const p = verify<{ exp: number; kind: string; acct: string }>(token, 'session');
  return p ? { acct: p.acct } : null;
}

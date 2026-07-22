// 対戦サーバー(Cloudflare Worker)の接続先。
// 本番では NEXT_PUBLIC_REALTIME_URL に Worker のURLを設定する。
// 未設定なら wrangler dev のデフォルト(localhost:8787)を使う。

export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:8787';

export function roomWsUrl(code: string, name: string): string {
  return `${REALTIME_URL.replace(/^http/, 'ws')}/rooms/${code}/ws?name=${encodeURIComponent(name)}`;
}

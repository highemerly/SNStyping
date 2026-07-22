// プレイ数の統計を対戦サーバー(Cloudflare Worker)に記録・取得するクライアントヘルパ。
// 記録はベストエフォート(失敗しても握り潰す)。個人情報は一切送らない。

import { REALTIME_URL } from './realtime';

export type StatsMode = 'solo' | 'ghost' | 'online';

// ソロ・オンラインの rule_key: `<wordListId>|<durationSec>`
export function ruleKeyFor(wordListId: string | undefined, durationSec: number): string {
  const list = wordListId && wordListId !== 'upload' ? wordListId : 'upload';
  return `${list}|${durationSec}`;
}

// ゲーム完了時に1回だけ呼ぶ。fire-and-forget(完了直後の画面遷移でも欠落しにくいよう keepalive)。
export function recordPlay(mode: StatsMode, ruleKey: string): void {
  try {
    fetch(`${REALTIME_URL}/api/stats/hit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ruleKey }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 統計はベストエフォート
  }
}

export interface StatsSummary {
  total: number;
  byMode: { mode: StatsMode; total: number }[];
  rules: { mode: StatsMode; ruleKey: string; total: number }[];
  daily: { day: string; total: number }[];
}

export async function fetchStats(): Promise<StatsSummary> {
  const res = await fetch(`${REALTIME_URL}/api/stats`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`stats HTTP ${res.status}`);
  return res.json();
}

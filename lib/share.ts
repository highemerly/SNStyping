// リザルト共有(案A: OGPカード方式)のURLパラメータ符号化。
// リザルト画面 → /s?score=... → og:image が /api/og?score=... を指す、の3箇所で共有する。

export interface ShareResult {
  score: number;
  hits: number;
  misses: number;
  completedWords: number;
  kpm: number;
  accuracy: number;
  /** 例:「基本セット / 60秒」 */
  rule: string;
}

export function shareQuery(r: ShareResult): string {
  return new URLSearchParams({
    score: String(r.score),
    hits: String(r.hits),
    miss: String(r.misses),
    words: String(r.completedWords),
    kpm: String(r.kpm),
    acc: String(r.accuracy),
    rule: r.rule,
  }).toString();
}

// URL は誰でも書き換えられるため、描画前に数値化と上限で正規化しておく
function num(v: string | string[] | undefined, max: number): number {
  const n = Math.floor(Number(Array.isArray(v) ? v[0] : v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export function parseShareParams(sp: Record<string, string | string[] | undefined>): ShareResult {
  const acc = Number(Array.isArray(sp.acc) ? sp.acc[0] : sp.acc);
  const rule = (Array.isArray(sp.rule) ? sp.rule[0] : sp.rule) ?? '';
  return {
    score: num(sp.score, 9_999_999),
    hits: num(sp.hits, 999_999),
    misses: num(sp.miss, 999_999),
    completedWords: num(sp.words, 999_999),
    kpm: num(sp.kpm, 9_999),
    accuracy: Number.isFinite(acc) ? Math.min(Math.max(acc, 0), 100) : 0,
    rule: rule.slice(0, 40),
  };
}

/** SNS投稿の本文(URLは別パラメータで渡すため含めない)。wordListTitle は辞書セット名 */
export function shareText(r: ShareResult, wordListTitle?: string): string {
  const parts = [wordListTitle, `KPM ${r.kpm}`, `正確率 ${r.accuracy}%`].filter(Boolean).join(' / ');
  return `SNS Typing でスコア ${r.score} を記録しました! (${parts}) #snstyping`;
}

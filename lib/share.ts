// リザルト共有(案A: OGPカード方式)のURLパラメータ符号化。
// リザルト画面 → /s?score=... → og:image が /api/og?score=... を指す、の3箇所で共有する。
// ワード数指定で打ち切った結果は time(クリアタイム)も持ち、スコアの代わりにタイムを主役にする。

export interface ShareResult {
  score: number;
  hits: number;
  misses: number;
  completedWords: number;
  kpm: number;
  accuracy: number;
  /** 例:「基本セット / 60秒」「基本セット / 10語」 */
  rule: string;
  /** ワード数指定で打ち切ったときのクリアタイム(秒)。時間指定・未クリアでは無し */
  timeSec?: number;
}

// 共有ページ・OG画像の主役の数値
export function shareHeadline(r: ShareResult): { label: string; value: string } {
  return r.timeSec != null
    ? { label: 'タイム', value: `${r.timeSec.toFixed(2)}秒` }
    : { label: 'スコア', value: String(r.score) };
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
    ...(r.timeSec != null ? { time: String(r.timeSec) } : {}),
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
  const timeRaw = Array.isArray(sp.time) ? sp.time[0] : sp.time;
  const time = Number(timeRaw);
  return {
    score: num(sp.score, 9_999_999),
    hits: num(sp.hits, 999_999),
    misses: num(sp.miss, 999_999),
    completedWords: num(sp.words, 999_999),
    kpm: num(sp.kpm, 9_999),
    accuracy: Number.isFinite(acc) ? Math.min(Math.max(acc, 0), 100) : 0,
    rule: rule.slice(0, 40),
    timeSec:
      timeRaw != null && timeRaw !== '' && Number.isFinite(time) && time >= 0
        ? Math.min(Math.round(time * 100) / 100, 99_999)
        : undefined,
  };
}

/** SNS投稿の本文(URLは別パラメータで渡すため含めない)。wordListTitle は辞書セット名 */
export function shareText(r: ShareResult, wordListTitle?: string): string {
  if (r.timeSec != null) {
    // ワード数指定: rule は「辞書名 / 10語」なので辞書名も含まれる
    const parts = [r.rule, `KPM ${r.kpm}`, `正確率 ${r.accuracy}%`].filter(Boolean).join(' / ');
    return `SNS Typing でタイム ${r.timeSec.toFixed(2)}秒 を記録しました! (${parts}) #snstyping`;
  }
  const parts = [wordListTitle, `KPM ${r.kpm}`, `正確率 ${r.accuracy}%`].filter(Boolean).join(' / ');
  return `SNS Typing でスコア ${r.score} を記録しました! (${parts}) #snstyping`;
}

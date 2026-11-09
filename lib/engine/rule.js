// プレイルール(遊び方)。DOM には依存しない。Next 側・Worker 側の両方から使う。
//
// ルールは2種類:
//   - 時間指定  { mode: 'time',  durationSec }: 制限時間内にどれだけ打てるか(スコアの高い順)
//   - ワード数指定 { mode: 'words', wordCount }: 指定数のお題を打ち切るまでの時間(タイムの短い順)
// 画面の状態として両方の値を持ち回すため、ルールオブジェクトは常に
// { mode, durationSec, wordCount, wordListId } の4項目をそろえる(使わない方は無視する)。
// mode が無いルール(ワード数指定の導入前のもの)は時間指定として扱う。

/** @typedef {'time' | 'words'} PlayMode */
/** @typedef {{ mode: PlayMode, durationSec: number, wordCount: number, wordListId: string }} PlayRule */
/** @typedef {{ mode?: string, durationSec?: number, wordCount?: number }} RuleLike */
/**
 * @typedef {{ score: number, hits: number, misses: number, completedWords: number, kpm: number,
 *   accuracy: number, timeSec?: number, cleared?: boolean }} GameResult
 *   timeSec / cleared はワード数指定の導入前の記録(ゴーストなど)には無い
 */

export const DURATION_OPTIONS = [30, 60, 120];
export const WORD_COUNT_OPTIONS = [10, 15, 20, 30];
export const DEFAULT_DURATION_SEC = 60;
export const DEFAULT_WORD_COUNT = 10;

// ワード数指定の打ち切り時間(1語あたり)。放置されても試合が終わるようにするための上限
export const SEC_PER_WORD_LIMIT = 30;

// 入力値(URL・保存値・対戦相手の提案など)を検証・補正して、4項目そろったルールにする。
// wordListId は形式のみ確認する(実在チェックは使う側。サーバーはカタログに無ければ basic に落とす)。
/**
 * @param {any} p
 * @returns {PlayRule}
 */
export function sanitizeRule(p) {
  /** @type {PlayMode} */
  const mode = p?.mode === 'words' ? 'words' : 'time';
  let durationSec = Number(p?.durationSec ?? DEFAULT_DURATION_SEC);
  if (!Number.isInteger(durationSec) || durationSec < 5 || durationSec > 300) durationSec = DEFAULT_DURATION_SEC;
  let wordCount = Number(p?.wordCount ?? DEFAULT_WORD_COUNT);
  if (!Number.isInteger(wordCount) || wordCount < 1 || wordCount > 100) wordCount = DEFAULT_WORD_COUNT;
  const wordListId =
    typeof p?.wordListId === 'string' && /^[a-z0-9_-]{1,50}$/i.test(p.wordListId) ? p.wordListId : 'basic';
  return { mode, durationSec, wordCount, wordListId };
}

// 試合の打ち切り時間(秒)。時間指定は制限時間そのもの、ワード数指定は上限時間
/** @param {{ mode: string, durationSec: number, wordCount: number }} rule */
export function timeLimitSec(rule) {
  return rule.mode === 'words' ? rule.wordCount * SEC_PER_WORD_LIMIT : rule.durationSec;
}

// 「60秒」「10語」のような短い表示
/** @param {RuleLike} rule */
export function ruleAmountLabel(rule) {
  return rule.mode === 'words' ? `${rule.wordCount}語` : `${rule.durationSec}秒`;
}

// 統計の rule_key の後半。時間指定は秒数(従来どおり)、ワード数指定は w+語数(例: w10)
/** @param {RuleLike} rule */
export function ruleKeySuffix(rule) {
  return rule.mode === 'words' ? `w${rule.wordCount}` : String(rule.durationSec);
}

// ruleKeySuffix の逆。解釈できなければ null
/** @param {string} s */
export function parseRuleKeySuffix(s) {
  const m = /^(w?)(\d+)$/.exec(s ?? '');
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] ? { mode: 'words', wordCount: n } : { mode: 'time', durationSec: n };
}

// 「1.23秒」表示用
/** @param {number} sec */
export function formatTimeSec(sec) {
  return `${Number(sec).toFixed(2)}秒`;
}

// 結果(Game.result() の出力)の比較。a が上位なら負、下位なら正、同順位なら 0。
//   時間指定: スコアの高い順
//   ワード数指定: 打ち切れた人が上位で、その中はタイムの短い順。
//                 打ち切れなかった人どうしは完了したお題の多い順 → スコアの高い順
/**
 * @param {GameResult} a
 * @param {GameResult} b
 * @param {string} mode
 */
export function compareResults(a, b, mode) {
  if (mode === 'words') {
    const ac = !!a.cleared;
    const bc = !!b.cleared;
    if (ac !== bc) return ac ? -1 : 1;
    if (ac) return (a.timeSec ?? Infinity) - (b.timeSec ?? Infinity);
    if (a.completedWords !== b.completedWords) return b.completedWords - a.completedWords;
  }
  return b.score - a.score;
}

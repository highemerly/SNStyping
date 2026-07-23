// 読み(ふりがな)生成の「エンジン非依存」な共通部品。
// kuromoji(サーバー)と mecab-web-worker/UniDic(クライアント)の両方から使うため、
// ここには重い依存(kuromoji)を持ち込まない。romaji.js はブラウザでも動く判定エンジン。
import { parseKana, normalizeReading } from '../engine/romaji.js';

// トークン単位の誤読補正: 「表層形|辞書の読み(カタカナ)」→ 正しい読み(ひらがな)
/** @type {Record<string, string>} */
export const KANA_FIXES = {
  '他|タ': 'ほか', // 「他は特に」など
  '充|タカシ': 'じゅう', // 人名扱いされる(モバ充) — kuromoji
  '充|ミツル': 'じゅう', // UniDic は 充 を ミツル と読む(モバ充)
  '募|ツノ': 'ぼ', // 緩募
  '私|ワタクシ': 'わたし', // UniDic 既定の ワタクシ を SNS 向けに わたし へ
};

// 読み全体への文字列置換補正(複数トークンにまたがる誤読・固有名詞)
/** @type {Record<string, string>} */
export const READING_FIXES = {
  はこだてさん: 'はこだてやま', // 函館山
  しょくかん: 'しょっかん', // 食感
};

export const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const isKanaOrAscii = (s) => /^[ぁ-ゖァ-ヺー、。！？・「」\x20-\x7e]+$/.test(s);

// エンジンで最後まで打鍵可能か
export function isTypeable(reading) {
  try {
    const chunks = parseKana(normalizeReading(reading));
    return chunks.length > 0 && chunks.every((c) => c.candidates.length > 0);
  } catch {
    return false;
  }
}

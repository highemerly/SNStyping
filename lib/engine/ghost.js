// ゴースト(打鍵ログの録画・再生)。DOM には依存しない。
//
// 判定エンジンが決定的なので、キー入力の列(開始からのms + キー)を録るだけで
// ミスタイプや綴りの揺れも含めてプレイを完全に再現できる。
// お題は単語リストTSVの再生成で変わりうるため、参照ではなくファイルに埋め込む。
//
// .ghost.json 形式:
// {
//   "version": 1,
//   "engineVersion": 1,
//   "player": { "name": "せいべ" },
//   "recordedAt": "2026-07-18T12:34:56+09:00",
//   "rule": { "durationSec": 60 },
//   "words": [ { "display": "...", "reading": "..." }, ... ],
//   "keys": [ [120, "s"], [185, "e"], ... ],
//   "stats": { ... Game.result() の出力 ... }
// }

import { Game } from './game.js';

export const GHOST_VERSION = 1;
// 判定エンジンの互換バージョン。ローマ字テーブルや判定ロジックを
// 「過去に弾いたキーが受理されるようになる」方向に変えたらインクリメントする。
export const ENGINE_VERSION = 1;

// 録画からゴーストオブジェクトを作る
export function createGhost({ playerName, rule, words, keys, stats, recordedAt }) {
  return {
    version: GHOST_VERSION,
    engineVersion: ENGINE_VERSION,
    player: { name: playerName },
    recordedAt,
    // inputMode 省略時は 'romaji'(かな入力導入前のゴーストとの後方互換)
    rule: { durationSec: rule.durationSec, inputMode: rule.inputMode === 'kana' ? 'kana' : 'romaji' },
    words: words.map((w) => ({ display: w.display, reading: w.reading })),
    keys: keys.map(([t, k]) => [Math.round(t), k]),
    stats,
  };
}

// 構造の検証。問題なければ null、あればエラーメッセージを返す
export function validateGhost(g) {
  if (!g || typeof g !== 'object') return 'ゴーストファイルではありません';
  if (g.version !== GHOST_VERSION) return `未対応のバージョンです(version: ${g.version})`;
  if (typeof g.player?.name !== 'string') return 'プレイヤー名がありません';
  if (!(g.rule?.durationSec > 0)) return '制限時間が不正です(完走制のゴーストは使えなくなりました)';
  if (!Array.isArray(g.words) || g.words.length === 0) return 'お題がありません';
  for (const w of g.words) {
    if (typeof w?.display !== 'string' || typeof w?.reading !== 'string') return 'お題が不正です';
  }
  if (!Array.isArray(g.keys) || g.keys.length === 0) return '打鍵ログがありません';
  for (const k of g.keys) {
    if (!Array.isArray(k) || typeof k[0] !== 'number' || typeof k[1] !== 'string') return '打鍵ログが不正です';
  }
  if (typeof g.stats !== 'object' || g.stats === null) return '結果情報がありません';
  return null;
}

// ゴーストを再生する仮想プレイヤー。advanceTo(elapsedMs) で経過時間まで打鍵を進める。
export class GhostPlayer {
  constructor(ghost) {
    this.ghost = ghost;
    this.game = new Game(ghost.words, {
      durationSec: ghost.rule.durationSec,
      shuffle: false, // 録画時の順序をそのまま使う
      inputMode: ghost.rule.inputMode, // 省略時は Game 側で 'romaji' 扱い
    });
    this.game.start(0); // 時刻は「開始からのms」で扱う
    this.index = 0;
  }

  // elapsedMs 時点までのキーを投入する。戻り値: このステップでお題完了が起きたか
  advanceTo(elapsedMs) {
    let word = false;
    const keys = this.ghost.keys;
    while (this.index < keys.length && keys[this.index][0] <= elapsedMs) {
      const key = keys[this.index++][1];
      if (!this.game.running) break;
      if (this.game.type(key) === 'word') word = true;
    }
    return word;
  }

  get done() {
    return this.index >= this.ghost.keys.length;
  }

  // 対戦UI用の進捗(VersusGame の Progress と同形)
  progress(elapsedMs) {
    const g = this.game;
    const line = g.current;
    const typed = line?.typedKeys ?? '';
    const rest = line?.remainingText() ?? '';
    const sec = elapsedMs / 1000;
    return {
      score: g.stats.score,
      misses: g.stats.misses,
      kpm: sec > 1 ? Math.round((g.stats.hits * 60) / sec) : 0,
      completedWords: g.stats.completedWords,
      wordProgress: typed.length + rest.length > 0 ? typed.length / (typed.length + rest.length) : 0,
      typed,
      rest,
    };
  }
}

// 打鍵ログを最後まで再生し、記録された結果と一致するか確かめる。
// エンジンの変更でリプレイがずれた場合(engineVersion 不一致など)の検出用。
export function verifyGhost(ghost) {
  const p = new GhostPlayer(ghost);
  p.advanceTo(Infinity);
  const computed = p.game.stats;
  const s = ghost.stats;
  const ok =
    computed.score === s.score &&
    computed.misses === s.misses &&
    computed.completedWords === s.completedWords;
  return { ok, computed: { ...computed } };
}

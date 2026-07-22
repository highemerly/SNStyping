// ゲーム進行。DOM には依存しない。
// 制限時間内にどれだけ打てるか(スコアアタック)。お題はリストを循環する。

import { TypingLine } from './typing.js';
import { KanaTypingLine } from './kana.js';

export class Game {
  /**
   * @param {Array<{display: string, reading: string}>} words
   * @param {{ durationSec?: number, shuffle?: boolean, inputMode?: 'romaji'|'kana' }} options
   *   対戦では両者が同じ順序で打つ必要があるため shuffle: false でサーバー配布順を使う
   *   inputMode: 'kana' なら JISかな配列で判定する(既定は 'romaji')
   */
  constructor(words, options = {}) {
    this.durationSec = options.durationSec ?? 60;
    this.inputMode = options.inputMode === 'kana' ? 'kana' : 'romaji';
    this.words = (options.shuffle ?? true) ? shuffle(words) : [...words];
    this.wordIndex = 0;
    this.current = null;
    this.running = false;
    this.startTime = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      completedWords: 0,
      score: 0,
    };
  }

  start(now = performance.now()) {
    this.running = true;
    this.startTime = now;
    this.nextWord();
  }

  nextWord() {
    const w = this.words[this.wordIndex % this.words.length];
    this.wordIndex++;
    this.current =
      this.inputMode === 'kana'
        ? new KanaTypingLine(w.display, w.reading)
        : new TypingLine(w.display, w.reading);
  }

  // 戻り値: 'hit' | 'miss' | 'word' (お題完了)
  type(key) {
    if (!this.running || !this.current) return 'miss';
    const result = this.current.type(key);
    if (result === 'miss') {
      this.stats.misses++;
      return 'miss';
    }
    this.stats.hits++;
    this.stats.score += 10;
    if (result === 'complete') {
      this.stats.completedWords++;
      this.stats.score += 50;
      this.nextWord();
      return 'word';
    }
    return 'hit';
  }

  remainingSec(now = performance.now()) {
    const elapsed = (now - this.startTime) / 1000;
    return Math.max(0, this.durationSec - elapsed);
  }

  elapsedSec(now = performance.now()) {
    return (now - this.startTime) / 1000;
  }

  isTimeUp(now = performance.now()) {
    return this.remainingSec(now) <= 0;
  }

  finish() {
    this.running = false;
  }

  // 結果集計
  result(now = performance.now()) {
    const elapsed = Math.min((now - this.startTime) / 1000, this.durationSec);
    const total = this.stats.hits + this.stats.misses;
    return {
      score: this.stats.score,
      hits: this.stats.hits,
      misses: this.stats.misses,
      completedWords: this.stats.completedWords,
      kpm: elapsed > 0 ? Math.round((this.stats.hits * 60) / elapsed) : 0,
      accuracy: total > 0 ? Math.round((this.stats.hits / total) * 1000) / 10 : 100,
    };
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

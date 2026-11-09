// ゲーム進行。DOM には依存しない。お題はリストを循環する。
//   時間指定(mode: 'time')    : 制限時間内にどれだけ打てるか(スコアアタック)
//   ワード数指定(mode: 'words'): wordCount 個のお題を打ち切るまでの時間を競う。
//                               放置されても終わるよう、1語あたり SEC_PER_WORD_LIMIT 秒の上限を設ける

import { TypingLine } from './typing.js';
import { KanaTypingLine } from './kana.js';
import { timeLimitSec } from './rule.js';

export class Game {
  /**
   * @param {Array<{display: string, reading: string}>} words
   * @param {{ mode?: 'time'|'words', durationSec?: number, wordCount?: number, shuffle?: boolean, inputMode?: 'romaji'|'kana' }} options
   *   対戦では両者が同じ順序で打つ必要があるため shuffle: false でサーバー配布順を使う
   *   inputMode: 'kana' なら JISかな配列で判定する(既定は 'romaji')
   */
  constructor(words, options = {}) {
    /** @type {'time' | 'words'} */
    this.mode = options.mode === 'words' ? 'words' : 'time';
    this.wordCount = options.wordCount ?? 10;
    // 打ち切り時間。時間指定なら制限時間そのもの、ワード数指定なら上限時間
    this.durationSec = timeLimitSec({ mode: this.mode, durationSec: options.durationSec ?? 60, wordCount: this.wordCount });
    this.inputMode = options.inputMode === 'kana' ? 'kana' : 'romaji';
    this.words = (options.shuffle ?? true) ? shuffle(words) : [...words];
    this.wordIndex = 0;
    this.current = null;
    this.running = false;
    this.startTime = 0;
    this.endTime = null; // 終了した時刻(ワード数指定で打ち切ったとき・finish() したとき)
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
    this.endTime = null;
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
  // ワード数指定で最後のお題を打ち切ると、その場で終了する(running が false になる)。
  // now: 打鍵の時刻(ゴーストの再生では録画上の時刻を渡す)
  type(key, now = performance.now()) {
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
      if (this.isCleared()) {
        this.finish(now);
      } else {
        this.nextWord();
      }
      return 'word';
    }
    return 'hit';
  }

  // ワード数指定で指定数を打ち切ったか(時間指定では常に false)
  isCleared() {
    return this.mode === 'words' && this.stats.completedWords >= this.wordCount;
  }

  remainingSec(now = performance.now()) {
    return Math.max(0, this.durationSec - this.elapsedSec(now));
  }

  // 開始からの経過秒。終了後は終了時点で止まる(打ち切り時間で頭打ち)
  elapsedSec(now = performance.now()) {
    const end = this.endTime ?? now;
    return Math.min((end - this.startTime) / 1000, this.durationSec);
  }

  isTimeUp(now = performance.now()) {
    return this.remainingSec(now) <= 0;
  }

  finish(now = performance.now()) {
    if (this.running) this.endTime = now;
    this.running = false;
  }

  // 結果集計
  //   timeSec: かかった時間(秒・小数2桁)。ワード数指定のタイム。時間指定では制限時間になる
  //   cleared: ワード数指定で指定数を打ち切れたか
  result(now = performance.now()) {
    const elapsed = Math.max(this.elapsedSec(now), 0);
    const total = this.stats.hits + this.stats.misses;
    return {
      score: this.stats.score,
      hits: this.stats.hits,
      misses: this.stats.misses,
      completedWords: this.stats.completedWords,
      kpm: elapsed > 0 ? Math.round((this.stats.hits * 60) / elapsed) : 0,
      accuracy: total > 0 ? Math.round((this.stats.hits / total) * 1000) / 10 : 100,
      timeSec: Math.round(elapsed * 100) / 100,
      cleared: this.isCleared(),
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

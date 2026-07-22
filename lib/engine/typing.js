// 1つのお題(表示テキスト + ふりがな)に対する入力判定。
// 「n / nn」「shi / si」のような複数経路を positions の集合として並行追跡する。

import { parseKana } from './romaji.js';
import { alignDisplayReading, splitDisplay } from './align.js';

export class TypingLine {
  constructor(display, reading) {
    this.display = display;
    this.reading = reading;
    this.chunks = parseKana(reading);
    // 表示テキストと読みの対応(整列できない場合は null)
    this.pairs = alignDisplayReading(display, reading);
    this.reset();
  }

  reset() {
    // position = { ci: 現在チャンク番号, typed: そのチャンク内で打ち終えた文字列 }
    this.positions = [{ ci: 0, typed: '' }];
    this.typedKeys = '';
    this.done = this.chunks.length === 0;
  }

  // 1打鍵を判定する。戻り値: 'hit' | 'miss' | 'complete'
  type(key) {
    if (this.done) return 'complete';
    key = key.toLowerCase();

    const next = [];
    const seen = new Set();
    const push = (ci, typed) => {
      const id = ci + ':' + typed;
      if (!seen.has(id)) {
        seen.add(id);
        next.push({ ci, typed });
      }
    };

    for (const { ci, typed } of this.positions) {
      if (ci >= this.chunks.length) continue;
      for (const cand of this.chunks[ci].candidates) {
        if (cand.startsWith(typed) && cand[typed.length] === key) {
          const nt = typed + key;
          if (nt.length === cand.length) push(ci + 1, '');
          else push(ci, nt);
        }
      }
    }

    if (next.length === 0) return 'miss';

    this.positions = next;
    this.typedKeys += key;
    if (this.positions.some((p) => p.ci >= this.chunks.length)) {
      this.done = true;
      return 'complete';
    }
    return 'hit';
  }

  // 最も進んでいる入力経路(表示用)
  bestPosition() {
    let best = null;
    for (const p of this.positions) {
      if (!best || p.ci > best.ci || (p.ci === best.ci && p.typed.length > best.typed.length)) {
        best = p;
      }
    }
    return best;
  }

  // 残りの推奨ローマ字文字列
  remainingText() {
    if (this.done) return '';
    const best = this.bestPosition();
    if (!best) return '';
    let out = '';
    const chunk = this.chunks[best.ci];
    for (const cand of chunk.candidates) {
      if (cand.startsWith(best.typed)) {
        out += cand.slice(best.typed.length);
        break;
      }
    }
    for (let i = best.ci + 1; i < this.chunks.length; i++) {
      out += this.chunks[i].candidates[0];
    }
    return out;
  }

  // 全体の推奨ローマ字(お題表示用)
  fullText() {
    return this.chunks.map((c) => c.candidates[0]).join('');
  }

  // 読み(ふりがな)の進捗: 入力済みのかな数と、現在打っているチャンクのかな数
  readingProgress() {
    if (this.done) {
      return { consumed: this.reading.length, currentLen: 0 };
    }
    const best = this.bestPosition();
    const ci = best?.ci ?? 0;
    let consumed = 0;
    for (let i = 0; i < ci; i++) consumed += this.chunks[i].kana.length;
    return { consumed, currentLen: this.chunks[ci]?.kana.length ?? 0 };
  }

  // ふりがな・表示テキストそれぞれの 入力済み/現在/未入力 3分割(表示用)
  progressText() {
    const { consumed, currentLen } = this.readingProgress();
    const reading = {
      done: this.reading.slice(0, consumed),
      current: this.reading.slice(consumed, consumed + currentLen),
      rest: this.reading.slice(consumed + currentLen),
    };
    const display = this.pairs
      ? splitDisplay(this.pairs, consumed, currentLen)
      : { done: '', current: '', rest: this.display }; // 整列不能ならハイライトなし
    return { reading, display };
  }
}

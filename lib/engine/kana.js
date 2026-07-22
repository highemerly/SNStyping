// かな入力(JISかな配列)の判定。
// 物理キー位置(KeyboardEvent.code + Shift)を JISかな配列のかなに対応づける方式。
// OS のかな入力設定に依存せず、かな入力ユーザーの指の記憶(物理配列)と一致する。
//
// ローマ字入力と違い綴りの揺れが無く、各かなの打鍵列は一意に決まるので、
// TypingLine のような複数経路の並行追跡は不要で、単純な線形マッチで判定できる。
// 濁音・半濁音は「清音キー + 濁点/半濁点キー」の2打鍵(が = か + ゛)。

import { normalizeReading } from './romaji.js';
import { alignDisplayReading, splitDisplay } from './align.js';

// 濁点・半濁点(JISかなでは独立キー。表示用に全角の濁点/半濁点記号を使う)
export const DAKUTEN = '゛';
export const HANDAKUTEN = '゜';

// 物理キー(event.code)→ かな。Shift 版は該当キーのみ定義(それ以外は Shift でも同じ)。
const KANA_BASE = {
  Digit1: 'ぬ', Digit2: 'ふ', Digit3: 'あ', Digit4: 'う', Digit5: 'え',
  Digit6: 'お', Digit7: 'や', Digit8: 'ゆ', Digit9: 'よ', Digit0: 'わ',
  Minus: 'ほ', Equal: 'へ', IntlYen: 'ー',
  KeyQ: 'た', KeyW: 'て', KeyE: 'い', KeyR: 'す', KeyT: 'か',
  KeyY: 'ん', KeyU: 'な', KeyI: 'に', KeyO: 'ら', KeyP: 'せ',
  BracketLeft: DAKUTEN, BracketRight: HANDAKUTEN,
  KeyA: 'ち', KeyS: 'と', KeyD: 'し', KeyF: 'は', KeyG: 'き',
  KeyH: 'く', KeyJ: 'ま', KeyK: 'の', KeyL: 'り', Semicolon: 'れ', Quote: 'け',
  Backslash: 'む',
  KeyZ: 'つ', KeyX: 'さ', KeyC: 'そ', KeyV: 'ひ', KeyB: 'こ',
  KeyN: 'み', KeyM: 'も', Comma: 'ね', Period: 'る', Slash: 'め',
  IntlRo: 'ろ',
  Space: ' ',
};

const KANA_SHIFT = {
  Digit3: 'ぁ', Digit4: 'ぅ', Digit5: 'ぇ', Digit6: 'ぉ',
  Digit7: 'ゃ', Digit8: 'ゅ', Digit9: 'ょ', Digit0: 'を',
  KeyE: 'ぃ', KeyZ: 'っ',
  Comma: '、', Period: '。', Slash: '・',
};

// 物理キー(+Shift)を打鍵かなに変換。対応が無ければ null(無視するキー)。
export function codeToKana(code, shift) {
  if (shift && Object.prototype.hasOwnProperty.call(KANA_SHIFT, code)) return KANA_SHIFT[code];
  return Object.prototype.hasOwnProperty.call(KANA_BASE, code) ? KANA_BASE[code] : null;
}

// 清音かな → 濁音/半濁音の分解(前者=清音キー、後者=濁点/半濁点キー)
const VOICED = {
  が: 'か', ぎ: 'き', ぐ: 'く', げ: 'け', ご: 'こ',
  ざ: 'さ', じ: 'し', ず: 'す', ぜ: 'せ', ぞ: 'そ',
  だ: 'た', ぢ: 'ち', づ: 'つ', で: 'て', ど: 'と',
  ば: 'は', び: 'ひ', ぶ: 'ふ', べ: 'へ', ぼ: 'ほ',
  ゔ: 'う',
};
const SEMI_VOICED = {
  ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ',
};

// 1つの読みかなを打鍵かな列に分解する。が→[か,゛] / ぱ→[は,゜] / し→[し]
function decompose(ch) {
  if (VOICED[ch]) return [VOICED[ch], DAKUTEN];
  if (SEMI_VOICED[ch]) return [SEMI_VOICED[ch], HANDAKUTEN];
  return [ch];
}

// 読み(ふりがな)を { kana(読み1文字), keys(打鍵かな列) } の列に変換
export function readingToUnits(reading) {
  const norm = normalizeReading(reading);
  const units = [];
  for (const ch of norm) units.push({ kana: ch, keys: decompose(ch) });
  return units;
}

// TypingLine と同じインターフェースを持つ、かな入力用の1お題判定。
export class KanaTypingLine {
  constructor(display, reading) {
    this.display = display;
    this.reading = reading;
    this.units = readingToUnits(reading);
    this.pairs = alignDisplayReading(display, reading);
    this.reset();
  }

  reset() {
    this.ui = 0; // 現在の読みかな番号
    this.ki = 0; // その読みかな内で打ち終えた打鍵数
    this.typedKeys = '';
    this.done = this.units.length === 0;
  }

  // 1打鍵(打鍵かな)を判定する。戻り値: 'hit' | 'miss' | 'complete'
  type(kana) {
    if (this.done) return 'complete';
    const unit = this.units[this.ui];
    if (!unit) {
      this.done = true;
      return 'complete';
    }
    if (kana !== unit.keys[this.ki]) return 'miss';

    this.typedKeys += kana;
    this.ki++;
    if (this.ki >= unit.keys.length) {
      this.ui++;
      this.ki = 0;
    }
    if (this.ui >= this.units.length) {
      this.done = true;
      return 'complete';
    }
    return 'hit';
  }

  // 残りの打鍵かな列
  remainingText() {
    if (this.done) return '';
    let out = '';
    const unit = this.units[this.ui];
    if (unit) out += unit.keys.slice(this.ki).join('');
    for (let i = this.ui + 1; i < this.units.length; i++) {
      out += this.units[i].keys.join('');
    }
    return out;
  }

  // お題全体の打鍵かな列(ガイド表示用)
  fullText() {
    return this.units.map((u) => u.keys.join('')).join('');
  }

  // 読み(ふりがな)の進捗: 入力済みのかな数と、現在打っているかな数
  readingProgress() {
    if (this.done) {
      return { consumed: this.reading.length, currentLen: 0 };
    }
    let consumed = 0;
    for (let i = 0; i < this.ui; i++) consumed += this.units[i].kana.length;
    return { consumed, currentLen: this.units[this.ui]?.kana.length ?? 0 };
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
      : { done: '', current: '', rest: this.display };
    return { reading, display };
  }
}

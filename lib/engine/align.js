// 表示テキスト(漢字混じり)とふりがなの対応付け。
// 「写真を撮る」「しゃしんをとる」→ [写真=しゃしん, を=を, 撮=と, る=る] のようなペア列を作る。
// 表示テキスト中の「読みにそのまま現れる文字」(かな・記号・英数字)をアンカーにして、
// 漢字などの読み範囲を区切る。整列できない場合は null(ハイライトを諦めるだけで実害なし)。

import { normalizeReading } from './romaji.js';

// 正規化後に読みへそのまま現れうる文字(=アンカーにできる文字)か
function isLiteralChar(ch) {
  const n = normalizeReading(ch);
  return /^[ぁ-ゖー a-z0-9、。!！?？・「」\[\]\/,.-]$/i.test(n);
}

/**
 * @returns {Array<{d: string, r: string}> | null} d: 表示側の断片 / r: 対応する読みの断片
 */
export function alignDisplayReading(display, reading) {
  const norm = normalizeReading(reading);

  // 表示テキストをリテラル/非リテラル(漢字等)のランに分割
  const runs = [];
  for (const ch of display) {
    const literal = isLiteralChar(ch);
    const last = runs[runs.length - 1];
    if (last && last.literal === literal) last.text += ch;
    else runs.push({ text: ch, literal });
  }

  const pairs = [];
  let ri = 0; // 読み(正規化後)の現在位置
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.literal) {
      const target = normalizeReading(run.text);
      if (!norm.startsWith(target, ri)) return null;
      pairs.push({ d: run.text, r: reading.slice(ri, ri + target.length) });
      ri += target.length;
    } else {
      const next = runs[i + 1];
      if (!next) {
        // 末尾の漢字ラン: 残り全部
        pairs.push({ d: run.text, r: reading.slice(ri) });
        ri = norm.length;
        break;
      }
      // 次のリテラルランをアンカーに探す(漢字1文字 ≥ 読み1文字と仮定して最短位置から)
      const anchor = normalizeReading(next.text);
      const minLen = [...run.text].length;
      const idx = norm.indexOf(anchor, ri + minLen);
      if (idx < 0) return null;
      pairs.push({ d: run.text, r: reading.slice(ri, idx) });
      ri = idx;
    }
  }
  if (ri !== norm.length) return null;
  return pairs;
}

/**
 * 読みの進捗位置(consumed: 入力済みかな数, currentLen: 現在打っているチャンクのかな数)から、
 * 表示テキストを 入力済み/現在/未入力 の3分割にする。
 * 常に表示1文字単位で分割する。かな⇔かな のペアは正確に対応が取れるが、
 * 漢字ペアは文字ごとの読みを持っていないため、読みを文字数で均等按分した近似
 * (「東京」=とうきょう → 東=とうき, 京=ょう 扱い。ハイライトが数かなズレるだけで実害なし)。
 */
export function splitDisplay(pairs, consumed, currentLen) {
  let done = '';
  let current = '';
  let rest = '';
  let acc = 0;
  for (const p of pairs) {
    const start = acc;
    const rLen = [...p.r].length;
    acc += rLen;
    const dChars = [...p.d];
    for (let i = 0; i < dChars.length; i++) {
      const s = start + Math.round((i * rLen) / dChars.length);
      const e = start + Math.round(((i + 1) * rLen) / dChars.length);
      if (e <= consumed) done += dChars[i];
      else if (s >= consumed + currentLen) rest += dChars[i];
      else current += dChars[i];
    }
  }
  return { done, current, rest };
}

// 表示テキストとふりがなの整列のテスト: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignDisplayReading, splitDisplay } from '../lib/engine/align.js';
import { TypingLine } from '../lib/engine/typing.js';

test('かなアンカーで漢字の読み範囲を整列できる', () => {
  assert.deepEqual(alignDisplayReading('写真を撮る', 'しゃしんをとる'), [
    { d: '写真', r: 'しゃしん' },
    { d: 'を', r: 'を' },
    { d: '撮', r: 'と' },
    { d: 'る', r: 'る' },
  ]);
  assert.deepEqual(alignDisplayReading('抹茶ラテ', 'まっちゃらて'), [
    { d: '抹茶', r: 'まっちゃ' },
    { d: 'ラテ', r: 'らて' },
  ]);
  // 全部漢字は1ペア
  assert.deepEqual(alignDisplayReading('千載一遇', 'せんざいいちぐう'), [
    { d: '千載一遇', r: 'せんざいいちぐう' },
  ]);
  // 全部かなは1ペア(文字単位で分割可能)
  assert.deepEqual(alignDisplayReading('すもも', 'すもも'), [{ d: 'すもも', r: 'すもも' }]);
});

test('splitDisplay: 漢字も読みを按分して1文字単位で3分割', () => {
  const pairs = alignDisplayReading('写真を撮る', 'しゃしんをとる');
  // 「しゃし」まで入力済み、「ん」を打っている最中: 写=しゃ は入力済み扱い
  assert.deepEqual(splitDisplay(pairs, 3, 1), { done: '写', current: '真', rest: 'を撮る' });
  // 「しゃしんを」まで入力済み、「と」を打っている最中
  assert.deepEqual(splitDisplay(pairs, 5, 1), { done: '写真を', current: '撮', rest: 'る' });
});

test('splitDisplay: 連続する漢字列の内部でも1文字ずつ進む', () => {
  const pairs = alignDisplayReading('千載一遇', 'せんざいいちぐう');
  // 按分で 千=せん, 載=ざい, 一=いち, 遇=ぐう
  assert.deepEqual(splitDisplay(pairs, 0, 1), { done: '', current: '千', rest: '載一遇' });
  assert.deepEqual(splitDisplay(pairs, 2, 1), { done: '千', current: '載', rest: '一遇' });
  assert.deepEqual(splitDisplay(pairs, 4, 1), { done: '千載', current: '一', rest: '遇' });
  assert.deepEqual(splitDisplay(pairs, 8, 0), { done: '千載一遇', current: '', rest: '' });
});

test('TypingLine.progressText が入力に追従する', () => {
  const line = new TypingLine('写真を撮る', 'しゃしんをとる');
  for (const k of 'shashinwo') line.type(k);
  const p = line.progressText();
  assert.deepEqual(p.reading, { done: 'しゃしんを', current: 'と', rest: 'る' });
  assert.deepEqual(p.display, { done: '写真を', current: '撮', rest: 'る' });
  for (const k of 'toru') line.type(k);
  assert.equal(line.done, true);
  assert.deepEqual(line.progressText().reading, { done: 'しゃしんをとる', current: '', rest: '' });
});

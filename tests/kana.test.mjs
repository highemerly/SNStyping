// かな入力(JISかな配列)判定エンジンのテスト: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KanaTypingLine, codeToKana, readingToUnits } from '../lib/engine/kana.js';
import { Game } from '../lib/engine/game.js';
import { createGhost, verifyGhost } from '../lib/engine/ghost.js';

// 打鍵かなの並び(文字列)を1つずつ流し、結果を返す
function tryType(reading, strokes) {
  const line = new KanaTypingLine(reading, reading);
  for (const k of strokes) {
    if (line.type(k) === 'miss') return 'miss';
  }
  return line.done ? 'complete' : 'incomplete';
}

const ok = (reading, strokes) =>
  assert.equal(tryType(reading, strokes), 'complete', `${reading} <- ${strokes}`);
const ng = (reading, strokes) =>
  assert.equal(tryType(reading, strokes), 'miss', `${reading} <- ${strokes} should miss`);

test('清音: 各かなが1打鍵', () => {
  ok('しんや', 'しんや');
  ok('ちから', 'ちから');
  ok('さくら', 'さくら');
});

test('濁音・半濁音: 清音キー + 濁点/半濁点の2打鍵', () => {
  ok('しんぶん', 'しんふ゛ん'); // ぶ = ふ + ゛
  ok('がっこう', 'か゛っこう'); // が = か + ゛ / っ は1打鍵
  ok('ぱそこん', 'は゜そこん'); // ぱ = は + ゜
  ok('ぽてと', 'ほ゜てと');
  ok('ゔぁ', 'う゛ぁ'); // ゔ = う + ゛、ぁ は小書き1打鍵
  ng('がっこう', 'かっこう'); // 濁点を省くとミス
  ng('しんぶん', 'しんふん'); // 濁点抜けはミス
});

test('小書きかな・拗音: それぞれ1打鍵(Shift 側)', () => {
  ok('しゃしん', 'しゃしん'); // ゃ は1打鍵
  ok('ちょっと', 'ちょっと'); // ょ・っ とも1打鍵
  ok('うぃすきー', 'うぃすきー');
});

test('を・長音・記号', () => {
  ok('ほんをよむ', 'ほんをよむ');
  ok('コーヒー', 'こーひー'); // カタカナは正規化され、ー は1打鍵
  ok('あ、い。', 'あ、い。');
});

test('全角スペースは半角スペース打鍵に正規化', () => {
  ok('あ　い', 'あ い');
});

test('ガイド(打鍵かな列)表示', () => {
  assert.equal(new KanaTypingLine('学校', 'がっこう').fullText(), 'か゛っこう');
  assert.equal(new KanaTypingLine('新聞', 'しんぶん').fullText(), 'しんふ゛ん');
});

test('進捗途中の残り打鍵と読みハイライト', () => {
  const line = new KanaTypingLine('学校', 'がっこう');
  line.type('か'); // が の途中(濁点未入力)
  assert.equal(line.typedKeys, 'か');
  assert.equal(line.remainingText(), '゛っこう');
  const p = line.progressText();
  assert.equal(p.reading.current, 'が'); // まだ「が」を打っている
  line.type('゛'); // が 完成
  assert.equal(line.progressText().reading.done, 'が');
});

test('codeToKana: JISかな配列の主要キー', () => {
  assert.equal(codeToKana('KeyT', false), 'か');
  assert.equal(codeToKana('KeyD', false), 'し');
  assert.equal(codeToKana('BracketLeft', false), '゛');
  assert.equal(codeToKana('BracketRight', false), '゜');
  assert.equal(codeToKana('Digit7', true), 'ゃ'); // Shift+7
  assert.equal(codeToKana('Digit7', false), 'や');
  assert.equal(codeToKana('Digit0', true), 'を'); // Shift+0
  assert.equal(codeToKana('KeyZ', true), 'っ'); // Shift+z
  assert.equal(codeToKana('KeyZ', false), 'つ');
  assert.equal(codeToKana('IntlYen', false), 'ー');
  assert.equal(codeToKana('ShiftLeft', false), null); // 未対応キーは null
});

test('readingToUnits: 読みかな単位と打鍵列', () => {
  assert.deepEqual(readingToUnits('がっこう'), [
    { kana: 'が', keys: ['か', '゛'] },
    { kana: 'っ', keys: ['っ'] },
    { kana: 'こ', keys: ['こ'] },
    { kana: 'う', keys: ['う'] },
  ]);
});

test('Game(inputMode: kana)でお題を打ち切れる', () => {
  const g = new Game([{ display: '学校', reading: 'がっこう' }], {
    durationSec: 60,
    shuffle: false,
    inputMode: 'kana',
  });
  g.start(0);
  const results = [...'か゛っこう'].map((k) => g.type(k));
  assert.equal(results[results.length - 1], 'word'); // 最後の打鍵でお題完了
  assert.equal(g.stats.completedWords, 1);
  assert.equal(g.stats.misses, 0);
});

test('かな入力ゴーストの再生が一致する', () => {
  const words = [{ display: '新聞', reading: 'しんぶん' }];
  const g = new Game(words, { durationSec: 60, shuffle: false, inputMode: 'kana' });
  g.start(0);
  const keys = [];
  let t = 0;
  for (const k of 'しんふ゛ん') {
    t += 100;
    keys.push([t, k]);
    g.type(k);
  }
  const ghost = createGhost({
    playerName: 'テスト',
    rule: { durationSec: 60, inputMode: 'kana' },
    words: g.words,
    keys,
    stats: g.result(t),
    recordedAt: '2026-07-22T00:00:00+09:00',
  });
  assert.equal(ghost.rule.inputMode, 'kana');
  assert.equal(verifyGhost(ghost).ok, true);
});

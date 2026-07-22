// ゲーム進行のテスト: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../lib/engine/game.js';

const WORDS = [
  { display: 'かに', reading: 'かに' },
  { display: 'いぬ', reading: 'いぬ' },
];

function typeLine(game) {
  // 現在のお題を推奨綴りどおりに打ち切る
  const rest = game.current.remainingText();
  for (const key of rest) {
    const r = game.type(key);
    assert.notEqual(r, 'miss', `unexpected miss at ${key}`);
  }
}

test('お題は循環し、時間切れで終了する', () => {
  const g = new Game(WORDS, { durationSec: 60, shuffle: false });
  g.start(0);
  for (let i = 0; i < 5; i++) typeLine(g); // リスト2件を超えて循環
  assert.equal(g.stats.completedWords, 5);
  assert.equal(g.isTimeUp(59_000), false);
  assert.equal(g.isTimeUp(61_000), true);
});

test('スコアとミスの集計', () => {
  const g = new Game(WORDS, { durationSec: 60, shuffle: false });
  g.start(0);
  assert.equal(g.type('x'), 'miss'); // 「かに」に対して x はミス
  typeLine(g);
  // かに = ka+ni の4打鍵 → 4×10 + お題完了50
  assert.equal(g.stats.score, 90);
  assert.equal(g.stats.misses, 1);
  const r = g.result(60_000);
  assert.equal(r.score, 90);
  assert.equal(r.completedWords, 1);
  assert.equal(r.accuracy, 80); // 4 hit / 5 total
});

test('result は制限時間で頭打ちした経過時間で KPM を出す', () => {
  const g = new Game(WORDS, { durationSec: 30, shuffle: false });
  g.start(0);
  typeLine(g); // 4打鍵
  g.finish();
  const r = g.result(60_000); // 時間切れ後に呼ばれても 30秒 で計算
  assert.equal(r.kpm, Math.round((4 * 60) / 30));
});

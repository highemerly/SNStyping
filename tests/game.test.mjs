// ゲーム進行のテスト: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../lib/engine/game.js';
import { compareResults, parseRuleKeySuffix, ruleKeySuffix, sanitizeRule, timeLimitSec } from '../lib/engine/rule.js';

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
  g.finish(60_000); // 時間切れ後に終了しても 30秒 で計算
  const r = g.result(60_000);
  assert.equal(r.kpm, Math.round((4 * 60) / 30));
});

// 現在のお題を now の時刻に打ち切る(ワード数指定の終了時刻を確かめる用)
function typeLineAt(game, now) {
  for (const key of game.current.remainingText()) {
    assert.notEqual(game.type(key, now), 'miss');
  }
}

test('ワード数指定: 指定数を打ち切った時点で終了し、そのタイムを記録する', () => {
  const g = new Game(WORDS, { mode: 'words', wordCount: 3, shuffle: false });
  g.start(0);
  typeLineAt(g, 1_000);
  typeLineAt(g, 2_000);
  assert.equal(g.running, true);
  assert.equal(g.isCleared(), false);
  typeLineAt(g, 3_500); // 3語目(リストを循環して「かに」)
  assert.equal(g.running, false);
  assert.equal(g.isCleared(), true);
  assert.equal(g.type('k', 4_000), 'miss'); // 終了後の打鍵は数えない
  const r = g.result(10_000); // 後から呼んでも終了時点のタイム
  assert.equal(r.cleared, true);
  assert.equal(r.timeSec, 3.5);
  assert.equal(r.completedWords, 3);
  assert.equal(r.misses, 0);
  assert.equal(r.kpm, Math.round((r.hits * 60) / 3.5));
});

test('ワード数指定: 1語あたり30秒の上限で打ち切られる', () => {
  const g = new Game(WORDS, { mode: 'words', wordCount: 2, shuffle: false });
  g.start(0);
  assert.equal(g.durationSec, 60);
  typeLineAt(g, 1_000);
  assert.equal(g.isTimeUp(59_000), false);
  assert.equal(g.isTimeUp(60_000), true);
  g.finish(61_000);
  const r = g.result(61_000);
  assert.equal(r.cleared, false);
  assert.equal(r.timeSec, 60);
  assert.equal(r.completedWords, 1);
});

test('時間指定の result は cleared: false、timeSec は制限時間', () => {
  const g = new Game(WORDS, { durationSec: 30, shuffle: false });
  g.start(0);
  typeLine(g);
  const r = g.result(40_000);
  assert.equal(r.cleared, false);
  assert.equal(r.timeSec, 30);
});

test('sanitizeRule: 不正値は既定に補正し、mode 無しは時間指定として扱う', () => {
  assert.deepEqual(sanitizeRule({ durationSec: 30, wordListId: 'basic' }), {
    mode: 'time', durationSec: 30, wordCount: 10, wordListId: 'basic',
  });
  assert.deepEqual(sanitizeRule({ mode: 'words', wordCount: 20, wordListId: 'tech' }), {
    mode: 'words', durationSec: 60, wordCount: 20, wordListId: 'tech',
  });
  assert.deepEqual(sanitizeRule({ mode: 'x', durationSec: 9999, wordCount: 0, wordListId: '../a' }), {
    mode: 'time', durationSec: 60, wordCount: 10, wordListId: 'basic',
  });
  assert.deepEqual(sanitizeRule(null), { mode: 'time', durationSec: 60, wordCount: 10, wordListId: 'basic' });
  assert.equal(timeLimitSec(sanitizeRule({ mode: 'words', wordCount: 15 })), 450);
});

test('ruleKeySuffix と parseRuleKeySuffix は往復できる', () => {
  assert.equal(ruleKeySuffix({ mode: 'time', durationSec: 60, wordCount: 10 }), '60');
  assert.equal(ruleKeySuffix({ mode: 'words', durationSec: 60, wordCount: 10 }), 'w10');
  assert.deepEqual(parseRuleKeySuffix('60'), { mode: 'time', durationSec: 60 });
  assert.deepEqual(parseRuleKeySuffix('w10'), { mode: 'words', wordCount: 10 });
  assert.equal(parseRuleKeySuffix('abc'), null);
});

test('compareResults: 時間指定はスコア順、ワード数指定はクリア → タイム順', () => {
  const base = { score: 0, completedWords: 0, cleared: false, timeSec: 0 };
  const sortBy = (list, mode) => [...list].sort((a, b) => compareResults(a, b, mode)).map((x) => x.id);
  const list = [
    { ...base, id: 'slow', cleared: true, timeSec: 40, score: 900, completedWords: 10 },
    { ...base, id: 'fast', cleared: true, timeSec: 30, score: 800, completedWords: 10 },
    { ...base, id: 'dnf8', cleared: false, timeSec: 300, score: 950, completedWords: 8 },
    { ...base, id: 'dnf9', cleared: false, timeSec: 300, score: 700, completedWords: 9 },
  ];
  assert.deepEqual(sortBy(list, 'words'), ['fast', 'slow', 'dnf9', 'dnf8']);
  assert.deepEqual(sortBy(list, 'time'), ['dnf8', 'slow', 'fast', 'dnf9']);
  assert.equal(compareResults(list[0], { ...list[0] }, 'words'), 0);
});

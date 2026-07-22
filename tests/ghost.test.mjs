// ゴースト(録画・再生)のテスト: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../lib/engine/game.js';
import { createGhost, validateGhost, verifyGhost, GhostPlayer } from '../lib/engine/ghost.js';

const WORDS = [
  { display: '新幹線', reading: 'しんかんせん' },
  { display: '抹茶ラテ', reading: 'まっちゃらて' },
];
const DURATION_SEC = 30;

// お題を100ms間隔で2周ぶん打つ録画を作るヘルパー(missAt 番目のキーの前にわざとミス)
function record({ missAt = [] } = {}) {
  const game = new Game(WORDS, { durationSec: DURATION_SEC, shuffle: false });
  game.start(0);
  const keys = [];
  let t = 0;
  let n = 0;
  while (game.stats.completedWords < WORDS.length * 2) {
    const expected = game.current.remainingText()[0];
    n++;
    t += 100;
    if (missAt.includes(n)) {
      const wrong = expected === 'z' ? 'x' : 'z';
      keys.push([t, wrong]);
      game.type(wrong);
      t += 100;
    }
    keys.push([t, expected]);
    game.type(expected);
  }
  game.finish();
  const ghost = createGhost({
    playerName: 'テスト',
    rule: { durationSec: DURATION_SEC },
    words: WORDS,
    keys,
    stats: game.result(DURATION_SEC * 1000),
    recordedAt: '2026-07-18T00:00:00.000Z',
  });
  return { ghost, game };
}

test('録画を再生すると記録時と同じ結果になる(ミス込み)', () => {
  const { ghost, game } = record({ missAt: [3, 10] });
  assert.equal(game.stats.misses, 2);
  const p = new GhostPlayer(ghost);
  p.advanceTo(Infinity);
  assert.deepEqual(p.game.stats, game.stats);
  assert.equal(verifyGhost(ghost).ok, true);
});

test('細切れの advanceTo でも全量再生と同じ結果になる', () => {
  const { ghost, game } = record({ missAt: [5] });
  const p = new GhostPlayer(ghost);
  for (let t = 0; t <= DURATION_SEC * 1000; t += 33) p.advanceTo(t);
  assert.deepEqual(p.game.stats, game.stats);
  assert.equal(p.done, true);
});

test('advanceTo は経過時間までのキーだけを消費する', () => {
  const { ghost } = record();
  const p = new GhostPlayer(ghost);
  p.advanceTo(250); // 100ms間隔なので2打鍵ぶん
  assert.equal(p.game.stats.hits, 2);
  const prog = p.progress(250);
  assert.equal(prog.completedWords, 0);
  assert.ok(prog.typed.length > 0);
});

test('progress は対戦UI用の進捗を返す', () => {
  const { ghost } = record();
  const p = new GhostPlayer(ghost);
  p.advanceTo(Infinity);
  const prog = p.progress(10000);
  assert.equal(prog.completedWords, WORDS.length * 2);
  assert.equal(prog.misses, 0);
  assert.ok(prog.score > 0);
});

test('validateGhost: 正常なゴーストを受理し、壊れたものを弾く', () => {
  const { ghost } = record();
  assert.equal(validateGhost(ghost), null);
  assert.notEqual(validateGhost(null), null);
  assert.notEqual(validateGhost({}), null);
  assert.notEqual(validateGhost({ ...ghost, version: 99 }), null);
  assert.notEqual(validateGhost({ ...ghost, words: [] }), null);
  assert.notEqual(validateGhost({ ...ghost, keys: [[1, 2]] }), null);
  // 旧・完走制ゴースト(durationSec なし)は弾く
  assert.notEqual(validateGhost({ ...ghost, rule: { mode: 'race', durationSec: null } }), null);
});

test('verifyGhost: 改ざんされた結果を検出する', () => {
  const { ghost } = record();
  const tampered = { ...ghost, stats: { ...ghost.stats, score: ghost.stats.score + 100 } };
  assert.equal(verifyGhost(tampered).ok, false);
});

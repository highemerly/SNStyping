// ローマ字判定エンジンのテスト: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TypingLine } from '../lib/engine/typing.js';
import { setRomajiStyle } from '../lib/engine/romaji.js';

// input を1打鍵ずつ流し、全打鍵ヒットで完了するかを返す
function tryType(reading, input) {
  const line = new TypingLine(reading, reading);
  for (const key of input) {
    const r = line.type(key);
    if (r === 'miss') return 'miss';
  }
  return line.done ? 'complete' : 'incomplete';
}

const ok = (reading, input) =>
  assert.equal(tryType(reading, input), 'complete', `${reading} <- ${input}`);
const ng = (reading, input) =>
  assert.equal(tryType(reading, input), 'miss', `${reading} <- ${input} should miss`);

test('基本のかな(ヘボン式・訓令式両対応)', () => {
  ok('しんぶん', 'shinbunn');
  ok('しんぶん', 'sinbunn');
  ok('つち', 'tsuchi');
  ok('つち', 'tuti');
  ok('ふじさん', 'fujisann');
  ok('ふじさん', 'huzisann');
});

test('拗音: 一体入力と分解入力', () => {
  ok('しゃしん', 'shashinn');
  ok('しゃしん', 'syasinn');
  ok('しゃしん', 'shixyasinn');
  ok('じゃんけん', 'jankenn');
  ok('じゃんけん', 'zyankenn');
  ok('ちょきん', 'chokinn');
  ok('ちょきん', 'tyokinn');
});

test('促音: 子音重ねと xtu 系', () => {
  ok('がっこう', 'gakkou');
  ok('がっこう', 'gaxtukou');
  ok('がっこう', 'galtukou');
  ok('ちょっと', 'chotto');
  ok('ちょっと', 'tyotto');
  ok('ちょっと', 'choxtsuto');
  ok('まっちゃ', 'maccha');
  ok('まっちゃ', 'mattya');
  ng('まっちゃ', 'mactya'); // 重ね子音と次の綴りの不一致は拒否
});

test('撥音: n / nn / n\' の使い分け', () => {
  ok('かんじ', 'kanji');
  ok('かんじ', 'kanzi');
  ok('かんじ', 'kannji');
  ng('かんい', 'kani'); // 母音の前は単独 n 不可(かに になってしまう)
  ok('かんい', 'kanni');
  ok('かんい', "kan'i");
  ng('ほんや', 'honya'); // や行の前も単独 n 不可(ほにゃ)
  ok('ほんや', 'honnya');
  ok('おんな', 'onnna');
  ng('おんな', 'onna'); // な行の前も単独 n 不可
});

test('語末の ん は nn が必要', () => {
  ok('ほん', 'honn');
  assert.equal(tryType('ほん', 'hon'), 'incomplete');
});

test('カタカナ・長音の正規化', () => {
  ok('コーヒー', 'ko-hi-');
  ok('サーバー', 'sa-ba-');
  ok('ヴァイオリン', 'vaiorinn');
});

test('外来語系の音', () => {
  ok('ふぁいる', 'fairu');
  ok('ふぁいる', 'fuxairu');
  ng('ふぁいる', 'fuairu'); // ふあ とは区別する
  ok('うぃすきー', 'wisuki-');
  ok('ぱーてぃー', 'pa-thi-');
});

test('スペースを含むお題', () => {
  ok('たいへん べんり', 'taihenn benri');
  ng('たいへん べんり', 'taihennbenri'); // スペースの打鍵は省略できない
  ok('あ　い', 'a i'); // 全角スペースも半角スペース打鍵に正規化
});

test('複合ケース', () => {
  ok('とっきゅうれっしゃ', 'tokkyuuressha');
  ok('とっきゅうれっしゃ', 'toxtukyuuresshixya');
  ok('ひゃくにんいっしゅ', "hyakunin'isshu");
  ok('ぎゅうにゅう', 'gyuunyuu');
});

test('表示スタイル: 訓令式優先はガイドの綴りだけ変え、入力受理は変えない', () => {
  try {
    setRomajiStyle('kunrei');
    assert.equal(new TypingLine('しゃしん', 'しゃしん').fullText(), 'syasinn');
    assert.equal(new TypingLine('ちょっと', 'ちょっと').fullText(), 'tyotto');
    assert.equal(new TypingLine('ふじさん', 'ふじさん').fullText(), 'huzisann');
    // どちらの綴りも引き続き受理される
    ok('しゃしん', 'shashinn');
    ok('しゃしん', 'syasinn');

    setRomajiStyle('hepburn');
    assert.equal(new TypingLine('しゃしん', 'しゃしん').fullText(), 'shashinn');
    assert.equal(new TypingLine('ふじさん', 'ふじさん').fullText(), 'fujisann');
  } finally {
    setRomajiStyle('hepburn');
  }
});

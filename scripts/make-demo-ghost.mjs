// デモゴースト(snstyping-dict/ghosts/demo*.ghost.json)の生成スクリプト。
// 基本辞書(words/basic@<version>.tsv)のお題(同一順序)を60秒間、
// 一定ペース+時々ミスで打つ合成打鍵ログ。
// 全く同じお題で速度だけ違う3段階を作る(実プレイの録画が無くても対戦を試せる)。
//
//   node scripts/make-demo-ghost.mjs [snstyping-dictリポジトリのパス]
//
// 既定の入出力先は ../snstyping-dict(words/basic.tsv を読み、ghosts/ に書く)。
// 書き出したら snstyping-dict 側でコミット・PRする(カタログはActionsが自動生成)。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../lib/engine/game.js';
import { parseWordList } from '../lib/engine/words.js';
import { createGhost } from '../lib/engine/ghost.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICT_ROOT = path.resolve(process.argv[2] ?? path.join(ROOT, '..', 'snstyping-dict'));

const DURATION_SEC = 60;
const MISS_EVERY = 25; // このキー数ごとに1回わざとミスする

// 速度違いの3段階(intervalMs = 1打鍵の平均間隔)。title/order はカタログ用
const VARIANTS = [
  { file: 'demo-slow.ghost.json', name: 'デモ ゆっくり', order: 10, intervalMs: 330 },
  { file: 'demo.ghost.json', name: 'デモ ふつう', order: 20, intervalMs: 220 },
  { file: 'demo-fast.ghost.json', name: 'デモ はやい', order: 30, intervalMs: 140 },
];

// 基本辞書はバージョン付きファイル名(basic@YYYYMMDDHHMM.tsv)のこともある
const wordsDir = path.join(DICT_ROOT, 'words');
const basicFile = fs.readdirSync(wordsDir).find((f) => /^basic(@\d{12,14})?\.tsv$/.test(f));
if (!basicFile) {
  console.error(`基本辞書(basic*.tsv)が見つかりません: ${wordsDir}`);
  process.exit(1);
}
const tsv = fs.readFileSync(path.join(wordsDir, basicFile), 'utf8');
const words = parseWordList(tsv);
console.log(`辞書: ${basicFile}(${words.length}語)`);

for (const v of VARIANTS) {
  const game = new Game(words, { durationSec: DURATION_SEC, shuffle: false });
  game.start(0);

  const keys = [];
  let t = 0;
  let n = 0;
  while (true) {
    const expected = game.current.remainingText()[0];
    n++;
    // 決定的なゆらぎ(乱数を使わず毎回同じログになる)
    t += v.intervalMs + ((n * 37) % 80) - 40;
    if (t > DURATION_SEC * 1000) break;
    if (n % MISS_EVERY === 0) {
      const wrong = expected === 'z' ? 'x' : 'z';
      keys.push([t, wrong]);
      game.type(wrong);
      t += v.intervalMs;
      if (t > DURATION_SEC * 1000) break;
    }
    keys.push([t, expected]);
    game.type(expected);
  }
  game.finish();

  const ghost = createGhost({
    playerName: v.name,
    rule: { durationSec: DURATION_SEC },
    words: game.words,
    keys,
    stats: game.result(DURATION_SEC * 1000),
    recordedAt: new Date().toISOString(),
  });
  // カタログ用メタデータ(snstyping-dict の build-catalog.mjs が参照)
  ghost.title = `${v.name}(KPM ${ghost.stats.kpm})`;
  ghost.order = v.order;

  const out = path.join(DICT_ROOT, 'ghosts', v.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(ghost) + '\n');
  console.log(
    `生成: ${out}(${DURATION_SEC}秒, ${keys.length}打鍵, スコア${ghost.stats.score}, KPM${ghost.stats.kpm}, ミス${ghost.stats.misses}回)`,
  );
}

// SNS(Mastodon)の投稿から単語リストTSVを生成するスクリプト。
//
//   node scripts/fetch-sns-words.mjs @highemerly@handon.club
//   node scripts/fetch-sns-words.mjs @highemerly@handon.club --pr          # 生成してそのままPR作成
//   node scripts/fetch-sns-words.mjs @seibe@handon.club --count 50 --title "せいべ" --out ../snstyping-dict/words
//
// ⚠ 投稿の利用は必ず本人の許諾を得てから。
//
// やること:
//   1. Mastodon API で公開投稿を取得(リプライ・ブースト・CW付きは除外)
//   2. HTML除去・URL/メンション/ハッシュタグ/絵文字/記号のクリーニング
//   3. kuromoji で形態素解析してふりがな(ひらがな)を生成
//   4. 全エントリを lib/engine/romaji.js に通して打鍵可能なことを検証
//   5. <出力先>/@user@server.tsv に書き出し(同アカウントの既存ファイルは上書き)
//   6. --pr 指定時: snstyping-dict 側でブランチ作成 → コミット → push → gh でPR作成
//
// 取得・整形・ふりがな生成の中核は lib/sns/pipeline.js(Web版と共有)。
// 出力先は snstyping-dict リポジトリの words/(既定: ../snstyping-dict/words)。
// カタログはあちら側の GitHub Actions が生成するので、TSVをコミット・PRするだけでよい。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_COUNT,
  lookupAccount,
  fetchStatuses,
  getTokenizer,
  statusesToEntries,
} from '../lib/sns/pipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(ROOT, '..', 'snstyping-dict', 'words');

// ---- 引数 ----
const args = process.argv.slice(2);
const acctArg = args.find((a) => a.startsWith('@'));
if (!acctArg || acctArg.split('@').length !== 3) {
  console.error('使い方: node scripts/fetch-sns-words.mjs @ユーザー名@サーバー [--count 50] [--title 表示名] [--out 出力先] [--pr]');
  process.exit(1);
}
const [, username, server] = acctArg.split('@');
const count = Number(args[args.indexOf('--count') + 1] || 0) || DEFAULT_COUNT;
const titleArg = args.includes('--title') ? args[args.indexOf('--title') + 1] : null;
const makePr = args.includes('--pr');
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : DEFAULT_OUT_DIR);
if (!fs.existsSync(outDir)) {
  console.error(`出力先がありません: ${outDir}(snstyping-dict リポジトリを clone するか --out で指定してください)`);
  process.exit(1);
}

// ---- PR作成(--pr)の下準備。書き出す前に前提を確認して早めに失敗させる ----
function git(cwd, ...a) {
  return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();
}

let dictRoot = null;
if (makePr) {
  try {
    dictRoot = git(outDir, 'rev-parse', '--show-toplevel');
  } catch {
    console.error(`--pr: 出力先が git リポジトリではありません: ${outDir}`);
    process.exit(1);
  }
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  } catch {
    console.error('--pr: gh CLI が使えません(gh auth login を実行してください)');
    process.exit(1);
  }
  // words/ に未コミットの変更が残っていると別件を巻き込むので中断
  if (git(dictRoot, 'status', '--porcelain', '--', 'words') !== '') {
    console.error(`--pr: ${dictRoot}/words に未コミットの変更があります。先に片付けてください`);
    process.exit(1);
  }
}

// ブランチ名用のスラッグ(カタログのidはファイル名から導出されるため別物)
function makeSlug(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return slug || 'sns';
}

// ---- メイン ----
const account = await lookupAccount(server, username);
console.log(`アカウント: ${account.display_name} (@${account.acct}, id=${account.id})`);

const statuses = await fetchStatuses(server, account.id, count);
console.log(`取得: ${statuses.length}件(リプライ・ブースト除く)`);

const tokenizer = await getTokenizer(path.join(ROOT, 'node_modules', 'kuromoji', 'dict'));
const { entries, skipped, dropped } = statusesToEntries(tokenizer, statuses);
for (const d of dropped) console.warn(`  打鍵不能のため除外: ${d.display} | ${d.reading}`);

if (entries.length === 0) {
  console.error('使えるエントリが0件でした。中断します。');
  process.exit(1);
}

// ---- 書き出し ----
// ファイル名 = id(@user@server)。バージョンは中身のハッシュで snstyping-dict 側が管理するため、
// ファイル名にタイムスタンプは付けない。更新は同じファイルの上書き。
const filename = `@${username}@${server}.tsv`;
const title = `${titleArg ?? account.display_name} @${username}`;

// --pr: 最新の main から作業ブランチを切ってから書き出す
const ts = `${Date.now()}`;
const branch = `words-${makeSlug(username)}-${ts}`;
if (makePr) {
  git(dictRoot, 'fetch', '-q', 'origin', 'main');
  git(dictRoot, 'checkout', '-q', '-B', branch, 'origin/main');
}

// 旧スキーム(タイムスタンプ付き)のファイルが残っていたら掃除する
for (const f of fs.readdirSync(outDir)) {
  if (f.startsWith(`@${username}@${server}@`) && f.endsWith('.tsv')) {
    fs.unlinkSync(path.join(outDir, f));
    console.log(`旧スキームのファイルを削除: ${f}`);
  }
}

const header = [
  `# title: ${title}`,
  // カテゴリはサーバー名。新しいサーバーを使う場合は snstyping-dict 側の
  // scripts/lib.mjs CATEGORIES への追加が必要(Validateが弾く)
  `# category: ${server}`,
  `# @${username}@${server} の投稿より(本人許諾済み)`,
  '# 形式: 表示テキスト<TAB>ふりがな(ひらがな)',
].join('\n');
const body = entries.map((e) => `${e.display}\t${e.reading}`).join('\n');
fs.writeFileSync(path.join(outDir, filename), `${header}\n${body}\n`);

console.log(`\n生成: ${path.join(outDir, filename)}(${entries.length}エントリ)`);
console.log(`除外: CW ${skipped.cw} / 空 ${skipped.empty} / 読み不能 ${skipped.unreadable} / 長さ ${skipped.length} / 重複 ${skipped.dup} / 打鍵不能 ${skipped.untypeable}`);

if (!makePr) {
  console.log('snstyping-dict 側でコミットしてPRを作成してください(カタログはActionsが自動生成)。--pr を付けるとここまで自動でやります');
  process.exit(0);
}

// ---- PR作成 ----
git(dictRoot, 'add', '-A', '--', 'words');
if (git(dictRoot, 'status', '--porcelain', '--', 'words') === '') {
  console.log('差分がありません(前回生成と同一)。PRは作成しません');
  git(dictRoot, 'checkout', '-q', 'main');
  process.exit(0);
}
git(dictRoot, 'commit', '-q', '-m', `単語リスト更新: ${title}(${entries.length}エントリ)`);
git(dictRoot, 'push', '-q', '-u', 'origin', branch);
const prBody = [
  `\`scripts/fetch-sns-words.mjs\` による自動生成(@${username}@${server} の最新${statuses.length}投稿より、本人許諾済み)。`,
  '',
  `- エントリ: ${entries.length}件`,
  `- 除外: CW ${skipped.cw} / 空 ${skipped.empty} / 読み不能 ${skipped.unreadable} / 長さ ${skipped.length} / 重複 ${skipped.dup} / 打鍵不能 ${skipped.untypeable}`,
  '- 全エントリは判定エンジンで打鍵可能なことを検証済み。ふりがなは kuromoji 生成のため、マージ前に誤読がないか目視確認を推奨',
].join('\n');
const prUrl = execFileSync(
  'gh',
  ['pr', 'create', '--title', `単語リスト更新: ${title}`, '--body', prBody],
  { cwd: dictRoot, encoding: 'utf8' },
).trim().split('\n').at(-1);
git(dictRoot, 'checkout', '-q', 'main');
console.log(`\nPRを作成しました: ${prUrl}`);
console.log('マージするとActionsがカタログを再生成し、数分〜10分程度でアプリに反映されます');

// 辞書(単語リストTSV)とゴーストの配信元。
// 実体は独立リポジトリ github.com/highemerly/snstyping-dict にあり、
// GitHub Pages で配信される words.json / ghosts.json を実行時に取得して選択肢を組み立てる。
// 辞書の追加・更新は snstyping-dict へのPRだけで済み、本体のデプロイは不要。

export const DICT_BASE_URL = (
  process.env.NEXT_PUBLIC_DICT_BASE_URL || 'https://highemerly.github.io/snstyping-dict/'
).replace(/\/*$/, '/');

// カタログ読み込み中の初期値
export const EMPTY_CATALOG = { words: [], ghosts: [] };

// 辞書カタログ(words.json)が取れないときの最小フォールバック。配信元が落ちていれば
// TSV取得も失敗するはずなので、実際のお題は loadWordList 側の FALLBACK_WORDS になる。
const FALLBACK_WORDS = [{ id: 'basic', title: '基本', category: '一般', version: null, file: 'basic.tsv', entries: 0 }];

let cached = null;

async function fetchJson(name) {
  const res = await fetch(`${DICT_BASE_URL}${name}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 辞書(words.json)とゴースト(ghosts.json)を並行取得してマージする。
// 辞書は必須(失敗時フォールバック)、ゴーストは任意(失敗時は空で続行)。
export async function fetchCatalog() {
  if (cached) return cached;
  let wordsOk = true;
  const [words, ghosts] = await Promise.all([
    fetchJson('words.json')
      .then((c) => {
        if (!Array.isArray(c.words) || c.words.length === 0) throw new Error('empty words catalog');
        return c.words;
      })
      .catch((err) => {
        wordsOk = false;
        console.warn('辞書カタログの読み込みに失敗、内蔵フォールバックを使用します:', err);
        return FALLBACK_WORDS;
      }),
    fetchJson('ghosts.json')
      .then((c) => (Array.isArray(c.ghosts) ? c.ghosts : []))
      .catch((err) => {
        console.warn('ゴーストカタログの読み込みに失敗、ゴースト無しで続行します:', err);
        return [];
      }),
  ]);
  const catalog = { words, ghosts };
  if (wordsOk) cached = catalog; // フォールバック時はキャッシュせず次回リトライ
  return catalog;
}

// version(内容ハッシュ)を ?v= に付けてCDN/ブラウザキャッシュを版ごとに分離する。
// これで catalog は新版なのに TSV は古いキャッシュ、というズレを防ぐ。
export function wordListUrl(file, version) {
  const q = version ? `?v=${encodeURIComponent(version)}` : '';
  return `${DICT_BASE_URL}words/${encodeURIComponent(file)}${q}`;
}

export function ghostUrl(file) {
  return `${DICT_BASE_URL}ghosts/${encodeURIComponent(file)}`;
}

// id で引く。無ければ先頭(カタログ未着ならnull)
export function findWordList(catalog, id) {
  return catalog.words.find((l) => l.id === id) ?? catalog.words[0] ?? null;
}

// カタログ順(カテゴリ順→id順で配信される)を保ったままカテゴリごとにまとめる
export function groupWordsByCategory(catalog) {
  const groups = [];
  for (const list of catalog.words) {
    const category = list.category ?? '一般';
    const last = groups[groups.length - 1];
    if (last && last.category === category) last.lists.push(list);
    else groups.push({ category, lists: [list] });
  }
  return groups;
}

export function findGhost(catalog, id) {
  return catalog.ghosts.find((g) => g.id === id) ?? null;
}

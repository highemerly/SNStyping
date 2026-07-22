// 単語リストの読み込みとパース。
// 形式: 1行 = 「表示テキスト <TAB> ふりがな(ひらがな)」。# 始まりはコメント。

export function parseWordList(text) {
  const words = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [display, reading] = line.split('\t');
    if (!display || !reading) continue;
    words.push({ display: display.trim(), reading: reading.trim() });
  }
  return words;
}

// file:// 直開きなど fetch が使えない環境向けのフォールバック
export const FALLBACK_WORDS = [
  { display: '今日はいい天気です', reading: 'きょうはいいてんきです' },
  { display: 'タイピングゲーム', reading: 'たいぴんぐげーむ' },
  { display: '学校に行く', reading: 'がっこうにいく' },
  { display: '新幹線', reading: 'しんかんせん' },
  { display: 'プログラミング', reading: 'ぷろぐらみんぐ' },
  { display: 'お疲れ様でした', reading: 'おつかれさまでした' },
  { display: '抹茶ラテ', reading: 'まっちゃらて' },
  { display: 'インターネット', reading: 'いんたーねっと' },
  { display: 'ちょっと待って', reading: 'ちょっとまって' },
  { display: '面白い本を読んだ', reading: 'おもしろいほんをよんだ' },
];

export async function loadWordList(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const words = parseWordList(await res.text());
    if (words.length === 0) throw new Error('empty word list');
    return { words, source: url };
  } catch (err) {
    console.warn(`単語リスト ${url} の読み込みに失敗、内蔵リストを使用します:`, err);
    return { words: FALLBACK_WORDS, source: 'builtin' };
  }
}

// Mastodon 投稿 → 打鍵可能な単語エントリ を生成する共有パイプライン。
// CLI(scripts/fetch-sns-words.mjs)と Web の投稿フロー(app/api/contribute/*)の
// 両方から使う。ここには「取得・クリーニング・ふりがな生成・打鍵可否判定」だけを置き、
// ファイル書き出しや git/PR、本人確認は呼び出し側の責務とする。

import kuromoji from 'kuromoji';
import { KANA_FIXES, READING_FIXES, kataToHira, isKanaOrAscii, isTypeable } from './reading-core.js';

// 後方互換: これらは以前 pipeline から直接 export されていた(CLI・dict.ts 等が参照)。
export { KANA_FIXES, READING_FIXES, isTypeable };

// ---- 調整パラメータ ----
export const DEFAULT_COUNT = 50;
export const MIN_READING_LEN = 5; // 読みがこれ未満のエントリは除外
export const MAX_READING_LEN = 80; // 読みがこれ超のエントリは除外
const PAGE_LIMIT = 40; // Mastodon API の1ページ上限

// ---- Mastodon API ----
export async function mastodonApi(host, pathname, params = {}) {
  const url = new URL(`https://${host}${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'User-Agent': 'snstyping-wordlist-generator' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export function lookupAccount(host, username) {
  return mastodonApi(host, '/api/v1/accounts/lookup', { acct: username });
}

export async function fetchStatuses(host, accountId, want) {
  const statuses = [];
  let maxId = null;
  while (statuses.length < want) {
    const params = { exclude_replies: 'true', exclude_reblogs: 'true', limit: String(PAGE_LIMIT) };
    if (maxId) params.max_id = maxId;
    const page = await mastodonApi(host, `/api/v1/accounts/${accountId}/statuses`, params);
    if (page.length === 0) break; // これ以上投稿がない
    statuses.push(...page);
    maxId = page[page.length - 1].id;
  }
  return statuses.slice(0, want);
}

// ---- HTML → プレーンテキスト ----
export function htmlToText(html) {
  return html
    .replace(/<a\b[^>]*>.*?<\/a>/gs, '') // アンカーごと除去(URL・メンション・ハッシュタグ)
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

// ---- 文字の寄せ変換(タイプできない特殊文字 → 打てる等価物)----
// 消してしまう前に、キーボードで打てる字へ寄せて拾えるようにする。
// NFKCで賄えない「意味的な寄せ」だけをここに明示する(下記 normalizeChars 参照)。
const NORMALIZE_MAP = {
  // ダッシュ・波ダッシュ類 → 長音符(ー)。ASCII の '-' はそのまま打てるので触らない。
  '‐': 'ー', '‑': 'ー', '‒': 'ー', '–': 'ー', '—': 'ー', '―': 'ー', '−': 'ー', '〜': 'ー', '～': 'ー',
  // 各種括弧 → 「」(エンジンは [ ] で打鍵)
  '【': '「', '】': '」', '〈': '「', '〉': '」', '《': '「', '》': '」', '『': '「', '』': '」',
  '〔': '「', '〕': '」', '〖': '「', '〗': '」', '〘': '「', '〙': '」', '｟': '「', '｠': '」',
  // 引用符 → ASCII のクオート
  '‘': "'", '’': "'", '‛': "'", '“': '"', '”': '"', '‟': '"',
  // 丸括弧つき漢数字(NFKCだと「(一)」になってしまう)→ 算用数字
  '㈠': '1', '㈡': '2', '㈢': '3', '㈣': '4', '㈤': '5', '㈥': '6', '㈦': '7', '㈧': '8', '㈨': '9',
  // 記号 → 読み(かな)
  '♡': 'ハート', '♥': 'ハート', '❤': 'ハート',
  '★': 'ほし', '☆': 'ほし',
  '♪': 'おんぷ', '♫': 'おんぷ', '♬': 'おんぷ', '♩': 'おんぷ',
  '〇': 'まる', '○': 'まる', '◯': 'まる', '●': 'まる', // ○○さん→まるまるさん
  '△': 'さんかく', '▲': 'さんかく', '□': 'しかく', '■': 'しかく', // ×は「かける」と衝突するので除外
  '〄': 'じす', '〆': 'しめ',
  '〒': '郵便', '〠': '郵便', '〶': '郵便',
  '℡': 'でんわ',
  // ギリシャ文字(大文字・小文字とも読みへ)
  'Α': 'あるふぁ', 'α': 'あるふぁ', 'Β': 'べーた', 'β': 'べーた',
  'Γ': 'がんま', 'γ': 'がんま', 'Δ': 'でるた', 'δ': 'でるた',
  'Ε': 'いぷしろん', 'ε': 'いぷしろん', 'Ζ': 'ぜーた', 'ζ': 'ぜーた',
  'Η': 'いーた', 'η': 'いーた', 'Θ': 'しーた', 'θ': 'しーた',
  'Ι': 'いおた', 'ι': 'いおた', 'Κ': 'かっぱ', 'κ': 'かっぱ',
  'Λ': 'らむだ', 'λ': 'らむだ', 'Μ': 'みゅー', 'μ': 'みゅー',
  'Ν': 'にゅー', 'ν': 'にゅー', 'Ξ': 'ぐざい', 'ξ': 'ぐざい',
  'Ο': 'おみくろん', 'ο': 'おみくろん', 'Π': 'ぱい', 'π': 'ぱい',
  'Ρ': 'ろー', 'ρ': 'ろー', 'Σ': 'しぐま', 'σ': 'しぐま', 'ς': 'しぐま',
  'Τ': 'たう', 'τ': 'たう', 'Υ': 'うぷしろん', 'υ': 'うぷしろん',
  'Φ': 'ふぁい', 'φ': 'ふぁい', 'Χ': 'かい', 'χ': 'かい',
  'Ψ': 'ぷさい', 'ψ': 'ぷさい', 'Ω': 'おめが', 'ω': 'おめが',
  // NFKCでギリシャ文字に化ける互換記号(マップはNFKCより前に走るので、ここで先に拾う)
  'µ': 'みゅー', // µ 微小記号 → μ
  'Ω': 'おめが', // Ω オーム記号 → Ω
};
const NORMALIZE_RE = new RegExp(`[${Object.keys(NORMALIZE_MAP).join('')}]`, 'gu');

// 明示マップ → 異体字セレクタ除去 → NFKC の順で寄せる。
// ㈠系はNFKCより先に潰す必要があるので、明示マップを先に適用する。
// NFKCが吸収してくれるもの: 全角英数(Ａ→A)・数学英字(𝐀𝑨𝔸→A)・丸数字(①→1)・
//   半角カナ(ｱ→ア)・元号合字(㍻→平成)・‼→!!・…→...・･→・ など。
export function normalizeChars(text) {
  return text
    .replace(NORMALIZE_RE, (c) => NORMALIZE_MAP[c])
    .replace(/[\uFE00-\uFE0F]/g, '') // 異体字セレクタ(♥︎→♥ 等)を除去
    .normalize('NFKC');
}

// ---- クリーニング ----
export function clean(text) {
  return (
    normalizeChars(text)
      .replace(/:[a-zA-Z0-9_]+:/g, '') // カスタム絵文字ショートコード
      .replace(/https?:\/\/\S+/g, '') // 裸のURL(念のため)
      // 許可する文字だけ残す: 漢字・かな・ー・々・全角記号(、。！？・「」)と、
      // キーボードでそのまま打てる印字可能ASCII全部(英数字・空白・. - _ / @ 等)。
      // エンジンはテーブル外の文字を「そのまま1打鍵」として受理するので、ここで潰さない。
      .replace(/[^一-鿿㐀-䶿々ぁ-ゖァ-ヺー、。！？・「」\x20-\x7e\n]/g, ' ')
      // 半角の ! ? は全角に寄せる(エンジンは全角側を受理)
      .replace(/!/g, '！')
      .replace(/\?/g, '？')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ')
  );
}

// ---- kuromoji トークナイザ(構築が重いのでプロセス内で使い回す)----
let tokenizerPromise = null;
export function getTokenizer(dicPath) {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, tok) => (err ? reject(err) : resolve(tok)));
    });
  }
  return tokenizerPromise;
}

// 1投稿(クリーニング済みテキスト)→ {display, reading} | null(読みを決められない・空)
export function toEntry(tokenizer, text) {
  const tokens = tokenizer.tokenize(text);
  let display = '';
  let reading = '';
  for (const t of tokens) {
    const surface = t.surface_form;
    const fix = KANA_FIXES[`${surface}|${t.reading}`];
    if (fix) {
      display += surface;
      reading += fix;
    } else if (t.reading && t.reading !== '*') {
      display += surface;
      reading += kataToHira(t.reading);
    } else if (isKanaOrAscii(surface)) {
      // 辞書に読みがない英数字・かな等はそのまま(エンジンは1打鍵扱い)
      display += surface;
      reading += kataToHira(surface);
    } else if (/^\s+$/.test(surface)) {
      display += ' ';
      reading += ' ';
    } else {
      return null; // 読みが決められないトークン(未知の漢字など)を含む投稿は除外
    }
  }
  display = display.replace(/\s+/g, ' ').trim();
  reading = reading.replace(/\s+/g, ' ').trim();
  for (const [from, to] of Object.entries(READING_FIXES)) {
    reading = reading.replaceAll(from, to);
  }
  return display && reading ? { display, reading } : null;
}

// 投稿群 → エントリ配列 + 除外統計。CLI・API 双方の中核。
// existingDisplays に既出の display を渡すと重複としてスキップする。
export function statusesToEntries(tokenizer, statuses, { existingDisplays } = {}) {
  const entries = [];
  const seen = new Set(existingDisplays ?? []);
  const skipped = { cw: 0, empty: 0, unreadable: 0, length: 0, dup: 0, untypeable: 0 };
  const dropped = []; // 打鍵不能で落ちたものを呼び出し側に伝える(警告表示用)
  for (const st of statuses) {
    if (st.spoiler_text || st.sensitive) {
      skipped.cw++;
      continue;
    } // CW・閲覧注意は使わない
    const text = clean(htmlToText(st.content));
    if (!text) {
      skipped.empty++;
      continue;
    }
    const entry = toEntry(tokenizer, text);
    if (!entry) {
      skipped.unreadable++;
      continue;
    }
    if (entry.reading.length < MIN_READING_LEN || entry.reading.length > MAX_READING_LEN) {
      skipped.length++;
      continue;
    }
    if (seen.has(entry.display)) {
      skipped.dup++;
      continue;
    }
    if (!isTypeable(entry.reading)) {
      skipped.untypeable++;
      dropped.push({ ...entry, url: st.url ?? st.uri ?? null });
      continue;
    }
    seen.add(entry.display);
    entries.push({ ...entry, url: st.url ?? st.uri ?? null });
  }
  return { entries, skipped, dropped };
}

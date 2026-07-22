// ローマ字変換テーブルと、ふりがな(ひらがな)→入力候補チャンク列のパーサ。
// 各チャンクは { kana, candidates } で、candidates は受理するローマ字綴りの配列。
// candidates[0] が画面表示用の推奨綴り。

export const SOKUON_SPELLINGS = ['xtu', 'ltu', 'xtsu', 'ltsu'];

const SMALL_KANA = new Set(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ']);

// 単独かな → 綴り候補(先頭が表示用の推奨)
const SINGLE = {
  あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu', 'whu'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['shi', 'si', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], ゐ: ['wi'], ゑ: ['we'], を: ['wo'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ゔ: ['vu'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li', 'xyi', 'lyi'], ぅ: ['xu', 'lu'],
  ぇ: ['xe', 'le', 'xye', 'lye'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'], ゎ: ['xwa', 'lwa'],
  ー: ['-'], '、': [','], '。': ['.'], '！': ['!'], '？': ['?'],
  '・': ['/'], '「': ['['], '」': [']'], ' ': [' '],
};

// 拗音など2文字かな → 綴り候補(分解入力 si+xya 等はパーサ側で自動合成)
const PAIR = {
  きゃ: ['kya'], きぃ: ['kyi'], きゅ: ['kyu'], きぇ: ['kye'], きょ: ['kyo'],
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しぇ: ['she', 'sye'], しょ: ['sho', 'syo'],
  ちゃ: ['cha', 'tya', 'cya'], ちゅ: ['chu', 'tyu', 'cyu'],
  ちぇ: ['che', 'tye', 'cye'], ちょ: ['cho', 'tyo', 'cyo'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'],
  じゃ: ['ja', 'jya', 'zya'], じゅ: ['ju', 'jyu', 'zyu'],
  じぇ: ['je', 'jye', 'zye'], じょ: ['jo', 'jyo', 'zyo'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'],
  ふぁ: ['fa'], ふぃ: ['fi', 'fyi'], ふぇ: ['fe', 'fye'], ふぉ: ['fo'], ふゅ: ['fyu'],
  うぃ: ['wi', 'whi'], うぇ: ['we', 'whe'], うぉ: ['who'],
  ゔぁ: ['va'], ゔぃ: ['vi'], ゔぇ: ['ve'], ゔぉ: ['vo'],
  てぃ: ['thi'], てゅ: ['thu'], でぃ: ['dhi'], でゅ: ['dhu'],
  とぅ: ['twu'], どぅ: ['dwu'],
  つぁ: ['tsa'], つぃ: ['tsi'], つぇ: ['tse'], つぉ: ['tso'],
  くぁ: ['qa', 'kwa'], ぐぁ: ['gwa'],
  いぇ: ['ye'],
};

// 表示スタイル(候補の並び順のみ変更。どの綴りでも入力は常に受理される)
// 'hepburn' = テーブルの既定順(shi・cha) / 'kunrei' = 訓令式綴りを先頭に(si・tya)
const KUNREI_SPELLINGS = new Set([
  'si', 'ti', 'tu', 'hu', 'zi',
  'sya', 'syu', 'syo', 'sye',
  'tya', 'tyu', 'tyo', 'tye',
  'zya', 'zyu', 'zyo', 'zye',
]);

let romajiStyle = 'hepburn';

export function setRomajiStyle(style) {
  romajiStyle = style === 'kunrei' ? 'kunrei' : 'hepburn';
}

// candidates[0] が画面表示に使われるので、訓令式優先なら該当綴りを先頭へ移す
function preferStyle(cands) {
  if (romajiStyle !== 'kunrei') return cands;
  const i = cands.findIndex((c) => KUNREI_SPELLINGS.has(c));
  if (i > 0) {
    const [c] = cands.splice(i, 1);
    cands.unshift(c);
  }
  return cands;
}

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

function isConsonant(ch) {
  return /^[a-z]$/.test(ch) && !VOWELS.has(ch) && ch !== 'n';
}

function dedupe(arr) {
  return [...new Set(arr)];
}

// カタカナ・全角スペースをひらがな等に正規化
export function normalizeReading(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCodePoint(code - 0x60); // カタカナ → ひらがな
    } else if (ch === '　') {
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

// ふりがな全体をチャンク列に変換
export function parseKana(reading) {
  const kana = normalizeReading(reading);
  const chunks = [];
  let i = 0;
  while (i < kana.length) {
    const chunk = parseChunk(kana, i);
    chunks.push(chunk);
    i += chunk.kana.length;
  }
  return chunks;
}

function parseChunk(kana, i) {
  const ch = kana[i];
  if (ch === 'っ') return parseSokuon(kana, i);
  if (ch === 'ん') return parseN(kana, i);
  return parseBase(kana, i);
}

// 通常のかな(1文字 or 拗音等2文字)。拗音は「sha」と「si+xya」の両方を受理。
function parseBase(kana, i) {
  const ch = kana[i];
  const two = kana.slice(i, i + 2);
  if (two.length === 2 && SMALL_KANA.has(two[1])) {
    const cands = [];
    if (PAIR[two]) cands.push(...PAIR[two]);
    if (SINGLE[two[0]] && SINGLE[two[1]]) {
      for (const a of SINGLE[two[0]]) {
        for (const b of SINGLE[two[1]]) cands.push(a + b);
      }
    }
    if (cands.length) return { kana: two, candidates: preferStyle(dedupe(cands)) };
  }
  if (SINGLE[ch]) return { kana: ch, candidates: preferStyle([...SINGLE[ch]]) };
  // テーブル外の文字(英数字など)はそのまま1打鍵として扱う
  return { kana: ch, candidates: [ch.toLowerCase()] };
}

// 促音「っ」: 次のチャンクと結合し、子音重ね(kko)と xtu 系の両方を受理
function parseSokuon(kana, i) {
  let run = 0;
  while (kana[i + run] === 'っ') run++;
  const restIndex = i + run;

  // 直後に重ねられる音が無い場合(語末・ん直前)は xtu 系のみ
  if (restIndex >= kana.length || kana[restIndex] === 'ん') {
    let cands = [''];
    for (let j = 0; j < run; j++) {
      cands = cands.flatMap((s) => SOKUON_SPELLINGS.map((sp) => s + sp));
    }
    return { kana: 'っ'.repeat(run), candidates: dedupe(cands) };
  }

  const next = parseChunk(kana, restIndex);
  let cands = next.candidates;
  for (let j = 0; j < run; j++) {
    const out = [];
    for (const c of cands) {
      if (isConsonant(c[0])) out.push(c[0] + c); // 子音重ね
      for (const sp of SOKUON_SPELLINGS) out.push(sp + c);
    }
    cands = out;
  }
  return { kana: 'っ'.repeat(run) + next.kana, candidates: dedupe(cands) };
}

// 撥音「ん」: 次のチャンクと結合。単独 n は次の音が母音・な行・や行以外の時のみ受理。
function parseN(kana, i) {
  const N_FULL = ['nn', "n'", 'xn'];
  if (i + 1 >= kana.length) {
    return { kana: 'ん', candidates: [...N_FULL] };
  }
  const next = parseChunk(kana, i + 1);
  const cands = [];
  for (const c of next.candidates) {
    if (!/[aiueony]/.test(c[0])) cands.push('n' + c);
  }
  for (const nf of N_FULL) {
    for (const c of next.candidates) cands.push(nf + c);
  }
  return { kana: 'ん' + next.kana, candidates: dedupe(cands) };
}

// 投稿フローで扱う辞書TSVの 生成・パース・検証。
// snstyping-dict 側の Validate(scripts/lib.mjs)と齟齬が出ないようにする。

import { isTypeable } from '@/lib/sns/reading-core';

// snstyping-dict/scripts/lib.mjs の READING_RE と同期させること。
// エンジンが受理できる読み仮名の文字集合(ひらがな・カタカナ・ー・記号・ASCII印字可能)。
const READING_RE = /^[ぁ-ゖァ-ヶー、。！？・「」　\x20-\x7e]+$/u;

export type Entry = { display: string; reading: string };

// acct("@user@server")から辞書ファイル名を導く。
export function filenameFor(acct: string): string {
  return `${acct}.tsv`;
}

function domainOf(acct: string): string {
  return acct.split('@')[2] ?? '';
}

// 1エントリの妥当性を検証。問題があれば理由文字列、無ければ null。
export function validateEntry(display: string, reading: string): string | null {
  if (!display || !reading) return '表示テキストとふりがなは必須です';
  if (/[\t\n\r]/.test(display) || /[\t\n\r]/.test(reading)) return 'タブ・改行は使えません';
  if (!READING_RE.test(reading)) {
    const bad = [...reading].filter((c) => !READING_RE.test(c)).join('');
    return `ふりがなに使えない文字: ${bad}`;
  }
  if (!isTypeable(reading)) return 'このふりがなは最後まで打鍵できません';
  return null;
}

// 既存TSVから title と エントリを取り出す(更新時のマージ表示に使う)。
export function parseTsv(text: string): { title: string | null; entries: Entry[] } {
  let title: string | null = null;
  const entries: Entry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#')) {
      const m = line.match(/^#\s*title\s*:\s*(.+)$/);
      if (m) title = m[1].trim();
      continue;
    }
    if (!line) continue;
    const [display, reading] = line.split('\t');
    if (display && reading) entries.push({ display: display.trim(), reading: reading.trim() });
  }
  return { title, entries };
}

// エントリ配列から TSV 本文を生成する。カテゴリはサーバー名(ドメイン)にする。
export function buildTsv(acct: string, title: string, entries: Entry[]): string {
  const header = [
    `# title: ${title}`,
    `# category: ${domainOf(acct)}`,
    `# ${acct} の投稿より(本人確認済み)`,
    '# 形式: 表示テキスト<TAB>ふりがな(ひらがな)',
  ];
  const body = entries.map((e) => `${e.display}\t${e.reading}`).join('\n');
  return `${header.join('\n')}\n${body}\n`;
}

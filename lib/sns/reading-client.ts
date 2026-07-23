// クライアント(投稿画面)側の UniDic 読み生成。
// mecab-web-worker(本物 MeCab の WASM) + unidic-mecab-2.1.2 をブラウザ内で動かし、
// 表示テキスト → ふりがな(打鍵用の「仮名形出現形」)を作る。
// サーバーの kuromoji 下書きを、より精度の高い UniDic 読みへ置き換えるために使う。
//
// ブラウザ専用(Module Worker / Compression Streams / CacheStorage 依存)。
// 非対応環境ではこのモジュールのロードに失敗しうるので、呼び出し側で握って
// kuromoji 下書きにフォールバックすること。

import type { MecabWorker as MecabWorkerType, UnidicFeature26 } from 'mecab-web-worker';
import { KANA_FIXES, READING_FIXES, kataToHira, isKanaOrAscii, isTypeable } from './reading-core.js';

// 辞書配布。snstyping-dict の GitHub Pages(CORS 有効)から配信する。
// 実体は Release 資産で、Pages デプロイ時に成果物へ取り込まれる(deploy.yml 参照)。
// ローカルで別の場所を使いたい場合は NEXT_PUBLIC_UNIDIC_URL で上書き。
export const DICT_URL =
  process.env.NEXT_PUBLIC_UNIDIC_URL || 'https://highemerly.github.io/snstyping-dict/unidic-mecab-2.1.2_bin.zip';
export const DICT_SIZE_MB = 46; // UI 表示用のおおよそのサイズ

type Node = { surface: string; feature: UnidicFeature26 | null };

// 読みに打鍵できない文字(漢字など)が残っていないかの許可文字集合。
// 現行パイプラインは未知漢字を含む投稿を除外する。それに合わせる。
const TYPEABLE_CHARSET = /^[ぁ-ゖァ-ヺー、。！？・「」\x20-\x7e]*$/;

// parseToNodes の結果 + 元テキスト → { reading, typeable }
// - 元テキストと surface を突き合わせ、mecab が落とすトークン間スペースを復元する。
// - typeable=false は「読みに打てない文字が残った」= 現行同様この投稿は除外対象。
export function buildReading(nodes: Node[], text: string): { reading: string; typeable: boolean } {
  let reading = '';
  let cursor = 0;
  for (const n of nodes) {
    const surface = n.surface;
    if (!surface) continue; // BOS/EOS
    // 元テキスト上での位置を探し、cursor との間に落ちた空白を読みへ復元
    const idx = text.indexOf(surface, cursor);
    if (idx > cursor && /^\s+$/.test(text.slice(cursor, idx))) reading += ' ';
    if (idx >= 0) cursor = idx + surface.length;

    const kana = n.feature?.kana && n.feature.kana !== '*' ? n.feature.kana : null;
    const fix = KANA_FIXES[`${surface}|${n.feature?.kana}`];
    if (/^[\x21-\x7e]+$/.test(surface)) {
      // 英字・数字・記号(印字可能ASCII)は現行同様リテラル維持。
      // UniDic は AI→エーアイ, 24→ニヨン と音声化するが、タイピングでは
      // そのまま打てる方が自然なので採用しない。
      reading += surface;
    } else if (fix) {
      reading += fix;
    } else if (kana) {
      reading += kataToHira(kana);
    } else if (isKanaOrAscii(surface)) {
      reading += kataToHira(surface);
    } else {
      reading += surface; // 読み不能: 漢字等がそのまま残る → 下の判定で弾く
    }
  }
  reading = reading.replace(/[ \t]+/g, ' ').trim();
  for (const [from, to] of Object.entries(READING_FIXES)) reading = reading.replaceAll(from, to);
  const typeable = TYPEABLE_CHARSET.test(reading) && isTypeable(reading);
  return { reading, typeable };
}

export type LoadProgress = { loaded: number; total: number | null; fromCache: boolean };

export interface UnidicReader {
  generate(display: string): Promise<{ reading: string; typeable: boolean }>;
}

// UniDic 読み生成器を用意する。辞書のダウンロード/キャッシュ読み込みが済むまで待つ。
// onProgress で DL 進捗(バイト)を通知する(UI 表示用)。
export async function createUnidicReader(opts: {
  dictUrl?: string;
  onProgress?: (p: LoadProgress) => void;
} = {}): Promise<UnidicReader> {
  // 動的 import: SSR/非対応環境で読み込まれないように、呼び出し時にだけ解決する。
  const { MecabWorker, createUnidicFeature26 } = await import('mecab-web-worker');
  // onLoad の size は「累積」ではなく「チャンク単位」で飛んでくる(合計が total)。
  // ダウンロード完了を判定できるよう、ここで自前に積算して cumulative を渡す。
  let loaded = 0;
  const worker: MecabWorkerType<UnidicFeature26> = await MecabWorker.create(opts.dictUrl || DICT_URL, {
    wrapper: createUnidicFeature26,
    onLoad: (m) => {
      loaded += m.size;
      opts.onProgress?.({ loaded, total: m.total, fromCache: m.type === 'cache' });
    },
  });

  return {
    async generate(display: string) {
      const nodes = (await worker.parseToNodes(display)) as unknown as Node[];
      return buildReading(nodes, display);
    },
  };
}

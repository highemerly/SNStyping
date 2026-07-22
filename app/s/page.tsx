// リザルト共有ページ。SNSに投稿されるのはこのページのURLで、
// og:image(/api/og)がタイムライン上でリザルト画像カードとして表示される。
// 開いた人向けには結果の要約と「自分も挑戦」導線を出す。

import type { Metadata } from 'next';
import { parseShareParams, shareQuery } from '@/lib/share';
import ShareActions from './ShareActions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 共有元が埋め込んだ ?t=&list= から「同じモードで遊ぶ」URLを組み立てる。
// 無効・未指定(アップロード共有など)ならトップへ。
function playHrefFrom(sp: Record<string, string | string[] | undefined>): string {
  const t = Number(Array.isArray(sp.t) ? sp.t[0] : sp.t);
  const list = Array.isArray(sp.list) ? sp.list[0] : sp.list;
  if ([30, 60, 120].includes(t) && list && list !== 'upload') {
    return `/solo?t=${t}&list=${encodeURIComponent(list)}`;
  }
  return '/';
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const r = parseShareParams(await searchParams);
  const title = `スコア ${r.score} - SNS Typing`;
  const description = `KPM ${r.kpm} / 正確率 ${r.accuracy}%${r.rule ? `(${r.rule})` : ''} - ブラウザで遊べる日本語ローマ字タイピングゲーム`;
  const ogImage = `/api/og?${shareQuery(r)}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const r = parseShareParams(sp);
  const playHref = playHrefFrom(sp);
  return (
    <main className="app">
      <section className="screen-box">
        <h2>SNS Typing の結果</h2>
        {r.rule && <p className="room-rules">{r.rule}</p>}
        <p className="result-score">{r.score}</p>
        <table className="result-table">
          <tbody>
            <tr><th>正解タイプ数</th><td>{r.hits}</td></tr>
            <tr><th>ミス</th><td>{r.misses}</td></tr>
            <tr><th>KPM(打鍵/分)</th><td>{r.kpm}</td></tr>
            <tr><th>正確率</th><td>{r.accuracy}%</td></tr>
            <tr><th>完了したお題</th><td>{r.completedWords}</td></tr>
          </tbody>
        </table>
        <ShareActions playHref={playHref} />
        <p className="hint">ログイン不要・ブラウザですぐ遊べます</p>
      </section>
    </main>
  );
}

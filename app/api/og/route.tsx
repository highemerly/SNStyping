// リザルトのOGP画像(1200×630)を動的生成する。/s ページの og:image から参照される。
// Satori のデフォルトフォントに日本語グリフがないため、画像に使う文字だけを
// Google Fonts のサブセットAPIから取得する(text= 指定で数KBに収まる)。

import { ImageResponse } from 'next/og';
import { parseShareParams } from '@/lib/share';

async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  // サーバーの fetch はブラウザUAではないため、woff2 ではなく ttf/otf のURLが返る
  const resource = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!resource) throw new Error('font css parse failed');
  const res = await fetch(resource[1]);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

const BG = '#0f1218';
const PANEL = '#1a1f2b';
const TEXT = '#e8ecf4';
const MUTED = '#8b93a7';
const ACCENT = '#4fc3f7';
const ACCENT2 = '#7c6cf5';
const BORDER = '#333c4f';

export async function GET(req: Request) {
  try {
    return await renderOg(req);
  } catch (e) {
    console.error('og render failed:', e);
    return new Response(`og render failed: ${(e as Error)?.message}`, { status: 500 });
  }
}

async function renderOg(req: Request) {
  const { searchParams } = new URL(req.url);
  const r = parseShareParams(Object.fromEntries(searchParams));

  const stats = [
    { label: 'KPM', value: String(r.kpm) },
    { label: '正確率', value: `${r.accuracy}%` },
    { label: 'ミス', value: String(r.misses) },
    { label: '完了したお題', value: String(r.completedWords) },
  ];

  // サブセット取得用に、画像に登場する文字を全部集める
  const chars =
    'SNS Typing スコア 0123456789.%ブラウザで遊べる日本語ローマ字タイピングゲーム' +
    stats.map((s) => s.label + s.value).join('') +
    r.rule;

  const font = await loadGoogleFont('Noto+Sans+JP:wght@700', chars);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: BG,
          color: TEXT,
          padding: '48px 64px',
          fontFamily: 'NotoSansJP',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div
            style={{
              fontSize: 44,
              backgroundImage: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            SNS Typing
          </div>
          <div style={{ fontSize: 28, color: MUTED }}>{r.rule}</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1,
          }}
        >
          <div style={{ fontSize: 30, color: MUTED }}>スコア</div>
          <div
            style={{
              fontSize: 170,
              lineHeight: 1.1,
              backgroundImage: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {/* 数値のまま子要素に渡すと Satori が invalid child 扱いで落ちるため文字列化 */}
            {String(r.score)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexGrow: 1,
                backgroundColor: PANEL,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: '20px 12px',
              }}
            >
              <div style={{ fontSize: 24, color: MUTED }}>{s.label}</div>
              <div style={{ fontSize: 44 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28, fontSize: 24, color: MUTED }}>
          ブラウザで遊べる日本語ローマ字タイピングゲーム
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'NotoSansJP', data: font, weight: 700, style: 'normal' }],
    },
  );
}

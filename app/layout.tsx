import type { Metadata } from 'next';
import MobileGate from '@/components/MobileGate';
import Prefs from '@/components/Prefs';
import './globals.css';

// /s ページの og:image を絶対URLに解決するための基準。Vercel 以外に置くときは
// NEXT_PUBLIC_SITE_URL(例: https://snstyping.example.com)を設定する。
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3100');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'SNS Typing',
  description: 'ブラウザで遊べる日本語ローマ字タイピングゲーム',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⌨️</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 下の描画前スクリプトが data-theme を差し込むため、html要素のhydration差分は許容する
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 保存済みテーマを描画前に適用(ライト設定時のダーク一瞬表示を防ぐ) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('snstyping:theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}",
          }}
        />
      </head>
      <body>
        <Prefs />
        <MobileGate>{children}</MobileGate>
      </body>
    </html>
  );
}

'use client';

// スマホ非対応の案内ゲート。全ページ共通(layout.tsx で children を包む)。
// User-Agent がモバイル判定なら遊べない旨を表示する。物理キーボード接続などで
// 判定が間違っている場合は「このまま進む」で通過でき、その選択(と当時のUA)を
// localStorage に保存して以後はゲートを出さない。

import { useEffect, useState } from 'react';

const OVERRIDE_KEY = 'snstyping:mobile-override';

const isMobileUa = (ua: string) => /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);

export default function MobileGate({ children }: { children: React.ReactNode }) {
  // null = 判定前。SSR・初回描画は通常コンテンツを出す(空白ページ化を避ける)。
  // モバイルではマウント直後にゲートへ切り替わる。
  const [blocked, setBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    let override = false;
    try {
      override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? 'null')?.proceeded === true;
    } catch {
      // 壊れた保存値は無視してゲートを出す
    }
    setBlocked(isMobileUa(navigator.userAgent) && !override);
  }, []);

  // UA判定が間違っていた(実際はキーボードで遊べる)という申告を保存して通過
  const proceed = () => {
    try {
      localStorage.setItem(
        OVERRIDE_KEY,
        JSON.stringify({ proceeded: true, userAgent: navigator.userAgent, at: new Date().toISOString() }),
      );
    } catch {
      // 保存できなくてもこのセッションは通す
    }
    setBlocked(false);
  };

  if (blocked) {
    return (
      <main className="app">
        <section className="screen-box">
          <h2>スマホ非対応です</h2>
          <p className="waiting-status">
            SNS Typing は物理キーボードでのタイピング専用ゲームのため、
            スマートフォン・タブレットではプレイできません。
            PCのブラウザからアクセスしてください。
          </p>
          <p className="hint">
            判定が間違っている場合(キーボードを接続している等)はこちらから進んでください。
          </p>
          <div className="button-row">
            <button data-testid="mobile-proceed" onClick={proceed}>このまま進む</button>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

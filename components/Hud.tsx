'use client';

// ゲーム中の HUD のうち、ルール(時間指定 / ワード数指定)で変わる部分。
// ソロ・ゴースト対戦・オンライン対戦で共通に使う。
//   時間指定:     「残り 12.3」(秒) + 残り時間のバー
//   ワード数指定: 「タイム 12.3」+「残り 7語」+ 残りお題数のバー

import type { Snapshot } from './usePlayerGame';

export function HudClock({ snap }: { snap: Snapshot }) {
  if (snap.mode === 'words') {
    return (
      <>
        <div className="hud-item">タイム <span data-testid="elapsed-time">{snap.elapsedSec.toFixed(1)}</span></div>
        <div className="hud-item time">残り <span data-testid="words-left">{snap.wordsLeft}語</span></div>
      </>
    );
  }
  return <div className="hud-item time">残り <span>{snap.timeLeft.toFixed(1)}</span></div>;
}

export function RemainBar({ snap }: { snap: Snapshot }) {
  return (
    <div className="time-bar">
      <div className="time-bar-fill" style={{ width: `${snap.barFrac * 100}%` }} />
    </div>
  );
}

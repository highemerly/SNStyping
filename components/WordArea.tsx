'use client';

// お題表示(ふりがな + 本文 + ローマ字ガイド)。ミス時に赤くフラッシュする。

import { useEffect, useRef } from 'react';
import { missFlashEnabled, romajiGuideVisible } from './settings';
import type { Snapshot } from './usePlayerGame';

// ローマ字ガイド中のスペースは見落としやすいので「␣」で可視化する
export function RomajiText({ text }: { text: string }) {
  return (
    <>
      {[...text].map((ch, i) =>
        ch === ' ' ? (
          <span key={i} className="romaji-space">␣</span>
        ) : (
          ch
        ),
      )}
    </>
  );
}

export default function WordArea({ snap }: { snap: Snapshot }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const prevMisses = useRef(snap.misses);

  useEffect(() => {
    if (snap.misses > prevMisses.current && areaRef.current && missFlashEnabled()) {
      const el = areaRef.current;
      el.classList.remove('miss-flash');
      void el.offsetWidth; // reflow を挟んでアニメーションを再トリガー
      el.classList.add('miss-flash');
    }
    prevMisses.current = snap.misses;
  }, [snap.misses]);

  const r = snap.readingProgress;
  const d = snap.displayProgress;
  return (
    <div className="word-area" ref={areaRef}>
      <p className="word-reading">
        <span className="seg-done">{r.done}</span>
        <span className="seg-current">{r.current}</span>
        <span className="seg-rest">{r.rest}</span>
      </p>
      <p className="word-display" data-testid="word-display">
        <span className="seg-done">{d.done}</span>
        <span className="seg-current">{d.current}</span>
        <span className="seg-rest">{d.rest}</span>
      </p>
      {romajiGuideVisible() && (
        <p className="word-romaji">
          <span className="romaji-typed"><RomajiText text={snap.typed} /></span>
          <span className="romaji-rest" data-testid="romaji-rest"><RomajiText text={snap.rest} /></span>
        </p>
      )}
    </div>
  );
}

'use client';

// 自分側のゲーム進行(エンジン + タイマー + キー入力)を管理するフック。
// ソロ・対戦の両方から使う。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '@/lib/engine/game';
import { codeToKana } from '@/lib/engine/kana';
import { loadInputModePref, loadRomajiStylePref } from './settings';
import { soundMiss, soundWord } from './sound';

interface TextProgress {
  done: string;
  current: string;
  rest: string;
}

export interface Snapshot {
  display: string;
  reading: string;
  typed: string;
  rest: string;
  // ふりがな・原文の「入力済み / いま打っている場所 / 未入力」3分割
  readingProgress: TextProgress;
  displayProgress: TextProgress;
  score: number;
  misses: number;
  hits: number;
  completedWords: number;
  kpm: number;
  timeLeft: number;
  elapsedSec: number;
  timeFrac: number; // 残り時間の割合(上部バー用)
}

export type GameEvent = 'hit' | 'miss' | 'word';

interface Options {
  onEvent?: (ev: GameEvent, game: Game) => void;
  onTimeUp?: (game: Game) => void; // 時間切れ
  blocked?: () => boolean; // true の間はキー入力を無視(確認ダイアログ表示中など)
}

export interface StartOptions {
  durationSec?: number;
  shuffle?: boolean;
}

function makeSnapshot(g: Game): Snapshot {
  const now = performance.now();
  const timeLeft = g.remainingSec(now);
  const usedSec = g.durationSec - timeLeft;
  const line = g.current;
  const progress = line?.progressText() ?? {
    reading: { done: '', current: '', rest: '' },
    display: { done: '', current: '', rest: '' },
  };
  return {
    display: line?.display ?? '',
    reading: line?.reading ?? '',
    typed: line?.typedKeys ?? '',
    rest: line?.remainingText() ?? '',
    readingProgress: progress.reading,
    displayProgress: progress.display,
    score: g.stats.score,
    misses: g.stats.misses,
    hits: g.stats.hits,
    completedWords: g.stats.completedWords,
    kpm: usedSec > 1 ? Math.round((g.stats.hits * 60) / usedSec) : 0,
    timeLeft,
    elapsedSec: g.elapsedSec(now),
    timeFrac: timeLeft / g.durationSec,
  };
}

export function usePlayerGame(options: Options = {}) {
  const gameRef = useRef<Game | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [running, setRunning] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ゴースト録画: エンジンに渡した全キーを [開始からのms, キー] で記録する
  const keysRef = useRef<[number, string][]>([]);

  const refresh = useCallback(() => {
    if (gameRef.current) setSnap(makeSnapshot(gameRef.current));
  }, []);

  const stop = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    gameRef.current?.finish();
    setRunning(false);
  }, []);

  const start = useCallback(
    (words: { display: string; reading: string }[], opts: StartOptions) => {
      stop();
      loadRomajiStylePref(); // お題のローマ字ガイドを設定の綴りで表示する
      const g = new Game(words, { ...opts, inputMode: loadInputModePref() });
      gameRef.current = g;
      keysRef.current = [];
      g.start();
      setRunning(true);
      refresh();
      tickRef.current = setInterval(() => {
        const game = gameRef.current;
        if (!game || !game.running) return;
        if (game.isTimeUp()) {
          stop();
          refresh();
          optionsRef.current.onTimeUp?.(game);
          return;
        }
        refresh();
      }, 100);
    },
    [refresh, stop],
  );

  // キー入力
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || !g.running) return;
      if (optionsRef.current.blocked?.()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // かな入力は物理キー位置(code + Shift)を JISかな配列で解釈する。
      // ローマ字入力は produce された文字(e.key)をそのまま使う。
      let stroke: string | null;
      if (g.inputMode === 'kana') {
        stroke = codeToKana(e.code, e.shiftKey);
      } else {
        stroke = e.key.length === 1 ? e.key : null;
      }
      if (stroke === null) return;
      e.preventDefault();
      keysRef.current.push([performance.now() - g.startTime, stroke]);
      const result = g.type(stroke);
      if (result === 'miss') soundMiss();
      else if (result === 'word') soundWord();
      refresh();
      optionsRef.current.onEvent?.(result as GameEvent, g);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [refresh]);

  // アンマウント時にタイマー停止
  useEffect(() => stop, [stop]);

  // 直近プレイの打鍵ログ(ゴースト保存用)
  const getRecording = useCallback(() => [...keysRef.current], []);

  return { snap, running, start, stop, gameRef, getRecording };
}

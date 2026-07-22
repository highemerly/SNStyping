'use client';

// ゴースト対戦: 録画された打鍵ログ(.ghost.json)を同じエンジンで再生し、
// その仮想プレイヤーとローカルで競争する。サーバー不要。
// お題・順序・制限時間はゴーストファイルに記録されたものをそのまま使う。

import { useEffect, useRef, useState } from 'react';
import WordArea, { RomajiText } from './WordArea';
import InputModeNotice from './InputModeNotice';
import { usePlayerGame } from './usePlayerGame';
import { soundCount, soundGo } from './sound';
import { GhostPlayer } from '@/lib/engine/ghost';
import { recordPlay } from '@/lib/stats';

interface Ghost {
  player: { name: string };
  rule: { durationSec: number };
  words: { display: string; reading: string }[];
  keys: [number, string][];
  stats: {
    score: number;
    hits: number;
    misses: number;
    completedWords: number;
    kpm: number;
    accuracy: number;
  };
}

interface Progress {
  score: number;
  misses: number;
  kpm: number;
  completedWords: number;
  wordProgress: number;
  typed: string;
  rest: string;
}

interface Result {
  score: number;
  hits: number;
  misses: number;
  completedWords: number;
  kpm: number;
  accuracy: number;
}

const PROGRESS_ZERO: Progress = { score: 0, misses: 0, kpm: 0, completedWords: 0, wordProgress: 0, typed: '', rest: '' };
const COUNTDOWN_SEC = 3;

export default function GhostGame({
  ghost,
  ghostId,
  onExit,
  onHome,
}: {
  ghost: Ghost;
  // 計上する rule_key に使うゴーストID(登録済みなら catalog のid、ローカルファイルは 'file')
  ghostId?: string;
  onExit: () => void;
  onHome: () => void;
}) {
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'playing' | 'result'>('ready');
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [result, setResult] = useState<Result | null>(null);
  const [ghostProg, setGhostProg] = useState<Progress>(PROGRESS_ZERO);
  const [ghostDone, setGhostDone] = useState(false);

  const ghostRef = useRef<GhostPlayer | null>(null);
  const startAtRef = useRef(0);
  // 設定モーダルを開いている間は Space/Esc のショートカットを止める
  const settingsOpenRef = useRef(false);
  const durationSec = ghost.rule.durationSec;
  const ruleText = `${durationSec}秒 / ${ghost.words.length}語`;

  const finishWith = (g: { result: () => Result }) => {
    setResult(g.result());
    setPhase('result');
    // プレイ数を計上(ベストエフォート)。rule_key はゴーストIDそのもの
    recordPlay('ghost', ghostId && ghostId !== 'file' ? ghostId : 'file');
  };

  const { snap, start } = usePlayerGame({
    onTimeUp: finishWith,
  });

  // カウントダウン → 開始。リトライ(phase を countdown に戻す)でも同じ流れを通る
  useEffect(() => {
    if (phase !== 'countdown') return;
    let remain = COUNTDOWN_SEC;
    setCountdown(remain);
    soundCount();
    const timer = setInterval(() => {
      remain -= 1;
      if (remain > 0) {
        setCountdown(remain);
        soundCount();
        return;
      }
      clearInterval(timer);
      soundGo();
      ghostRef.current = new GhostPlayer(ghost);
      setGhostProg(PROGRESS_ZERO);
      setGhostDone(false);
      startAtRef.current = performance.now();
      start(ghost.words, { durationSec, shuffle: false });
      setPhase('playing');
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ゴーストの再生(50ms刻みで経過時間まで打鍵を進める)
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const gp = ghostRef.current;
      if (!gp) return;
      const elapsed = performance.now() - startAtRef.current;
      gp.advanceTo(elapsed);
      setGhostProg(gp.progress(elapsed));
      if (gp.done) setGhostDone(true);
    }, 50);
    return () => clearInterval(timer);
  }, [phase]);

  // 開始前: Space で開始 / Esc で戻る。リザルト: Space で同じモード再プレイ / Esc でトップへ。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (settingsOpenRef.current) return; // 設定モーダルにキー操作を任せる
      if (phase === 'result') {
        if (e.key === 'Escape') {
          e.preventDefault();
          onHome();
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setPhase('countdown');
        }
        return;
      }
      if (e.key === 'Escape') {
        onExit();
      } else if (phase === 'ready' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setPhase('countdown');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, onExit, onHome]);

  const ghostName = `👻 ${ghost.player.name}`;

  if (phase === 'ready') {
    return (
      <section className="screen-box countdown-box">
        <h2>ゴースト対戦</h2>
        <p className="room-rules" data-testid="ghost-rule">
          {ghostName} と対戦: {ruleText}
        </p>
        <div className="button-row">
          <button className="primary" data-testid="ghost-begin" onClick={() => setPhase('countdown')}>
            開始 <kbd>Space</kbd>
          </button>
          <button onClick={onExit}>戻る <kbd>Esc</kbd></button>
        </div>
        <InputModeNotice onOpenChange={(o) => (settingsOpenRef.current = o)} />
      </section>
    );
  }

  if (phase === 'countdown') {
    return (
      <section className="screen-box countdown-box">
        <p className="room-rules" data-testid="ghost-rule">
          {ghostName} と対戦: {ruleText}
        </p>
        <p className="countdown-label">まもなく開始</p>
        <p className="countdown-number" data-testid="countdown">{countdown}</p>
      </section>
    );
  }

  if (phase === 'result' && result) {
    // 自分の結果 vs ゴーストの記録された結果(リプレイ値ではなく録画時の確定値)
    const gs = ghost.stats;
    const cmp = result.score - gs.score;
    const banner = cmp > 0 ? 'WIN!' : cmp < 0 ? 'LOSE…' : 'DRAW';
    return (
      <section className="screen-box">
        <p className={`versus-banner ${cmp > 0 ? 'win' : cmp < 0 ? 'lose' : ''}`} data-testid="result-banner">
          {banner}
        </p>
        <p className="room-rules" data-testid="result-rule">{ghostName} と対戦: {ruleText}</p>
        <table className="result-table versus-result">
          <thead>
            <tr>
              <th></th>
              <th>あなた</th>
              <th>{ghostName}</th>
            </tr>
          </thead>
          <tbody>
            <tr><th>スコア</th><td data-testid="my-final-score">{result.score}</td><td>{gs.score}</td></tr>
            <tr><th>KPM</th><td>{result.kpm}</td><td>{gs.kpm}</td></tr>
            <tr><th>ミス</th><td>{result.misses}</td><td>{gs.misses}</td></tr>
            <tr><th>正確率</th><td>{result.accuracy}%</td><td>{gs.accuracy}%</td></tr>
            <tr><th>完了したお題</th><td>{result.completedWords}</td><td>{gs.completedWords}</td></tr>
          </tbody>
        </table>
        <div className="button-row">
          <button className="primary" data-testid="ghost-retry" onClick={() => setPhase('countdown')}>
            同じモードで遊ぶ <kbd>Space</kbd>
          </button>
          <button onClick={onHome}>トップに戻る <kbd>Esc</kbd></button>
        </div>
      </section>
    );
  }

  if (!snap) return null;

  // 進捗バー: スコアの相対比較
  const maxScore = Math.max(snap.score, ghostProg.score, 1);
  const myFrac = snap.score / maxScore;
  const ghostFrac = ghostProg.score / maxScore;
  const ghostWord = ghost.words[(ghostProg.completedWords) % ghost.words.length];

  return (
    <section>
      <div className="hud">
        <div className="hud-item">スコア <span data-testid="my-score">{snap.score}</span></div>
        <div className="hud-item">KPM <span>{snap.kpm}</span></div>
        <div className="hud-item">ミス <span>{snap.misses}</span></div>
        <div className="hud-item time">残り <span>{snap.timeLeft.toFixed(1)}</span></div>
      </div>
      <div className="time-bar">
        <div className="time-bar-fill" style={{ width: `${snap.timeFrac * 100}%` }} />
      </div>

      <div className="battle-bars">
        <div className="battle-row">
          <span className="battle-name">あなた</span>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(myFrac, 1) * 100}%` }} />
          </div>
          <span className="battle-value" data-testid="my-bar-value">{snap.score}</span>
        </div>
        <div className="battle-row peer">
          <span className="battle-name" data-testid="ghost-title">{ghostName}</span>
          <div className="progress-track">
            <div className="progress-fill peer" style={{ width: `${Math.min(ghostFrac, 1) * 100}%` }} />
          </div>
          <span className="battle-value" data-testid="ghost-bar-value">{ghostProg.score}</span>
        </div>
      </div>

      <WordArea snap={snap} />

      {/* ゴーストの手元: いま打っているお題とローマ字(録画の再生) */}
      <div className="ghost-panel" data-testid="ghost-panel">
        <p className="spec-player-name">
          {ghostName}
          {ghostDone && <span className="ghost-done-badge"> 終了</span>}
        </p>
        {!ghostDone && ghostWord && (
          <div className="spec-word ghost-word">
            <p className="word-display spec-word-display">{ghostWord.display}</p>
            <p className="word-romaji">
              <span className="romaji-typed"><RomajiText text={ghostProg.typed} /></span>
              <span className="romaji-rest"><RomajiText text={ghostProg.rest} /></span>
            </p>
          </div>
        )}
      </div>
      <p className="hint">Esc でやめる</p>
    </section>
  );
}

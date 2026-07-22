'use client';

// ソロプレイ(時間制スコアアタック)。Space で開始 → カウントダウン → プレイ → リザルト。

import { useEffect, useRef, useState } from 'react';
import ShareButtons from './ShareButtons';
import WordArea from './WordArea';
import InputModeNotice from './InputModeNotice';
import { usePlayerGame } from './usePlayerGame';
import { loadNamePref, setNamePref } from './settings';
import { soundCount, soundGo } from './sound';
import { createGhost } from '@/lib/engine/ghost';
import { recordPlay, ruleKeyFor } from '@/lib/stats';

const COUNTDOWN_SEC = 3;

interface Result {
  score: number;
  hits: number;
  misses: number;
  completedWords: number;
  kpm: number;
  accuracy: number;
}

export interface SoloConfig {
  durationSec: number;
  wordListTitle?: string;
  // 単語リストID。登録済みリストなら共有URLに埋め込んで同じモードを再現できる('upload'は不可)
  wordListId?: string;
}

interface Props {
  words: { display: string; reading: string }[];
  config: SoloConfig;
  onExit: () => void;
  onHome: () => void;
}

export default function SoloGame({ words, config, onExit, onHome }: Props) {
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'playing' | 'result'>('ready');
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [result, setResult] = useState<Result | null>(null);
  const [ghostName, setGhostName] = useState('');
  const [ghostSaved, setGhostSaved] = useState(false);
  // 設定モーダルを開いている間は Space/Esc のショートカットを止める
  const settingsOpenRef = useRef(false);

  const finishWith = (g: { result: () => Result }) => {
    setResult(g.result());
    setPhase('result');
    // プレイ数を計上(ベストエフォート)
    recordPlay('solo', ruleKeyFor(config.wordListId, config.durationSec));
  };

  const { snap, start, gameRef, getRecording } = usePlayerGame({
    onTimeUp: finishWith,
  });

  useEffect(() => {
    setGhostName(loadNamePref());
  }, []);

  // 直近プレイをゴーストファイル(.ghost.json)としてダウンロード
  const saveGhost = () => {
    const g = gameRef.current;
    if (!g || !result) return;
    const name = ghostName.trim().slice(0, 20) || 'ゲスト';
    setNamePref(name);
    const ghost = createGhost({
      playerName: name,
      rule: { durationSec: config.durationSec, inputMode: g.inputMode },
      words: g.words, // シャッフル後の実際の順序
      keys: getRecording(),
      stats: result,
      recordedAt: new Date().toISOString(),
    });
    const blob = new Blob([JSON.stringify(ghost)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const ts = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '');
    a.download = `${name}@${ts}.ghost.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setGhostSaved(true);
  };

  // カウントダウン(3,2,1)→ 開始。初回・リトライ共通
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
      start(words, { durationSec: config.durationSec });
      setGhostSaved(false);
      setPhase('playing');
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 開始前: Space で開始 / Esc で戻る。リザルト: Space で同じモード再プレイ / Esc でトップへ。
  // (名前入力中は無視)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
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

  const ruleText = `${config.wordListTitle ? `${config.wordListTitle} / ` : ''}${config.durationSec}秒`;

  if (phase === 'ready') {
    return (
      <section className="screen-box countdown-box">
        <h2>ソロプレイ</h2>
        <p className="room-rules" data-testid="solo-rule">{ruleText}</p>
        <div className="button-row">
          <button className="primary" data-testid="solo-begin" onClick={() => setPhase('countdown')}>
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
        <p className="room-rules">{ruleText}</p>
        <p className="countdown-label">まもなく開始</p>
        <p className="countdown-number" data-testid="countdown">{countdown}</p>
      </section>
    );
  }

  if (phase === 'result' && result) {
    return (
      <section className="screen-box">
        <h2>結果</h2>
        <p className="room-rules" data-testid="result-rule">{ruleText}</p>
        <p className="result-score" data-testid="result-score">{result.score}</p>
        <table className="result-table">
          <tbody>
            <tr><th>正解タイプ数</th><td>{result.hits}</td></tr>
            <tr><th>ミス</th><td>{result.misses}</td></tr>
            <tr><th>KPM(打鍵/分)</th><td>{result.kpm}</td></tr>
            <tr><th>正確率</th><td>{result.accuracy}%</td></tr>
            <tr><th>完了したお題</th><td>{result.completedWords}</td></tr>
          </tbody>
        </table>
        <div className="button-row">
          <button className="primary" data-testid="solo-same-mode" onClick={() => setPhase('countdown')}>
            同じモードで遊ぶ <kbd>Space</kbd>
          </button>
          <button onClick={onHome}>トップに戻る <kbd>Esc</kbd></button>
        </div>
        <ShareButtons
          result={{ ...result, rule: ruleText }}
          wordListTitle={config.wordListTitle}
          replay={
            config.wordListId && config.wordListId !== 'upload'
              ? { t: config.durationSec, list: config.wordListId }
              : null
          }
        />
        <div className="ghost-save-row">
          <input
            className="name-input"
            type="text"
            maxLength={20}
            placeholder="名前(ゴーストに記録)"
            value={ghostName}
            data-testid="ghost-name-input"
            onChange={(e) => setGhostName(e.target.value)}
          />
          <button data-testid="ghost-save" onClick={saveGhost}>
            {ghostSaved ? '保存しました' : '👻 ゴーストとして保存'}
          </button>
        </div>
        <p className="hint">保存した .ghost.json はホームの「ゴースト対戦」で使えます</p>
      </section>
    );
  }

  if (!snap) return null;

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
      <WordArea snap={snap} />
      <p className="hint">Esc でやめる</p>
    </section>
  );
}

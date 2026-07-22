'use client';

// ゴースト対戦(/ghost)。録画されたプレイ(ゴースト)を選んで同じお題で競争する。
// ゴースト選択画面とゲーム本体は同じURLのまま内部stateで切り替える(playing)。
//
// クエリパラメータ ?ghost=<ゴーストID> があれば、そのゴーストでそのまま対戦に入る。
// (制限時間・お題はゴーストファイルに埋め込まれているので ghost だけで足りる)
// 対戦開始時にURLも同じ形に揃えるので、リザルト画面のURLがそのまま共有・ブックマーク可能。

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import GhostGame from '@/components/GhostGame';
import { validateGhost, verifyGhost, ENGINE_VERSION } from '@/lib/engine/ghost';
import { EMPTY_CATALOG, fetchCatalog, ghostUrl } from '@/lib/dictsource';
import type { Catalog } from '@/components/modeTypes';
import { Field, Select } from '@/components/Controls';

export default function GhostPage() {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);

  // ゴーストのカタログ(snstyping-dict の GitHub Pages から実行時取得)
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  useEffect(() => {
    fetchCatalog().then(setCatalog);
  }, []);

  // '' = カタログ取得待ち / 'file' = ローカルファイルから
  const [ghostId, setGhostId] = useState('');
  useEffect(() => {
    // カタログが来たら「デモ ふつう」を既定選択にする(ユーザー操作後は変えない)。
    // カタログ取得前(空)は既定を確定せず、'file' に落ちてしまうのを防ぐ。
    if (catalog.ghosts.length === 0) return;
    const preferred = catalog.ghosts.find((g) => g.id === 'demo') ?? catalog.ghosts[0];
    setGhostId((cur) => cur || preferred.id);
  }, [catalog]);
  const [ghost, setGhost] = useState<any>(null);
  const [ghostError, setGhostError] = useState('');
  const [ghostWarn, setGhostWarn] = useState('');
  const [ghostFileTitle, setGhostFileTitle] = useState(''); // 読み込み済みファイルの表示名

  // URLのクエリ ?ghost=<ID> があればそのゴーストを選び、読み込め次第そのまま対戦に入る
  const autoStartRef = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('ghost');
    if (id && id !== 'file') {
      setGhostId(id);
      autoStartRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 登録済みゴーストなら共有可能なURL。ローカルファイル(=in-memory)は共有不可。
  const sameModeHref = ghostId && ghostId !== 'file' ? `/ghost?ghost=${encodeURIComponent(ghostId)}` : null;

  // 対戦開始。開始時にURLも設定に揃える(リザルトのURLがそのまま共有可能になる)。
  const startPlaying = () => {
    if (sameModeHref) router.replace(sameModeHref);
    setPlaying(true);
  };

  // ゴーストが読み込めたら、URL指定(autoStart)のときは自動で対戦に入る
  useEffect(() => {
    if (autoStartRef.current && ghost && !playing) {
      autoStartRef.current = false;
      startPlaying();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, playing]);

  // 読み込んだゴーストを検証してセットする(レジストリ・ローカルファイル共通)
  const acceptGhost = (data: unknown) => {
    setGhost(null);
    setGhostWarn('');
    const err = validateGhost(data);
    if (err) {
      setGhostError(err);
      return;
    }
    const g = data as any;
    // エンジンが変わってリプレイがずれていないか確認(ずれても記録値で勝敗は付く)
    if (g.engineVersion !== ENGINE_VERSION || !verifyGhost(g).ok) {
      setGhostWarn('このゴーストは古いエンジンで録画されています。再生が実際のプレイと少しずれる可能性があります。');
    }
    setGhostError('');
    setGhost(g);
  };

  useEffect(() => {
    if (ghostId === 'file') {
      // 「ファイルから読み込む…」選択直後(未選択なら対戦ボタンは無効のまま)
      setGhost(null);
      setGhostError('');
      setGhostWarn('');
      return;
    }
    const entry = catalog.ghosts.find((g) => g.id === ghostId);
    if (!entry) return;
    setGhost(null);
    setGhostError('');
    fetch(ghostUrl(entry.file))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(acceptGhost)
      .catch(() => setGhostError('ゴーストの読み込みに失敗しました'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostId, catalog]);

  const pickGhostFile = (file: File | undefined) => {
    if (!file) return;
    file
      .text()
      .then((text) => {
        acceptGhost(JSON.parse(text));
        setGhostFileTitle(file.name.replace(/\.ghost\.json$|\.json$/i, ''));
      })
      .catch(() => setGhostError('ゴーストファイルを読み込めませんでした'));
  };

  // 選択画面では Space で対戦開始、Esc でメニューへ戻る。
  // (ゲーム中は GhostGame 側が Space/Esc を扱うのでここでは何もしない)
  useEffect(() => {
    if (playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.push('/');
        return;
      }
      if (e.code !== 'Space' && e.key !== ' ') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'SELECT' || el.tagName === 'INPUT')) return;
      e.preventDefault();
      if (ghost) startPlaying();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ghost, router]);

  if (playing && ghost) {
    return (
      <main className="app">
        <GhostGame ghost={ghost} ghostId={ghostId} onExit={() => setPlaying(false)} onHome={() => router.push('/')} />
      </main>
    );
  }

  return (
    <main className="app">
      <section className="screen-box">
        <h2>ゴースト対戦</h2>
        <p className="lobby-title">録画されたプレイと同じお題で競争します</p>
        <div className="card-settings">
          <Field label="ゴースト">
            <Select value={ghostId} onChange={(e) => setGhostId(e.target.value)} data-testid="ghost-select">
              {catalog.ghosts.map((g: { id: string; title: string }) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
              <option value="file">
                {ghostFileTitle ? `ファイル: ${ghostFileTitle}` : 'ファイルから読み込む…'}
              </option>
            </Select>
          </Field>
          {ghostId === 'file' && (
            <label className="ghost-file-label">
              ファイルを選択(.ghost.json)
              <input
                type="file"
                accept=".json,application/json"
                data-testid="ghost-file"
                onChange={(e) => pickGhostFile(e.target.files?.[0])}
              />
            </label>
          )}
          {ghost && (
            <p className="word-source" data-testid="ghost-summary">
              👻 {ghost.player.name} / {ghost.rule.durationSec}秒 / {ghost.words.length}語
              {ghost.stats?.kpm != null ? ` / KPM ${ghost.stats.kpm}` : ''}
            </p>
          )}
          {ghostError && <p className="notice">{ghostError}</p>}
          {ghostWarn && <p className="notice">{ghostWarn}</p>}
        </div>
        <div className="button-row">
          <button
            className="primary"
            data-testid="ghost-start"
            disabled={!ghost}
            onClick={startPlaying}
          >
            対戦する <kbd>Space</kbd>
          </button>
          <button onClick={() => router.push('/')}>戻る <kbd>Esc</kbd></button>
        </div>
      </section>
    </main>
  );
}

'use client';

// オンライン対戦(/online)。公開ルーム一覧への参加/ランダム参加と、部屋の新規作成。
// 一覧画面と作成画面は同じURLのまま内部stateで切り替える(view)。

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EMPTY_CATALOG, fetchCatalog, findWordList, groupWordsByCategory } from '@/lib/dictsource';
import { REALTIME_URL } from '@/lib/realtime';
import type { WordList, Catalog } from '@/components/modeTypes';
import { Field, RadioGroup, SegmentedControl, Select, Toggle } from '@/components/Controls';

export default function OnlinePage() {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'create'>('list');

  // 辞書のカタログ(ルールの単語リスト名表示に使う)
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  useEffect(() => {
    fetchCatalog().then(setCatalog);
  }, []);

  // ---- 部屋作成 ----
  const [ruleType, setRuleType] = useState<'propose' | 'host'>('propose');
  const [vsDurationSec, setVsDurationSec] = useState(60);
  const [vsWordListId, setVsWordListId] = useState('basic');
  const [vsMaxPlayers, setVsMaxPlayers] = useState(2);
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // 公開ルーム一覧(一覧画面にいる間だけポーリング)
  interface PublicRoom {
    code: string;
    ruleType: 'propose' | 'host';
    rule: { durationSec: number; wordListId: string } | null;
    players: string[];
    playerCount: number;
    maxPlayers?: number; // 旧サーバーのエントリには無いことがある(既定2)
    spectatorCount: number;
    state: string;
    updatedAt: number; // Directory が最後に生存を確認した時刻(ランダム参加の優先度に使う)
  }
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [roomsRefreshing, setRoomsRefreshing] = useState(false);

  const loadPublicRooms = useCallback(async () => {
    setRoomsRefreshing(true);
    try {
      const res = await fetch(`${REALTIME_URL}/api/rooms`);
      if (res.ok) setPublicRooms(await res.json());
    } catch {
      // 一覧はベストエフォート
    } finally {
      setRoomsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'list') return;
    loadPublicRooms();
    const id = setInterval(loadPublicRooms, 5000);
    return () => clearInterval(id);
  }, [view, loadPublicRooms]);

  const createRoom = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`${REALTIME_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleType,
          // 幹事方式のときだけ、この画面の設定を部屋のルールとして固定する
          rule: ruleType === 'host'
            ? { durationSec: vsDurationSec, wordListId: vsWordListId }
            : undefined,
          isPublic,
          maxPlayers: vsMaxPlayers,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { code } = await res.json();
      router.push(`/room/${code}`);
    } catch {
      setCreateError('部屋の作成に失敗しました。時間をおいて再試行してください。');
      setCreating(false);
    }
  };

  // まだ相手を募集中の公開ルーム(参加できる=満員でない部屋)
  const joinableRooms = publicRooms.filter((r) => r.playerCount < (r.maxPlayers ?? 2));

  // ランダムに1つ選んで参加する。ただし「最近まで人がいたことを確認できた」部屋ほど
  // 選ばれやすくする(updatedAt が新しい順に指数的な重みを掛ける)ことで、
  // ゾンビ寸前の古い部屋に飛ばされにくくする。
  const joinRandomRoom = () => {
    if (joinableRooms.length === 0) return;
    const sorted = [...joinableRooms].sort((a, b) => b.updatedAt - a.updatedAt);
    const weights = sorted.map((_, i) => Math.pow(0.6, i));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let x = Math.random() * total;
    let pick = sorted[0];
    for (let i = 0; i < sorted.length; i++) {
      x -= weights[i];
      if (x <= 0) {
        pick = sorted[i];
        break;
      }
    }
    router.push(`/room/${pick.code}`);
  };

  // キーボード操作。
  //   共通:   Esc = 戻る(作成画面→一覧 / 一覧→メニュー)
  //   一覧:   n = ルームを作成 / j = ランダムに参加 / 1〜9 = その番号の公開ルームへ
  //   作成:   Space = ルームを作成
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        e.preventDefault();
        if (view === 'create') setView('list');
        else router.push('/');
        return;
      }
      if (view === 'create') {
        if (e.code !== 'Space' && e.key !== ' ') return;
        if (typing) return;
        e.preventDefault();
        if (!creating) void createRoom();
        return;
      }
      // ---- 一覧画面 ----
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setView('create');
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        joinRandomRoom();
      } else if (e.key >= '1' && e.key <= '9') {
        // 表示順の上から数えた番号(最大9)でその部屋へ。満員なら観戦になる。
        const room = publicRooms[Number(e.key) - 1];
        if (room) {
          e.preventDefault();
          router.push(`/room/${room.code}`);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, creating, ruleType, vsDurationSec, vsWordListId, vsMaxPlayers, isPublic, publicRooms, router]);

  if (view === 'create') {
    return (
      <main className="app">
        <section className="screen-box">
          <h2>ルームを作成</h2>
          <Field label="対戦人数(上限)">
            <SegmentedControl<number>
              value={vsMaxPlayers}
              data-testid="vs-max-players"
              onChange={setVsMaxPlayers}
              options={[
                { value: 2, label: '2人' },
                { value: 3, label: '3人' },
                { value: 4, label: '4人' },
              ]}
            />
          </Field>
          <p className="lobby-title">対戦ルールの決め方を選んでください</p>
          <RadioGroup<'propose' | 'host'>
            name="ruleType"
            value={ruleType}
            onChange={setRuleType}
            data-testid="rule-type"
            options={[
              { value: 'propose', label: '提案方式(毎試合、参加者全員の提案からランダムで決定)' },
              { value: 'host', label: '幹事方式(あなたが今ここで決める)' },
            ]}
          />
          {ruleType === 'host' && (
            <div className="proposal-row">
              <SegmentedControl<number>
                value={vsDurationSec}
                data-testid="vs-duration-select"
                onChange={setVsDurationSec}
                options={[
                  { value: 30, label: '30秒' },
                  { value: 60, label: '60秒' },
                  { value: 120, label: '120秒' },
                ]}
              />
              <Select value={vsWordListId} data-testid="vs-wordlist-select" onChange={(e) => setVsWordListId(e.target.value)}>
                {groupWordsByCategory(catalog).map((g) => (
                  <optgroup key={g.category} label={g.category}>
                    {g.lists.map((l: WordList) => (
                      <option key={l.id} value={l.id}>{l.title}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
          )}
          <Toggle
            label="部屋を公開する(公開ルーム一覧に表示され、誰でも参加できます)"
            checked={isPublic}
            data-testid="public-toggle"
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <div className="button-row">
            <button className="primary" data-testid="create-room" disabled={creating} onClick={createRoom}>
              {creating ? '作成中…' : 'ルームを作成'} <kbd>Space</kbd>
            </button>
            <button onClick={() => setView('list')}>戻る <kbd>Esc</kbd></button>
          </div>
          {createError && <p className="notice">{createError}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="screen-box">
        <h2>オンライン対戦</h2>
        <div className="button-row">
          <button className="primary" data-testid="versus-open" onClick={() => setView('create')}>
            ルームを作成… <kbd>N</kbd>
          </button>
          <button
            data-testid="join-random"
            onClick={joinRandomRoom}
            disabled={joinableRooms.length === 0}
            title={joinableRooms.length === 0 ? 'いま参加できるルームはありません' : undefined}
          >
            ランダムに参加 <kbd>J</kbd>
          </button>
          <button onClick={() => router.push('/')}>戻る <kbd>Esc</kbd></button>
        </div>
        <section className="public-rooms" data-testid="public-rooms">
          <div className="public-rooms-head">
            <h2>公開ルーム</h2>
            <button
              type="button"
              className="rooms-refresh"
              data-testid="rooms-refresh"
              onClick={loadPublicRooms}
              disabled={roomsRefreshing}
              aria-label="公開ルーム一覧を更新"
              title="更新"
            >
              <svg
                className={roomsRefreshing ? 'spin' : undefined}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>
          {publicRooms.length === 0 ? (
            <p className="public-rooms-empty">いま公開されているルームはありません。「ルームを作成…」から作ってみよう</p>
          ) : (
            <ul className="room-list">
              {publicRooms.map((r, i) => {
                const maxPlayers = r.maxPlayers ?? 2;
                const joinable = r.playerCount < maxPlayers;
                const num = i < 9 ? i + 1 : null; // 上から9室までキーボードで参加可
                const ruleText = r.ruleType === 'host' && r.rule
                  ? `${findWordList(catalog, r.rule.wordListId)?.title ?? r.rule.wordListId} / ${r.rule.durationSec}秒`
                  : 'ルールはロビーで提案';
                const stateText = !joinable
                  ? `満員(観戦${r.spectatorCount > 0 ? ` ${r.spectatorCount}人` : '可'})`
                  : r.state === 'playing'
                    ? `対戦中・途中参加可(${r.playerCount}/${maxPlayers})`
                    : `対戦相手を募集中(${r.playerCount}/${maxPlayers})`;
                return (
                  <li key={r.code} className="room-list-item">
                    {num != null && <span className="room-list-num" aria-hidden="true">{num}</span>}
                    <div className="room-list-info">
                      <span className="room-list-players">{r.players.join('、')}</span>
                      <span className="room-list-rule">{ruleText}</span>
                      <span className="room-list-state">{stateText}</span>
                    </div>
                    <button
                      className={joinable ? 'primary' : ''}
                      data-testid={`join-${r.code}`}
                      onClick={() => router.push(`/room/${r.code}`)}
                    >
                      {joinable ? '参加する' : '観戦する'}
                      {num != null && <> <kbd>{num}</kbd></>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

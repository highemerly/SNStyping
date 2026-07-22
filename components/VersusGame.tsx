'use client';

// ルームコード対戦。WebSocket でサーバーに接続し、進捗を相互に中継する。
//
// プレイヤーの流れ: 名前入力 → ロビー(ルール提案 or 幹事ルール確認 + Spaceで準備OK)
//   → 接続中の全員(2人以上)が準備OKでカウントダウン(3,2,1) → 対戦 → 結果
//   → Space か ボタンでロビーへ戻って再戦
// 同時対戦できる人数は部屋を作った人が決めた上限(2〜4人)まで。満員の部屋に入ると
// 自動的に観戦者になり、全プレイヤーの打鍵の様子を並べて見られる。
// 対戦画面は「自分=アクセント枠の大パネル」「相手=小型カード(進捗+打鍵の様子)」。
// 対戦中に誰かが切断しても2人以上残っていれば試合は続行される。
// Esc はどの画面でも即退出せず、確認ダイアログを挟む。

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import WordArea, { RomajiText } from './WordArea';
import { usePlayerGame } from './usePlayerGame';
import SettingsModal from './SettingsModal';
import { SegmentedControl, Select } from './Controls';
import { loadInputModePref, loadNamePref, setNamePref, type InputMode } from './settings';
import { loadSoundPref, soundCount, soundGo, soundTick } from './sound';
import { roomWsUrl } from '@/lib/realtime';
import { EMPTY_CATALOG, fetchCatalog, findWordList } from '@/lib/dictsource';

// 進捗送信の最短間隔。打鍵ごとに送らず間引く(通信量とWorker側の課金リクエスト数を抑える)
const PROGRESS_INTERVAL_MS = 250;

type Phase = 'name' | 'connecting' | 'waiting' | 'roulette' | 'countdown' | 'playing' | 'waitResult' | 'result' | 'error';
type Role = 'player' | 'spectator';

const PROPOSAL_STORAGE_KEY = 'snstyping:proposal';

interface Rule {
  durationSec: number;
  wordListId: string;
}

interface Word {
  display: string;
  reading: string;
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

interface Stats {
  score: number;
  hits: number;
  misses: number;
  completedWords: number;
  kpm: number;
  accuracy: number;
}

// 自分以外のプレイヤー(観戦者から見た場合は全プレイヤー)のロビー状態
interface PeerInfo {
  name: string;
  ready: boolean;
  proposal: Rule | null;
  inLobby: boolean; // ロビーに居るか(リザルト画面との区別)
}

const PROGRESS_ZERO: Progress = { score: 0, misses: 0, kpm: 0, completedWords: 0, wordProgress: 0, typed: '', rest: '' };
const DEFAULT_RULE: Rule = { durationSec: 60, wordListId: 'basic' };

export default function VersusGame({ code }: { code: string }) {
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);
  const countTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rouletteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerIdRef = useRef(0);
  const phaseRef = useRef<Phase>('name');
  const roleRef = useRef<Role>('player');

  const [phase, setPhase] = useState<Phase>('name');
  const [role, setRole] = useState<Role>('player');
  const [myName, setMyName] = useState('');
  const [joinedName, setJoinedName] = useState<string | null>(null); // 参加確定した名前(WS接続トリガー)
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [playerCount, setPlayerCount] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [resultStats, setResultStats] = useState<Record<number, Stats | null> | null>(null);
  const [walkover, setWalkover] = useState(false); // 相手全員の切断による不戦勝リザルトか
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  // ロビーに表示する現在の入力方式(設定モーダルを閉じたら読み直す)
  const [inputMode, setInputModeLabel] = useState<InputMode>('romaji');
  useEffect(() => setInputModeLabel(loadInputModePref()), []);
  const [roomUrl, setRoomUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // 自分以外のプレイヤー(playerId → 状態)。離脱したら消える
  const [peers, setPeers] = useState<Record<number, PeerInfo>>({});
  // playerId → 表示名。離脱しても消さない(リザルトで離脱者の名前を出すため)
  const [namesById, setNamesById] = useState<Record<number, string>>({});
  // 進行中の試合の参加者(途中入室者を対戦画面に出さないため)
  const [matchIds, setMatchIds] = useState<number[]>([]);
  // playerId → 対戦中の進捗
  const [progById, setProgById] = useState<Record<number, Progress>>({});
  // 対戦中のお題(相手カード・観戦パネルの現在ワード表示に使う)
  const [matchWords, setMatchWords] = useState<Word[]>([]);

  // 退出確認ダイアログ
  const [confirmExit, setConfirmExit] = useState(false);
  const confirmRef = useRef(false);
  const setConfirm = (v: boolean) => {
    confirmRef.current = v;
    setConfirmExit(v);
  };

  // 辞書カタログ(提案の選択肢とルール表示名に使う)
  const [catalog, setCatalog] = useState<{ words: { id: string; title: string }[] }>(EMPTY_CATALOG);
  useEffect(() => {
    fetchCatalog().then(setCatalog);
  }, []);
  const ruleLabel = (rule: Rule) =>
    `${findWordList(catalog, rule.wordListId)?.title ?? rule.wordListId} / ${rule.durationSec}秒`;

  // ロビー(ルール決定)まわり
  const [ruleType, setRuleType] = useState<'propose' | 'host'>('propose');
  const [hostRule, setHostRule] = useState<Rule | null>(null);
  const [myProposal, setMyProposal] = useState<Rule>(DEFAULT_RULE);
  const [myReady, setMyReady] = useState(false);
  // 開始時に採用されたルールと提案者(カウントダウン画面用)
  const [matchInfo, setMatchInfo] = useState<{ rule: Rule; chosenBy: { playerId: number; name: string } | null } | null>(null);
  // 提案方式でルールが決まる瞬間のルーレット演出
  const [roulette, setRoulette] = useState<{ candidates: { id: number; name: string; rule: Rule }[]; winnerIdx: number } | null>(null);
  const [rouletteHi, setRouletteHi] = useState(0); // 現在ハイライト中の候補
  const [rouletteLanded, setRouletteLanded] = useState(false); // 停止して当選が確定したか

  const myReadyRef = useRef(false);
  const setReadyState = (v: boolean) => {
    myReadyRef.current = v;
    setMyReady(v);
  };

  // WS effect 内(固定クロージャ)から現在値を読むための ref 橋渡し
  const myProposalRef = useRef(myProposal);
  const myNameRef = useRef(myName);
  const peersRef = useRef(peers);
  const namesRef = useRef(namesById);
  const matchIdsRef = useRef(matchIds);
  myProposalRef.current = myProposal;
  myNameRef.current = myName;
  peersRef.current = peers;
  namesRef.current = namesById;
  matchIdsRef.current = matchIds;

  const changePhase = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const send = (msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  // 進捗のスロットリング: 最新値だけ保持し、間隔を空けて送信(トレーリングあり)
  const lastSentAtRef = useRef(0);
  const pendingProgressRef = useRef<object | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushProgress = () => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (pendingProgressRef.current) {
      send(pendingProgressRef.current);
      pendingProgressRef.current = null;
      lastSentAtRef.current = Date.now();
    }
  };

  const queueProgress = (payload: object) => {
    pendingProgressRef.current = payload;
    const elapsed = Date.now() - lastSentAtRef.current;
    if (elapsed >= PROGRESS_INTERVAL_MS) {
      flushProgress();
    } else if (!progressTimerRef.current) {
      progressTimerRef.current = setTimeout(flushProgress, PROGRESS_INTERVAL_MS - elapsed);
    }
  };

  const { snap, start, stop, gameRef } = usePlayerGame({
    blocked: () => confirmRef.current,
    onEvent: (_ev, g) => {
      const line = g.current;
      const typed = line?.typedKeys ?? '';
      const rest = line?.remainingText() ?? '';
      const usedSec = g.durationSec - g.remainingSec(performance.now());
      queueProgress({
        t: 'progress',
        score: g.stats.score,
        misses: g.stats.misses,
        completedWords: g.stats.completedWords,
        kpm: usedSec > 1 ? Math.round((g.stats.hits * 60) / usedSec) : 0,
        wordProgress: typed.length + rest.length > 0 ? typed.length / (typed.length + rest.length) : 0,
        // 相手・観戦者が打鍵の様子を再現するための情報
        typed,
        rest,
      });
    },
    onTimeUp: (g) => {
      flushProgress();
      send({ t: 'done', stats: g.result() });
      changePhase('waitResult');
    },
  });

  useEffect(() => {
    setRoomUrl(`${location.origin}/room/${code}`);
    setMyName(loadNamePref());
    loadSoundPref(); // URLから直接来た参加者もホームの設定なしで効果音の設定を復元できる
    try {
      const saved = JSON.parse(localStorage.getItem(PROPOSAL_STORAGE_KEY) ?? 'null');
      if (saved?.durationSec) setMyProposal({ durationSec: saved.durationSec, wordListId: saved.wordListId ?? 'basic' });
    } catch {
      // 壊れた保存値は無視
    }
  }, [code]);

  const join = () => {
    const name = myName.trim().slice(0, 20) || 'ゲスト';
    setNamePref(name);
    setMyName(name);
    setJoinedName(name);
    changePhase('connecting');
  };

  const sendReady = () => {
    if (myReadyRef.current || roleRef.current !== 'player') return;
    localStorage.setItem(PROPOSAL_STORAGE_KEY, JSON.stringify(myProposal));
    send({ t: 'ready', proposal: myProposal });
    setReadyState(true);
  };
  const sendReadyRef = useRef(sendReady);
  sendReadyRef.current = sendReady;

  // リザルト画面 → ロビーへ(他のメンバーに通知する)
  const goLobby = () => {
    send({ t: 'lobby' });
    changePhase('waiting');
  };
  const goLobbyRef = useRef(goLobby);
  goLobbyRef.current = goLobby;

  // WebSocket 接続とメッセージ処理(名前確定後に接続)
  useEffect(() => {
    if (!joinedName) return;
    const clearCount = () => {
      if (countTimerRef.current) {
        clearInterval(countTimerRef.current);
        countTimerRef.current = null;
      }
    };
    const clearRoulette = () => {
      if (rouletteTimerRef.current) {
        clearTimeout(rouletteTimerRef.current);
        rouletteTimerRef.current = null;
      }
    };

    const beginMatch = (msg: {
      words: Word[];
      durationSec: number;
      wordListId: string;
      chosenBy: { playerId: number; name: string } | null;
      countdownMs: number;
    }) => {
      // 提案・参加者はこの時点のスナップショットから読む(直後に setPeers でリセットするため)
      const peersSnapshot = peersRef.current;
      setNotice('');
      setResultStats(null);
      setWalkover(false);
      setReadyState(false);
      setPeers((m) => {
        const next: Record<number, PeerInfo> = {};
        for (const [id, p] of Object.entries(m)) {
          next[Number(id)] = { ...p, ready: false, proposal: null, inLobby: false };
        }
        return next;
      });
      setProgById({});
      setMatchWords(msg.words);
      const ids = Object.keys(peersSnapshot).map(Number);
      if (roleRef.current === 'player') ids.push(playerIdRef.current);
      setMatchIds(ids.sort((a, b) => a - b));
      const rule: Rule = { durationSec: msg.durationSec, wordListId: msg.wordListId };
      setMatchInfo({ rule, chosenBy: msg.chosenBy ?? null });

      const startCountdown = () => {
        changePhase('countdown');
        let remain = Math.ceil(msg.countdownMs / 1000);
        setCountdown(remain);
        soundCount();
        clearCount();
        countTimerRef.current = setInterval(() => {
          remain -= 1;
          if (remain <= 0) {
            clearCount();
            soundGo();
            if (roleRef.current === 'player') {
              start(msg.words, { durationSec: msg.durationSec, shuffle: false });
            }
            changePhase('playing');
          } else {
            setCountdown(remain);
            soundCount();
          }
        }, 1000);
      };

      // 提案方式では、全員の提案からどれが採用されたかをルーレットで見せる。
      // 全プレイヤーが同じ演出を挟むので相対的な開始タイミングはずれない。
      const myProp = myProposalRef.current;
      const peerCands = Object.entries(peersSnapshot)
        .map(([id, p]) => ({ id: Number(id), name: p.name, rule: p.proposal }))
        .filter((c): c is { id: number; name: string; rule: Rule } => c.rule != null);
      if (roleRef.current === 'player' && msg.chosenBy && myProp && peerCands.length > 0) {
        clearRoulette();
        // playerId 順に並べる(全クライアントで同じ並びになる)。
        // 当選者のカードは実際に採用されたルール、それ以外は提案そのもの。
        const chosenId = msg.chosenBy.playerId;
        const candidates = [
          { id: playerIdRef.current, name: `${myNameRef.current || 'あなた'}(あなた)`, rule: myProp },
          ...peerCands,
        ]
          .sort((a, b) => a.id - b.id)
          .map((c) => (c.id === chosenId ? { ...c, rule } : c));
        const winnerIdx = candidates.findIndex((c) => c.id === chosenId);
        if (winnerIdx < 0) {
          // 当選者の提案が手元に無い(直前に入れ替わった等)場合は演出なしで開始
          startCountdown();
          return;
        }
        setRoulette({ candidates, winnerIdx });
        setRouletteLanded(false);
        changePhase('roulette');

        // だんだん減速して当選候補で止まるスロット風のスケジュール
        const intervals = [90, 90, 100, 110, 130, 160, 200, 250, 310, 390];
        const T = intervals.length;
        const N = candidates.length;
        const startIdx = (((winnerIdx - (T - 1)) % N) + N) % N; // 最後のtickが当選側になるよう位相を合わせる
        let j = 0;
        setRouletteHi(startIdx);
        const tick = () => {
          setRouletteHi((startIdx + j) % N);
          soundTick();
          if (j >= T - 1) {
            setRouletteLanded(true);
            soundGo();
            rouletteTimerRef.current = setTimeout(startCountdown, 850);
            return;
          }
          rouletteTimerRef.current = setTimeout(() => {
            j += 1;
            tick();
          }, intervals[j]);
        };
        tick();
      } else {
        startCountdown();
      }
    };

    const handleMessage = (msg: any) => {
      switch (msg.t) {
        case 'joined': {
          setPlayerCount(msg.playerCount);
          setMaxPlayers(msg.maxPlayers ?? 2);
          setSpectatorCount(msg.spectatorCount ?? 0);
          setRuleType(msg.ruleType === 'host' ? 'host' : 'propose');
          setHostRule(msg.rule ?? null);
          const isSpec = msg.role === 'spectator';
          const list: any[] = (isSpec ? msg.players : msg.peers) ?? [];
          const map: Record<number, PeerInfo> = {};
          const names: Record<number, string> = {};
          for (const p of list) {
            map[p.playerId] = { name: p.name ?? 'ゲスト', ready: !!p.ready, proposal: p.proposal ?? null, inLobby: true };
            names[p.playerId] = p.name ?? 'ゲスト';
          }
          setPeers(map);
          setNamesById(names);
          if (isSpec) {
            roleRef.current = 'spectator';
            setRole('spectator');
            if (msg.state === 'playing' && msg.words && msg.match) {
              setMatchWords(msg.words);
              setMatchIds(list.map((p) => p.playerId));
              setMatchInfo({ rule: msg.match, chosenBy: null });
              changePhase('playing');
            } else {
              changePhase('waiting');
            }
          } else {
            playerIdRef.current = msg.playerId;
            if (msg.state === 'playing') {
              // 対戦中の部屋に空席があって入れた場合。今の試合が終わるまでロビーで待つ
              setNotice('いま対戦中の試合があります。終わり次第、次の試合に参加できます。');
            }
            changePhase('waiting');
          }
          break;
        }
        case 'peer_joined':
          setPlayerCount(msg.playerCount);
          setPeers((m) => ({
            ...m,
            [msg.playerId]: { name: msg.name ?? 'ゲスト', ready: false, proposal: null, inLobby: true },
          }));
          setNamesById((m) => ({ ...m, [msg.playerId]: msg.name ?? 'ゲスト' }));
          break;
        case 'peer_left': {
          setPlayerCount(msg.playerCount);
          const leftName = namesRef.current[msg.playerId] ?? 'プレイヤー';
          // 試合が続行されるか(2人以上残っている & 試合の進行中フェーズ)
          const inMatchPhase =
            phaseRef.current === 'playing' ||
            phaseRef.current === 'waitResult' ||
            phaseRef.current === 'countdown' ||
            phaseRef.current === 'roulette';
          const matchContinues = inMatchPhase && msg.playerCount >= 2;
          setPeers((m) => {
            const next = { ...m };
            if (msg.playerId != null) delete next[msg.playerId];
            if (!matchContinues) {
              // サーバー側で準備状態は全員リセットされる
              for (const id of Object.keys(next)) {
                next[Number(id)] = { ...next[Number(id)], ready: false, proposal: null };
              }
            }
            return next;
          });
          if (matchContinues) break; // 残りのメンバーで試合はそのまま続く
          setReadyState(false);
          if (roleRef.current === 'player') {
            if (phaseRef.current === 'playing' || phaseRef.current === 'waitResult') {
              // 対戦相手が全員切断したら不戦勝。残った側(自分)の成績でリザルトを出す
              const myStats = gameRef.current?.result() ?? null;
              stop();
              clearCount();
              clearRoulette();
              const myId = playerIdRef.current;
              const stats: Record<number, Stats | null> = { [myId]: myStats };
              for (const id of matchIdsRef.current) {
                if (id !== myId) stats[id] = null;
              }
              setResultStats(stats);
              setWalkover(true);
              changePhase('result');
            } else if (phaseRef.current !== 'waiting' && phaseRef.current !== 'connecting') {
              // カウントダウン・抽選中など、まだ対戦が始まっていない段階は待機に戻す
              stop();
              clearCount();
              clearRoulette();
              setNotice(`${leftName}が退出しました。新しい相手を待っています。`);
              changePhase('waiting');
            }
          } else {
            clearCount();
            clearRoulette();
            setNotice(`${leftName}が退出しました。`);
            if (phaseRef.current !== 'connecting') changePhase('waiting');
          }
          break;
        }
        case 'peer_ready':
          setPeers((m) => ({
            ...m,
            [msg.playerId]: {
              ...(m[msg.playerId] ?? { name: namesRef.current[msg.playerId] ?? 'ゲスト' }),
              ready: true,
              proposal: msg.proposal ?? null,
              inLobby: true,
            },
          }));
          break;
        case 'peer_lobby':
          setPeers((m) =>
            m[msg.playerId] ? { ...m, [msg.playerId]: { ...m[msg.playerId], inLobby: true } } : m,
          );
          break;
        case 'spectators':
          setSpectatorCount(msg.count ?? 0);
          break;
        case 'start':
          beginMatch(msg);
          break;
        case 'peer_progress': {
          const prog: Progress = {
            score: msg.score ?? 0,
            misses: msg.misses ?? 0,
            kpm: msg.kpm ?? 0,
            completedWords: msg.completedWords ?? 0,
            wordProgress: msg.wordProgress ?? 0,
            typed: msg.typed ?? '',
            rest: msg.rest ?? '',
          };
          if (msg.playerId != null) setProgById((m) => ({ ...m, [msg.playerId]: prog }));
          break;
        }
        case 'result':
          if (
            roleRef.current === 'player' &&
            phaseRef.current !== 'playing' &&
            phaseRef.current !== 'waitResult' &&
            phaseRef.current !== 'countdown' &&
            phaseRef.current !== 'roulette'
          ) {
            // 対戦開始後に入室した自分はこの試合に参加していない。ロビーのまま待つ
            setNotice('');
            break;
          }
          stop();
          clearCount();
          clearRoulette();
          setResultStats(msg.stats);
          setWalkover(false);
          changePhase('result');
          break;
        case 'error':
          setErrorMsg(
            msg.reason === 'not_found'
              ? '部屋が見つかりません。URLが正しいか確認してください。'
              : msg.reason === 'full'
                ? 'この部屋は満室です(観戦枠も含めて上限に達しています)。'
                : msg.reason === 'idle_timeout'
                  ? 'しばらく操作がなかったため、部屋が閉じられました。'
                  : 'エラーが発生しました。',
          );
          changePhase('error');
          break;
      }
    };

    // 接続した時点で参加扱い(ルームコードと名前はURLで渡す)
    const ws = new WebSocket(roomWsUrl(code, joinedName));
    wsRef.current = ws;
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => {
      if (phaseRef.current !== 'error') {
        setErrorMsg('サーバーとの接続が切れました。ページを再読み込みしてください。');
        changePhase('error');
      }
    };
    return () => {
      ws.onclose = null;
      ws.close();
      clearCount();
      clearRoulette();
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, joinedName]);

  // Esc = 退出確認(もう一度Escで閉じる)。確認中は Enter で退出。
  // ロビーでは Space で準備OK、リザルトでは Space でロビーへ。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 設定モーダルを開いている間はモーダル側にキー操作を任せる
      // (Esc はモーダルを閉じる、名前入力中の Space で準備OKにならないように)。
      // ただし s のもう一押しでは設定を閉じる。
      if (settingsOpenRef.current) {
        if (e.key === 's' || e.key === 'S') {
          const el = document.activeElement;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
          e.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirm(!confirmRef.current);
        return;
      }
      if (confirmRef.current) {
        if (e.key === 'Enter') {
          e.preventDefault();
          router.push('/');
        }
        return;
      }
      // 待ち状態(ロビー)では s で設定を開ける。ルール提案などの入力欄に
      // フォーカスがあるときは、その文字入力を優先する。
      if ((e.key === 's' || e.key === 'S') && phaseRef.current === 'waiting') {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (e.key === ' ' && roleRef.current === 'player') {
        if (phaseRef.current === 'waiting' && !myReadyRef.current) {
          e.preventDefault();
          sendReadyRef.current();
        } else if (phaseRef.current === 'result') {
          e.preventDefault();
          goLobbyRef.current();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボード不可の環境では手動コピーしてもらう
    }
  };

  const settingsButton = (
    <p className="input-mode-line" data-testid="input-mode-line">
      入力方式: <strong>{inputMode === 'kana' ? 'かな入力' : 'ローマ字入力'}</strong>
      <button
        type="button"
        className="input-mode-settings"
        data-testid="lobby-settings"
        onClick={() => setSettingsOpen(true)}
      >
        ⚙ 設定 <kbd>S</kbd>
      </button>
    </p>
  );

  const spectatorBadge = spectatorCount > 0 && (
    <p className="spectator-count" data-testid="spectator-count">観戦: {spectatorCount}人</p>
  );

  const nameOf = (id: number) => namesById[id] ?? peers[id]?.name ?? `プレイヤー${id}`;
  const peerEntries = Object.entries(peers)
    .map(([id, p]) => ({ id: Number(id), ...p }))
    .sort((a, b) => a.id - b.id);

  // ---- 画面 ----

  let content = null;

  if (phase === 'name') {
    content = (
      <section className="screen-box">
        <h2>対戦ルーム <span className="room-code">{code}</span></h2>
        <p className="waiting-status">表示する名前を入力してください(満員の部屋では観戦になります)</p>
        <div className="name-row">
          <input
            className="name-input"
            type="text"
            maxLength={20}
            placeholder="名前(20文字まで)"
            value={myName}
            autoFocus
            data-testid="name-input"
            onChange={(e) => setMyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !confirmRef.current) join();
            }}
          />
          <button className="primary" data-testid="join-button" onClick={join}>
            入室する
          </button>
        </div>
        <p className="hint">Esc で退出</p>
      </section>
    );
  } else if (phase === 'connecting') {
    content = <section className="screen-box"><p>接続中…</p></section>;
  } else if (phase === 'error') {
    content = (
      <section className="screen-box">
        <h2>対戦ルーム</h2>
        <p className="notice" data-testid="error-message">{errorMsg}</p>
        <div className="button-row">
          <button className="primary" onClick={() => router.push('/')}>トップへ</button>
        </div>
      </section>
    );
  } else if (phase === 'waiting' && role === 'spectator') {
    const readyCount = peerEntries.filter((p) => p.ready).length;
    content = (
      <section className="screen-box">
        <h2>対戦ルーム <span className="room-code">{code}</span> <span className="spec-badge">観戦</span></h2>
        {notice && <p className="notice">{notice}</p>}
        <p className="member-list" data-testid="member-list">
          プレイヤー: {peerEntries.length ? peerEntries.map((p) => p.name).join('、') : 'なし'}
          ({playerCount}/{maxPlayers})
        </p>
        <p className="waiting-status" data-testid="spec-status">
          {peerEntries.length < 2
            ? 'プレイヤーが揃うのを待っています…'
            : `全員の準備待ち(${readyCount}/${peerEntries.length})…`}
        </p>
        {spectatorBadge}
        {settingsButton}
        <p className="hint">Esc で退出</p>
      </section>
    );
  } else if (phase === 'waiting') {
    content = (
      <section className="screen-box">
        <h2>対戦ルーム <span className="room-code">{code}</span></h2>
        {notice && <p className="notice">{notice}</p>}

        <ul className="lobby-players" data-testid="member-list">
          <li className="lobby-player me">
            <span className="me-badge">あなた</span>
            <span className="lobby-player-name">{myName}</span>
            <span className={`lobby-ready${myReady ? ' on' : ''}`}>{myReady ? '準備OK' : '準備中…'}</span>
          </li>
          {peerEntries.map((p) => (
            <li key={p.id} className="lobby-player" data-testid={`lobby-player-${p.id}`}>
              <span className="lobby-player-name">{p.name}</span>
              <span className={`lobby-ready${p.ready ? ' on' : ''}`}>
                {p.ready
                  ? `準備OK${p.proposal ? `(提案: ${ruleLabel(p.proposal)})` : ''}`
                  : p.inLobby
                    ? '準備中…'
                    : 'リザルト画面にいます'}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(maxPlayers - playerCount, 0) }, (_, i) => (
            <li key={`empty-${i}`} className="lobby-player empty">
              <span className="lobby-player-name">募集中…</span>
            </li>
          ))}
        </ul>

        {playerCount < maxPlayers && (
          <div className="room-share">
            <p>このURLを送ると、あと{maxPlayers - playerCount}人参加できます:</p>
            <div className="room-share-row">
              <code data-testid="room-url">{roomUrl}</code>
              <button onClick={copyUrl}>{copied ? 'コピーしました' : 'コピー'}</button>
            </div>
          </div>
        )}

        <div className="lobby-box">
          {ruleType === 'host' && hostRule ? (
            <p className="room-rules" data-testid="room-rules">
              ルール(幹事が決定): {ruleLabel(hostRule)}
            </p>
          ) : (
            <>
              <p className="lobby-title">対戦ルールを提案(全員の提案からランダムで決まります)</p>
              <div className="proposal-row">
                <SegmentedControl<number>
                  value={myProposal.durationSec}
                  disabled={myReady}
                  data-testid="p-duration-select"
                  options={[
                    { value: 30, label: '30秒' },
                    { value: 60, label: '60秒' },
                    { value: 120, label: '120秒' },
                  ]}
                  onChange={(durationSec) => setMyProposal({ ...myProposal, durationSec })}
                />
                <Select
                  value={myProposal.wordListId}
                  disabled={myReady}
                  data-testid="p-wordlist-select"
                  onChange={(e) => setMyProposal({ ...myProposal, wordListId: e.target.value })}
                >
                  {catalog.words.map((l: { id: string; title: string }) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </Select>
              </div>
            </>
          )}

          <button
            className="primary"
            data-testid="ready-button"
            disabled={myReady}
            onClick={sendReady}
          >
            {myReady ? '全員の準備を待っています…' : '準備OK'} <kbd>Space</kbd>
          </button>

          {maxPlayers > 2 && (
            <p className="peer-status">2人以上そろっていれば、全員の準備OKで対戦が始まります</p>
          )}
        </div>
        {spectatorBadge}
        {settingsButton}
        <p className="hint">Esc で退出</p>
      </section>
    );
  } else if (phase === 'roulette' && roulette) {
    content = (
      <section className="screen-box countdown-box roulette-box">
        <p className="countdown-label">{rouletteLanded ? 'ルール決定!' : 'ルール抽選中…'}</p>
        <div className="roulette-cards">
          {roulette.candidates.map((c, i) => {
            const active = rouletteHi === i;
            const won = rouletteLanded && roulette.winnerIdx === i;
            return (
              <div
                key={i}
                className={`roulette-card${active ? ' active' : ''}${won ? ' won' : ''}`}
                data-testid={`roulette-card-${i}`}
              >
                <p className="roulette-card-name">{c.name}</p>
                <p className="roulette-card-rule">{ruleLabel(c.rule)}</p>
              </div>
            );
          })}
        </div>
        <p className="roulette-winner" data-testid="roulette-winner">
          {rouletteLanded ? `${roulette.candidates[roulette.winnerIdx].name}の提案に決定!` : ' '}
        </p>
      </section>
    );
  } else if (phase === 'countdown') {
    content = (
      <section className="screen-box countdown-box">
        {matchInfo && (
          <p className="room-rules" data-testid="chosen-rule">
            {matchInfo.chosenBy ? `${matchInfo.chosenBy.name}の提案: ` : ''}
            {ruleLabel(matchInfo.rule)}
          </p>
        )}
        <p className="countdown-label">まもなく開始</p>
        <p className="countdown-number" data-testid="countdown">{countdown}</p>
      </section>
    );
  } else if (phase === 'waitResult') {
    content = <section className="screen-box"><p data-testid="wait-result">終了! ほかのプレイヤーの結果を待っています…</p></section>;
  } else if (phase === 'result' && resultStats) {
    const isSpec = role === 'spectator';
    const myId = playerIdRef.current;
    const displayName = (id: number) => (!isSpec && id === myId ? `${myName}(あなた)` : nameOf(id));
    const entries = Object.entries(resultStats)
      .map(([id, st]) => ({ id: Number(id), st: st ?? null }))
      .sort((a, b) => (b.st?.score ?? -1) - (a.st?.score ?? -1) || a.id - b.id);
    // 同スコアは同順位(スコアが上の人数 + 1)
    const rankOf = (e: { st: Stats | null }) =>
      1 + entries.filter((o) => (o.st?.score ?? -1) > (e.st?.score ?? -1)).length;
    const mineEntry = entries.find((e) => e.id === myId) ?? null;
    const mine = mineEntry?.st ?? null;
    const topScore = entries[0]?.st?.score;
    const topEntries = entries.filter((e) => e.st != null && e.st.score === topScore);

    let banner: string;
    let bannerClass = '';
    if (isSpec) {
      banner =
        topEntries.length === 0
          ? 'FINISH'
          : topEntries.length > 1
            ? 'DRAW'
            : `${displayName(topEntries[0].id)} WIN!`;
    } else if (walkover) {
      banner = 'WIN!';
      bannerClass = 'win';
    } else if (!mine) {
      banner = 'FINISH';
    } else {
      const myRank = rankOf(mineEntry!);
      if (myRank === 1 && topEntries.length === 1) {
        banner = 'WIN!';
        bannerClass = 'win';
      } else if (myRank === 1) {
        banner = 'DRAW';
      } else if (entries.length === 2) {
        banner = 'LOSE…';
        bannerClass = 'lose';
      } else {
        banner = `${myRank}位…`;
      }
    }

    content = (
      <section className="screen-box">
        <p className={`versus-banner ${bannerClass}`} data-testid="result-banner">
          {banner}
        </p>
        {walkover && (
          <p className="notice" data-testid="walkover-note">対戦相手が切断したため、あなたの勝ちです。</p>
        )}
        {matchInfo && (
          <p className="room-rules" data-testid="result-rule">{ruleLabel(matchInfo.rule)}</p>
        )}
        <table className="result-table rank-table" data-testid="result-table">
          <thead>
            <tr>
              <th>順位</th>
              <th className="rank-name">プレイヤー</th>
              <th>スコア</th>
              <th>KPM</th>
              <th>ミス</th>
              <th>正確率</th>
              <th>お題</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={!isSpec && e.id === myId ? 'rank-me' : ''}>
                <td className="rank-num">{e.st ? `${rankOf(e)}位` : '-'}</td>
                <td className="rank-name" data-testid={!isSpec && e.id === myId ? 'result-my-name' : undefined}>
                  {displayName(e.id)}
                </td>
                <td data-testid={!isSpec && e.id === myId ? 'my-final-score' : undefined}>{e.st?.score ?? '-'}</td>
                <td>{e.st?.kpm ?? '-'}</td>
                <td>{e.st?.misses ?? '-'}</td>
                <td>{e.st ? `${e.st.accuracy}%` : '-'}</td>
                <td>{e.st?.completedWords ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {role === 'player' ? (
          <>
            <div className="button-row">
              <button className="primary" data-testid="rematch-button" onClick={goLobby}>
                もう一度対戦(ロビーへ) <kbd>Space</kbd>
              </button>
              <button onClick={() => setConfirm(true)}>退出 <kbd>Esc</kbd></button>
            </div>
            {peerEntries.length > 0 && (
              <p className="peer-status" data-testid="result-peer-status">
                {peerEntries
                  .map((p) =>
                    p.ready
                      ? `${p.name}: ロビーで準備OKしています!`
                      : p.inLobby
                        ? `${p.name}: ロビーに移動しました`
                        : `${p.name}: リザルト画面にいます`,
                  )
                  .join(' ・ ')}
              </p>
            )}
          </>
        ) : (
          <p className="peer-status">次の試合が始まるとここから観戦できます</p>
        )}
      </section>
    );
  } else if (phase === 'playing' && role === 'spectator') {
    const rule = matchInfo?.rule;
    const ids = matchIds.filter((id) => peers[id] != null);
    const maxScore = Math.max(...ids.map((i) => (progById[i] ?? PROGRESS_ZERO).score), 1);
    const panels = ids.map((id) => {
      const prog = progById[id] ?? PROGRESS_ZERO;
      const word: Word | undefined = matchWords[prog.completedWords % Math.max(matchWords.length, 1)];
      const frac = prog.score / maxScore;
      return (
        <div className="spec-panel" key={id} data-testid={`spec-panel-${id}`}>
          <p className="spec-player-name">{nameOf(id)}</p>
          <div className="spec-stats">
            <span>スコア <b>{prog.score}</b></span>
            <span>KPM <b>{prog.kpm}</b></span>
            <span>ミス <b>{prog.misses}</b></span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(frac, 1) * 100}%` }} />
          </div>
          <div className="spec-word">
            <p className="word-reading">{word?.reading ?? ''}</p>
            <p className="word-display spec-word-display">{word?.display ?? ''}</p>
            <p className="word-romaji">
              <span className="romaji-typed"><RomajiText text={prog.typed} /></span>
              <span className="romaji-rest"><RomajiText text={prog.rest} /></span>
            </p>
          </div>
        </div>
      );
    });
    content = (
      <section>
        <p className="spec-header">
          <span className="spec-badge">観戦中</span>
          {rule && <span className="room-rules"> {ruleLabel(rule)}</span>}
          {spectatorCount > 0 && <span className="spectator-count"> 観戦: {spectatorCount}人</span>}
        </p>
        <div className="spec-grid" data-count={panels.length}>{panels}</div>
        <p className="hint">Esc で退出</p>
      </section>
    );
  } else if (phase === 'playing' && snap) {
    // 進捗率は全員のスコアの相対比較
    const myId = playerIdRef.current;
    const oppIds = matchIds.filter((id) => id !== myId && peers[id] != null);
    const maxScore = Math.max(snap.score, ...oppIds.map((id) => progById[id]?.score ?? 0), 1);
    content = (
      <section>
        <div className="hud">
          <div className="hud-item">KPM <span>{snap.kpm}</span></div>
          <div className="hud-item">ミス <span>{snap.misses}</span></div>
          <div className="hud-item time">残り <span>{snap.timeLeft.toFixed(1)}</span></div>
        </div>
        <div className="time-bar">
          <div className="time-bar-fill" style={{ width: `${snap.timeFrac * 100}%` }} />
        </div>

        {oppIds.length > 0 && (
          <div className="opp-grid" data-testid="opp-grid" data-count={oppIds.length}>
            {oppIds.map((id) => {
              const p = progById[id] ?? PROGRESS_ZERO;
              const word: Word | undefined = matchWords[p.completedWords % Math.max(matchWords.length, 1)];
              return (
                <div className="opp-card" key={id} data-testid={`opp-card-${id}`}>
                  <div className="opp-head">
                    <span className="opp-name" data-testid={`opp-name-${id}`}>{nameOf(id)}</span>
                    <span className="opp-score" data-testid={`opp-score-${id}`}>{p.score}</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill peer"
                      style={{ width: `${Math.min(p.score / maxScore, 1) * 100}%` }}
                    />
                  </div>
                  <div className="opp-word">
                    <p className="opp-word-display">{word?.display ?? ''}</p>
                    <p className="opp-romaji">
                      <span className="romaji-typed"><RomajiText text={p.typed} /></span>
                      <span className="romaji-rest"><RomajiText text={p.rest} /></span>
                    </p>
                  </div>
                  <div className="opp-sub">KPM {p.kpm} ・ ミス {p.misses}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="me-panel">
          <div className="me-head">
            <span className="me-badge">あなた</span>
            <span className="me-name">{myName}</span>
            <div className="progress-track me-track">
              <div className="progress-fill" style={{ width: `${Math.min(snap.score / maxScore, 1) * 100}%` }} />
            </div>
            <span className="me-score" data-testid="my-score">{snap.score}</span>
          </div>
          <WordArea snap={snap} />
        </div>
        <p className="hint">Esc で退出{spectatorCount > 0 ? ` ・ 観戦: ${spectatorCount}人` : ''}</p>
      </section>
    );
  }

  return (
    <>
      {content}
      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setInputModeLabel(loadInputModePref()); // 変更を入力方式表示に反映
        }}
      />
      {confirmExit && (
        <div className="confirm-overlay" data-testid="confirm-overlay">
          <div className="confirm-box">
            <p>部屋から退出しますか?</p>
            <div className="button-row">
              <button className="primary" data-testid="confirm-exit" onClick={() => router.push('/')}>
                退出する <kbd>Enter</kbd>
              </button>
              <button onClick={() => setConfirm(false)}>キャンセル <kbd>Esc</kbd></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 対戦ルームの Durable Object。「1ルーム = 1インスタンス」。
//
// - WebSocket Hibernation API を使用(アイドル中の課金を避け、受信20通=1リクエスト換算にするため)
// - 揮発してよい状態はメモリに持たず、config / state / done / rematch を storage に置く
//   (ハイバネーション後もメッセージハンドラだけで復元できるようにする)
// - 試合終了の保険タイマーは storage.setAlarm()(メモリからの退避を跨いで発火する)
// - プレイヤーは部屋作成時に決めた maxPlayers(2〜4)まで。あふれた接続は観戦者になる
// - 試合は「接続中のプレイヤー全員(2人以上)が準備OK」で開始。対戦中に誰かが
//   離脱しても2人以上残っていれば続行し、1人になったら不戦勝で破棄する
//
// 接続URLは /rooms/<code>/ws。join メッセージは不要(接続した時点で参加)。

import { FALLBACK_WORDS, parseWordList } from '../lib/engine/words.js';

// 単語リストは snstyping-dict リポジトリの GitHub Pages から実行時に取得する
// (バンドルしない。辞書の追加はあちら側のPRだけで反映される)
const DEFAULT_DICT_BASE_URL = 'https://highemerly.github.io/snstyping-dict/';
// Pages側のCDNキャッシュが約10分なので、isolate内キャッシュは5分で十分新鮮
const DICT_CACHE_TTL_MS = 5 * 60 * 1000;
const dictCache = { catalog: null, catalogAt: 0, lists: new Map() };

async function fetchJsonOrText(url, asText) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return asText ? res.text() : res.json();
}

async function fetchCatalog(baseUrl) {
  const now = Date.now();
  if (dictCache.catalog && now - dictCache.catalogAt < DICT_CACHE_TTL_MS) return dictCache.catalog;
  const catalog = await fetchJsonOrText(`${baseUrl}words.json`);
  if (!Array.isArray(catalog.words) || catalog.words.length === 0) throw new Error('empty catalog');
  dictCache.catalog = catalog;
  dictCache.catalogAt = now;
  return catalog;
}

// id を解決して単語リストを返す。カタログに無いidは basic(それも無ければ先頭)へ、
// 取得に失敗したら内蔵の FALLBACK_WORDS へフォールバックする。
async function resolveWordList(baseUrl, id) {
  try {
    const catalog = await fetchCatalog(baseUrl);
    const entry =
      catalog.words.find((w) => w.id === id) ??
      catalog.words.find((w) => w.id === 'basic') ??
      catalog.words[0];
    // version(内容ハッシュ)込みでキャッシュ・取得する。版が変われば別URL・別キャッシュになる
    const cacheKey = `${entry.file}?v=${entry.version ?? ''}`;
    const cached = dictCache.lists.get(cacheKey);
    if (cached && Date.now() - cached.at < DICT_CACHE_TTL_MS) {
      return { id: entry.id, words: cached.words };
    }
    const tsv = await fetchJsonOrText(`${baseUrl}words/${encodeURIComponent(entry.file)}?v=${encodeURIComponent(entry.version ?? '')}`, true);
    const words = parseWordList(tsv);
    if (words.length === 0) throw new Error(`empty word list: ${entry.file}`);
    dictCache.lists.set(cacheKey, { words, at: Date.now() });
    return { id: entry.id, words };
  } catch (err) {
    console.warn('単語リストの取得に失敗、内蔵フォールバックを使用します:', err);
    return { id, words: FALLBACK_WORDS };
  }
}

const COUNTDOWN_MS = 3000;
// 部屋の同時対戦人数の範囲(上限は部屋を作る人が決める)
const MIN_PLAYERS = 2;
const MAX_PLAYERS_LIMIT = 4;
const RESULT_GRACE_MS = 10 * 1000;
// 対戦中以外は Alarm をハートビートとして使い、公開ルーム一覧の鮮度維持と
// 放置部屋(無操作が続くロビー)のクローズを行う
const DIRECTORY_HEARTBEAT_MS = 2 * 60 * 1000;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.dictBaseUrl = env.DICT_BASE_URL || DEFAULT_DICT_BASE_URL;
  }

  // 最終活動時刻の記録と、非対戦中のハートビート予約(対戦中は試合の保険 Alarm を優先)
  async touchActivity() {
    await this.ctx.storage.put('activityAt', Date.now());
    if ((await this.ctx.storage.get('state')) !== 'playing' && this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + DIRECTORY_HEARTBEAT_MS);
    }
  }

  // 公開ルームなら Directory DO に現在の状態を報告する(非公開なら何もしない)
  // forceEmpty: 部屋を閉じる途中でソケットがまだ残っていても「0人」として報告する
  // excludeWs : いま閉じかけのソケット。close ハンドラ中は getWebSockets() が
  //             まだこれを含むため、人数から除外しないと離脱者を数え続けてしまう
  async reportToDirectory(forceEmpty = false, excludeWs = null) {
    try {
      const config = await this.ctx.storage.get('config');
      if (!config?.isPublic || !config.code) return;
      const players = forceEmpty
        ? []
        : this.players()
            .filter((ws) => ws !== excludeWs)
            .map((ws) => ws.deserializeAttachment()?.name ?? 'ゲスト');
      const spectatorCount = this.spectators().filter((ws) => ws !== excludeWs).length;
      const stub = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('global'));
      await stub.fetch('https://directory/update', {
        method: 'POST',
        body: JSON.stringify({
          code: config.code,
          ruleType: config.ruleType,
          rule: config.rule,
          players,
          playerCount: players.length,
          maxPlayers: config.maxPlayers ?? MIN_PLAYERS,
          spectatorCount,
          state: await this.ctx.storage.get('state'),
        }),
      });
    } catch {
      // 一覧はベストエフォート(失敗しても対戦本体には影響させない)
    }
  }

  players() {
    return this.ctx.getWebSockets().filter((ws) => !ws.deserializeAttachment()?.spectator);
  }

  spectators() {
    return this.ctx.getWebSockets().filter((ws) => ws.deserializeAttachment()?.spectator);
  }

  async fetch(req) {
    const url = new URL(req.url);

    // Worker からの部屋初期化(部屋の存在 = config が storage にあること)
    // ruleType 'propose': 毎試合ロビーで両者が提案しランダム採用
    // ruleType 'host'   : 部屋を作った人が決めたルールで固定
    if (url.pathname === '/init') {
      if (this.ctx.getWebSockets().length > 0) {
        return new Response('occupied', { status: 409 });
      }
      let body = {};
      try {
        body = await req.json();
      } catch {
        // ボディなしは提案方式として扱う
      }
      const ruleType = body.ruleType === 'host' ? 'host' : 'propose';
      await this.ctx.storage.put('config', {
        ruleType,
        rule: ruleType === 'host' ? sanitizeProposal(body.rule) : null,
        code: typeof body.code === 'string' ? body.code : null,
        isPublic: body.isPublic !== false,
        maxPlayers: sanitizeMaxPlayers(body.maxPlayers),
        createdAt: Date.now(),
      });
      await this.ctx.storage.put('state', 'waiting');
      return Response.json({ ok: true });
    }

    // WebSocket 参加(プレイヤーは部屋の上限人数まで。満員なら観戦者として受け入れ)
    const config = await this.ctx.storage.get('config');
    if (!config) return this.rejectSocket('not_found');

    const name = sanitizeName(url.searchParams.get('name'));
    const maxPlayers = sanitizeMaxPlayers(config.maxPlayers);
    const players = this.players();
    const spectators = this.spectators();
    const ready = (await this.ctx.storage.get('ready')) ?? {};
    const state = await this.ctx.storage.get('state');

    const playerInfos = players.map((ws) => {
      const att = ws.deserializeAttachment();
      return {
        playerId: att?.playerId,
        name: att?.name ?? 'ゲスト',
        ready: ready[att?.playerId] != null,
        proposal: ready[att?.playerId]?.proposal ?? null,
      };
    });

    if (players.length >= maxPlayers) {
      // ---- 観戦者 ----
      if (spectators.length >= 20) return this.rejectSocket('full');
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ spectator: true, name });
      const joinedMsg = {
        t: 'joined',
        role: 'spectator',
        playerCount: players.length,
        maxPlayers,
        spectatorCount: spectators.length + 1,
        ruleType: config.ruleType ?? 'propose',
        rule: config.rule ?? null,
        state,
        players: playerInfos,
      };
      if (state === 'playing') {
        // 対戦中に来た観戦者にも現在のマッチ情報とお題を渡す
        joinedMsg.match = await this.ctx.storage.get('match');
        joinedMsg.words = await this.ctx.storage.get('matchWords');
      }
      send(server, joinedMsg);
      this.broadcastExcept(server, { t: 'spectators', count: spectators.length + 1 });
      await this.touchActivity();
      await this.reportToDirectory();
      return new Response(null, { status: 101, webSocket: client });
    }

    // ---- プレイヤー ----
    // 空いている最小のIDを割り当てる(離脱で空いた席は再利用する)。
    // ただし対戦中は、進行中試合の参加者IDと衝突しないよう matchIds も避ける
    const usedIds = new Set(players.map((ws) => ws.deserializeAttachment()?.playerId));
    if (state === 'playing') {
      for (const id of (await this.ctx.storage.get('matchIds')) ?? []) usedIds.add(id);
    }
    let playerId = 1;
    while (usedIds.has(playerId)) playerId += 1;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId, name });

    send(server, {
      t: 'joined',
      role: 'player',
      playerId,
      name,
      playerCount: players.length + 1,
      maxPlayers,
      spectatorCount: spectators.length,
      ruleType: config.ruleType ?? 'propose',
      rule: config.rule ?? null,
      state,
      peers: playerInfos,
    });
    this.broadcastExcept(server, { t: 'peer_joined', playerCount: players.length + 1, playerId, name });
    await this.touchActivity();
    await this.reportToDirectory();

    return new Response(null, { status: 101, webSocket: client });
  }

  // アプリレベルのエラーを伝えるため、一旦アップグレードしてから送信して閉じる
  rejectSocket(reason) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.send(JSON.stringify({ t: 'error', reason }));
    server.close(1000, reason);
    return new Response(null, { status: 101, webSocket: client });
  }

  // rule: 採用された提案 / chosenBy: 提案者 {playerId, name}
  async startMatch(rule, chosenBy) {
    // カタログでidを解決してから確定ルールとして保存する(未知のidは basic に落ちる)
    const { id: wordListId, words: list } = await resolveWordList(this.dictBaseUrl, rule.wordListId);
    rule = { ...rule, wordListId };
    await this.ctx.storage.put('state', 'playing');
    await this.ctx.storage.put('match', rule);
    await this.ctx.storage.put('done', {});
    // この試合の参加者(開始後に入室した人は次の試合から)
    await this.ctx.storage.put(
      'matchIds',
      this.players().map((ws) => ws.deserializeAttachment()?.playerId).filter((id) => id != null),
    );
    await this.ctx.storage.delete('ready');
    const words = shuffle(list);
    // 途中から来た観戦者にも渡せるよう保存しておく
    await this.ctx.storage.put('matchWords', words);
    this.broadcast({
      t: 'start',
      words,
      durationSec: rule.durationSec,
      wordListId: rule.wordListId,
      chosenBy,
      countdownMs: COUNTDOWN_MS,
    });
    // done が揃わない場合の保険
    await this.ctx.storage.setAlarm(Date.now() + COUNTDOWN_MS + rule.durationSec * 1000 + RESULT_GRACE_MS);
    await this.reportToDirectory();
    // プレイ数を計上(ベストエフォート。失敗しても対戦本体には影響させない)
    try {
      const stub = this.env.STATS.get(this.env.STATS.idFromName('global'));
      await stub.fetch('https://stats/hit', {
        method: 'POST',
        body: JSON.stringify({ mode: 'online', ruleKey: `${rule.wordListId}|${rule.durationSec}` }),
      });
    } catch {
      // 統計はベストエフォート
    }
  }

  async finishMatch() {
    const state = await this.ctx.storage.get('state');
    if (state !== 'playing') return;
    await this.ctx.storage.put('state', 'finished');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete('matchWords');
    const done = (await this.ctx.storage.get('done')) ?? {};
    const matchIds = (await this.ctx.storage.get('matchIds')) ?? [];
    await this.ctx.storage.delete('matchIds');
    const stats = {};
    for (const playerId of matchIds) {
      stats[playerId] = done[playerId] ?? null;
    }
    this.broadcast({ t: 'result', stats });
    await this.touchActivity(); // 試合終了は活動。ここでハートビートも再開する
    await this.reportToDirectory();
  }

  // 対戦中: 結果が揃わない場合の保険 / それ以外: ハートビート + 放置部屋のクローズ
  async alarm() {
    if ((await this.ctx.storage.get('state')) === 'playing') {
      await this.finishMatch();
      return;
    }
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) return;
    const activityAt = (await this.ctx.storage.get('activityAt')) ?? 0;
    if (Date.now() - activityAt > IDLE_TIMEOUT_MS) {
      // 長時間操作のないロビーは閉じる(閉じ損ねたゾンビ接続の一覧残留もこれで解消)
      await this.reportToDirectory(true);
      for (const ws of sockets) {
        send(ws, { t: 'error', reason: 'idle_timeout' });
        ws.close(1000, 'idle_timeout');
      }
      return;
    }
    await this.reportToDirectory();
    await this.ctx.storage.setAlarm(Date.now() + DIRECTORY_HEARTBEAT_MS);
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send(ws, { t: 'error', reason: 'bad_request' });
    }
    const playerId = ws.deserializeAttachment()?.playerId;
    if (!playerId) return;

    switch (msg.t) {
      case 'progress':
        // 中継のみ。storage には触れない(最も高頻度のパス)。観戦者向けに playerId を付ける
        this.broadcastExcept(ws, { ...msg, t: 'peer_progress', playerId });
        break;

      // リザルト画面からロビーに戻った通知(相手・観戦者に中継するだけ)
      case 'lobby':
        this.broadcastExcept(ws, { t: 'peer_lobby', playerId });
        break;

      // 準備OK(提案方式なら対戦ルールの提案付き)。接続中の全員(2人以上)が揃ったら開始
      case 'ready': {
        const state = await this.ctx.storage.get('state');
        if (state === 'playing') break;
        const config = await this.ctx.storage.get('config');
        const isHost = config?.ruleType === 'host';
        const ready = (await this.ctx.storage.get('ready')) ?? {};
        ready[playerId] = { proposal: isHost ? null : sanitizeProposal(msg.proposal) };
        await this.ctx.storage.put('ready', ready);
        await this.touchActivity();
        this.broadcastExcept(ws, { t: 'peer_ready', playerId, proposal: ready[playerId].proposal });

        const playerSockets = this.players();
        const ids = playerSockets.map((w) => w.deserializeAttachment()?.playerId);
        if (playerSockets.length >= MIN_PLAYERS && ids.every((id) => ready[id])) {
          if (isHost) {
            await this.startMatch(config.rule, null);
          } else {
            const chosenId = ids[Math.floor(Math.random() * ids.length)];
            const chosenWs = playerSockets.find((w) => w.deserializeAttachment()?.playerId === chosenId);
            await this.startMatch(ready[chosenId].proposal, {
              playerId: chosenId,
              name: chosenWs?.deserializeAttachment()?.name ?? 'ゲスト',
            });
          }
        }
        break;
      }

      case 'done': {
        if ((await this.ctx.storage.get('state')) !== 'playing') break;
        const done = (await this.ctx.storage.get('done')) ?? {};
        done[playerId] = msg.stats ?? null;
        await this.ctx.storage.put('done', done);
        if (await this.allMatchPlayersDone(done)) {
          await this.finishMatch();
        }
        break;
      }
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    const others = this.ctx.getWebSockets().filter((w) => w !== ws);

    // 観戦者の離脱はマッチに影響しない(人数の更新だけ)
    if (att?.spectator) {
      const count = others.filter((w) => w.deserializeAttachment()?.spectator).length;
      for (const other of others) send(other, { t: 'spectators', count });
      await this.touchActivity();
      await this.reportToDirectory(false, ws);
      return;
    }

    const playerCount = others.filter((w) => !w.deserializeAttachment()?.spectator).length;
    const state = await this.ctx.storage.get('state');

    if (state === 'playing' && playerCount >= MIN_PLAYERS) {
      // 対戦中でも2人以上残っていれば試合はそのまま続行する
      for (const other of others) {
        send(other, { t: 'peer_left', playerCount, playerId: att?.playerId ?? null });
      }
      // 離脱者の done 待ちで試合が終わらなくなるのを防ぐ
      const done = (await this.ctx.storage.get('done')) ?? {};
      if (await this.allMatchPlayersDone(done, ws)) {
        await this.finishMatch();
      }
      await this.touchActivity();
      await this.reportToDirectory(false, ws);
      return;
    }

    // 残りが1人以下になったらマッチを破棄して待機に戻す(準備状態も全員リセット)
    await this.ctx.storage.put('state', 'waiting');
    await this.ctx.storage.delete('done');
    await this.ctx.storage.delete('ready');
    await this.ctx.storage.delete('matchIds');
    await this.ctx.storage.deleteAlarm();
    for (const other of others) {
      send(other, { t: 'peer_left', playerCount, playerId: att?.playerId ?? null });
    }
    if (others.length > 0) await this.touchActivity(); // 残った人がいればハートビート継続
    await this.reportToDirectory(false, ws);
  }

  // 試合参加者のうち、まだ接続しているプレイヤー全員の結果が出そろったか
  // (excludeWs: いま切断処理中のソケット。getWebSockets() にまだ残っているため除外する)
  async allMatchPlayersDone(done, excludeWs = null) {
    const matchIds = (await this.ctx.storage.get('matchIds')) ?? [];
    const connected = new Set(
      this.players()
        .filter((w) => w !== excludeWs)
        .map((w) => w.deserializeAttachment()?.playerId),
    );
    const active = matchIds.filter((id) => connected.has(id));
    return active.length > 0 && active.every((id) => done[id] !== undefined);
  }

  webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  broadcast(msg) {
    for (const ws of this.ctx.getWebSockets()) send(ws, msg);
  }

  broadcastExcept(exclude, msg) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) send(ws, msg);
    }
  }
}

// 提案されたルールをサーバー側で検証・補正する。
// wordListId はここでは形式のみ確認し、実在チェックは試合開始時の
// resolveWordList に任せる(カタログに無ければ basic に落ちる)。
function sanitizeProposal(p) {
  let durationSec = Number(p?.durationSec ?? 60);
  if (!Number.isInteger(durationSec) || durationSec < 5 || durationSec > 300) durationSec = 60;
  const wordListId = typeof p?.wordListId === 'string' && /^[a-z0-9_-]{1,50}$/i.test(p.wordListId)
    ? p.wordListId
    : 'basic';
  return { durationSec, wordListId };
}

// 部屋の同時対戦人数の上限(部屋を作る人が指定)。範囲外・未指定は最小値に補正
function sanitizeMaxPlayers(raw) {
  const n = Number(raw ?? MIN_PLAYERS);
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS_LIMIT) return MIN_PLAYERS;
  return n;
}

function sanitizeName(raw) {
  // 制御文字を除去して20文字まで。空ならデフォルト名
  const name = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
  return name || 'ゲスト';
}

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // 送信先が閉じかけの場合は無視(close ハンドラ側で整理される)
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

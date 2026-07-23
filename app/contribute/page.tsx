'use client';

// 自分のMastodon投稿を snstyping の辞書に載せる投稿フロー。
//   1. 本人確認(VerifyStep)
//   2. 公開投稿を取得してふりがな生成(既存の辞書があればマージ表示)+ 手直し
//   3. 追加/更新PRを作成(あなたのレビュー後にアプリへ反映)
// 削除は別ページ(/contribute/delete)。

import { useCallback, useRef, useState } from 'react';
import { parseKana, normalizeReading } from '@/lib/engine/romaji';
import { createUnidicReader, DICT_SIZE_MB, type UnidicReader } from '@/lib/sns/reading-client';
import VerifyStep from './VerifyStep';

// dict.ts / snstyping-dict の READING_RE と同期(ふりがなの文字集合)
const READING_RE = /^[ぁ-ゖァ-ヶー、。！？・「」　\x20-\x7e]+$/u;

// エンジンで最後まで打鍵できるか(サーバーの isTypeable と同じ判定)
function readingError(reading: string): string | null {
  const r = reading.trim();
  if (!r) return 'ふりがなが空です';
  if (!READING_RE.test(r)) {
    const bad = [...r].filter((c) => !READING_RE.test(c)).join('');
    return `使えない文字: ${bad}`;
  }
  try {
    const chunks = parseKana(normalizeReading(r));
    if (chunks.length === 0 || !chunks.every((c) => c.candidates.length > 0)) return '打鍵できない読みです';
  } catch {
    return '打鍵できない読みです';
  }
  return null;
}

type Row = {
  display: string;
  reading: string;
  include: boolean;
  source: 'existing' | 'fresh' | 'dropped';
  touched?: boolean; // ユーザーが手を入れた行(UniDic再生成で上書きしない)
};
type Step = 'verify' | 'edit' | 'done';

// UniDic辞書の処理状態(投稿画面で読みを高精度化するためのブラウザ内WASM辞書)。
// download(通信) → prepare(解凍+辞書構築、進捗が出ない数秒) → analyze(投稿ごとの解析) の順。
type DictState =
  | { status: 'idle' }
  | { status: 'downloading'; loaded: number; total: number | null; fromCache: boolean }
  | { status: 'preparing' }
  | { status: 'analyzing'; done: number; total: number }
  | { status: 'ready' }
  | { status: 'unsupported' };

// くるくる回るスピナー(公開ルーム更新ボタンと同じアイコン)
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="spin-icon"
      width={size}
      height={size}
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
  );
}

// 表示するグループの定義(新規は最初から開く / 既存は畳む)
// 要修正(dropped)は新規にまとめ、行ごとに「(要修正)」マークを付ける。
const GROUPS: { label: string; open: boolean; note: string; sources: Row['source'][] }[] = [
  {
    label: '新規',
    open: true,
    note: '「(要修正)」は自動でふりがなを付けられなかったものです。直すか、チェックを外してください。',
    sources: ['fresh', 'dropped'],
  },
  {
    label: '既存',
    open: false,
    note: '',
    sources: ['existing'],
  },
];

export default function ContributePage() {
  const [step, setStep] = useState<Step>('verify');
  const [acct, setAcct] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- 編集 ---
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [fetchNote, setFetchNote] = useState('');

  // UniDic(ブラウザ内WASM辞書)の状態と、生成器(セッション中1回だけ作る)
  const [dict, setDict] = useState<DictState>({ status: 'idle' });
  const readerRef = useRef<Promise<UnidicReader> | null>(null);

  // 未マージの申請状況(本人確認直後に知らせる)
  const [pending, setPending] = useState<{ addUrl: string | null; deletePending: boolean } | null>(null);

  // --- 完了 ---
  const [prUrl, setPrUrl] = useState('');
  const [error, setError] = useState('');

  // UniDic生成器を用意(セッション中1回。失敗時はrejectしフォールバックさせる)。
  // 通信完了後は解凍+辞書構築(進捗の出ない数秒)に入るので、その間は 'preparing' を出す。
  const getReader = useCallback(() => {
    if (!readerRef.current) {
      setDict({ status: 'downloading', loaded: 0, total: null, fromCache: false });
      readerRef.current = createUnidicReader({
        onProgress: (p) => {
          // 受信バイトがほぼ揃ったら、以降は解凍+辞書構築フェーズ。
          // (チャンク合計は Content-Length に数KB届かないことがあるので許容誤差を持たせる)
          if (p.total != null && p.total - p.loaded < 262144) setDict({ status: 'preparing' });
          else setDict({ status: 'downloading', loaded: p.loaded, total: p.total, fromCache: p.fromCache });
        },
      })
        .then((r) => {
          setDict({ status: 'preparing' }); // create 解決直後〜解析開始まで
          return r;
        })
        .catch((e) => {
          setDict({ status: 'unsupported' });
          readerRef.current = null; // 次回リトライできるように
          throw e;
        });
    }
    return readerRef.current;
  }, []);

  // 取得直後の kuromoji 下書きを UniDic 読みへ置き換える。
  // existing(手直し済み)と、ユーザーが触った行は上書きしない。
  // 解析は投稿ごとに進捗(done/total)を出す。
  const regenerate = useCallback(
    async (base: Row[]) => {
      let reader: UnidicReader;
      try {
        reader = await getReader();
      } catch {
        return; // 非対応/ロード失敗 → kuromoji 下書きのまま
      }
      const targets = base.filter((r) => r.source !== 'existing' && !r.touched);
      setDict({ status: 'analyzing', done: 0, total: targets.length });
      const results = new Map<string, { reading: string; typeable: boolean }>();
      let done = 0;
      for (const r of targets) {
        try {
          results.set(r.display, await reader.generate(r.display));
        } catch {
          // この投稿だけ失敗 → 下書きのまま(結果を入れない)
        }
        done++;
        setDict({ status: 'analyzing', done, total: targets.length });
      }
      // 現在の行に結果を反映。再生成中にユーザーが触った行は保護する。
      setRows((cur) =>
        cur.map((r) => {
          if (r.source === 'existing' || r.touched) return r;
          const g = results.get(r.display);
          if (!g) return r;
          return { ...r, reading: g.reading, include: g.typeable, source: (g.typeable ? 'fresh' : 'dropped') as Row['source'] };
        }),
      );
      setDict({ status: 'ready' });
    },
    [getReader],
  );

  const loadPosts = useCallback(async () => {
    setBusy(true);
    setFetchNote('');
    try {
      const res = await fetch('/api/contribute/fetch');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTitle(data.title ?? '');
      const next: Row[] = [
        ...data.existing.map((e: Row) => ({ ...e, include: true, source: 'existing' as const })),
        ...data.fresh.map((e: Row) => ({ ...e, include: true, source: 'fresh' as const })),
        ...data.dropped.map((e: Row) => ({ ...e, include: false, source: 'dropped' as const })),
      ];
      setRows(next);
      setPending(data.pending ?? null);
      regenerate(next); // UniDicで読みを高精度化(非同期・失敗しても下書きのまま)
    } catch {
      setFetchNote('投稿の取得に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [regenerate]);

  const onVerified = useCallback(
    (verifiedAcct: string) => {
      setAcct(verifiedAcct);
      setStep('edit');
      loadPosts();
    },
    [loadPosts],
  );

  const updateReading = (idx: number, reading: string) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, reading, touched: true } : r)));
  const toggleInclude = (idx: number) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, include: !r.include, touched: true } : r)));

  const included = rows.filter((r) => r.include);
  const invalidCount = included.filter((r) => readingError(r.reading)).length;
  const canSubmit = title.trim() !== '' && included.length > 0 && invalidCount === 0 && !pending?.deletePending;

  const submit = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/contribute/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          entries: included.map((r) => ({ display: r.display, reading: r.reading.trim() })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || (data.details ? data.details.join(' / ') : '申請の送信に失敗しました。'));
        return;
      }
      setPrUrl(data.prUrl);
      setStep('done');
    } catch {
      setError('送信に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [title, included]);

  const stepIndex = step === 'verify' ? 1 : step === 'edit' ? 2 : 3;

  return (
    <main className="app">
      <section className="screen-box contribute">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <h2>自分の投稿を載せる</h2>
          <a className="info-note" href="/contribute/delete">削除したい場合はこちら</a>
        </div>
        <p className="info-note">
          Mastodonの自分の公開投稿を snstyping のタイピング辞書に申請できます。申請後、管理者の承認を得て反映されます。
        </p>
        <ol className="steps">
          {[
            { n: 1, label: '本人確認' },
            { n: 2, label: '内容の確認' },
            { n: 3, label: '申請' },
          ].map(({ n, label }) => (
            <li key={n} className={stepIndex === n ? 'active' : stepIndex > n ? 'done' : ''}>
              <span className="step-num">{n}</span>
              {label}
            </li>
          ))}
        </ol>

        {/* ---- Step 1: 本人確認 ---- */}
        {step === 'verify' && <VerifyStep onVerified={onVerified} />}

        {/* ---- Step 2: 取得 & 手直し ---- */}
        {step === 'edit' && (
          <div className="contribute-section">
            <h3>内容の確認とふりがなの手直し</h3>
            <p className="info-note">
              確認できたアカウント: <strong>{acct}</strong>
            </p>

            {pending?.deletePending && (
              <div className="callout">
                現在、削除を申請中です。反映されるまで、新しい申請はできません。
              </div>
            )}
            {!pending?.deletePending && pending?.addUrl && (
              <div className="callout">
                すでに申請中のものがあります。このまま進めると、その申請を上書きします。
                {' '}
                <a href={pending.addUrl} target="_blank" rel="noreferrer">今の申請を見る</a>
              </div>
            )}

            {/* 何が起きるかを先に説明(ブラウザ内解析・初回のみ辞書DL)。 */}
            {dict.status !== 'unsupported' && (
              <p className="info-note">
                ふりがなはあなたのブラウザ上で解析します。初回のみ辞書データ（約{DICT_SIZE_MB}MB）を
                ダウンロードします。
              </p>
            )}

            {/* 高精度辞書(UniDic)の処理状況: ダウンロード → 準備 → 解析。 */}
            {(dict.status === 'downloading' || dict.status === 'preparing' || dict.status === 'analyzing') && (
              <div className="callout" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Spinner size={16} />
                <span>
                  {dict.status === 'downloading' && (
                    dict.fromCache ? (
                      '辞書データを読み込み中…'
                    ) : (
                      <>
                        辞書データ（約{DICT_SIZE_MB}MB）をダウンロード中…
                        {dict.loaded > 0 && (
                          <> （{(dict.loaded / 1e6).toFixed(0)}
                            {dict.total ? ` / ${(dict.total / 1e6).toFixed(0)}` : ''}MB）</>
                        )}
                      </>
                    )
                  )}
                  {dict.status === 'preparing' && '辞書を準備中…（解凍・構築）'}
                  {dict.status === 'analyzing' && `ふりがなを解析中…（${dict.done} / ${dict.total}）`}
                </span>
              </div>
            )}
            {dict.status === 'unsupported' && (
              <div className="callout">
                お使いのブラウザは高精度辞書に未対応のため、簡易のふりがなを表示しています。必要なら手直ししてください。
              </div>
            )}

            {busy && rows.length === 0 ? (
              <div className="fetch-loading">
                <Spinner size={22} />
                <span>投稿を取得しています…</span>
              </div>
            ) : fetchNote ? (
              <p className="error-note">{fetchNote}</p>
            ) : (
              <>
                <div>
                  <div style={{ marginBottom: '0.5rem' }}>辞書の表示名(タイトル)</div>
                  <div className="title-readonly">{title}</div>
                </div>

                <div className="entry-list">
                  {GROUPS.map((g) => {
                    const items = rows
                      .map((r, i) => ({ r, i }))
                      .filter(({ r }) => g.sources.includes(r.source));
                    if (items.length === 0) return null;
                    return (
                      <details className="entry-group" key={g.label} open={g.open}>
                        <summary>
                          {g.label}
                          <span className="entry-group-count">{items.length}件</span>
                        </summary>
                        <p className="info-note group-note">{g.note}</p>
                        {items.map(({ r, i }) => {
                          const err = r.include ? readingError(r.reading) : null;
                          return (
                            <div className="entry-row" key={i} style={{ opacity: r.include ? 1 : 0.45 }}>
                              <input type="checkbox" checked={r.include} onChange={() => toggleInclude(i)} style={{ marginTop: 6 }} />
                              <div>
                                <div className="entry-display">
                                  {r.display}
                                  {r.source === 'dropped' && <span className="info-note"> (要修正)</span>}
                                </div>
                                <input
                                  className="name-input"
                                  style={{ width: '100%', borderColor: err ? 'var(--miss)' : undefined }}
                                  value={r.reading}
                                  onChange={(e) => updateReading(i, e.target.value)}
                                />
                                {err && <div className="error-note" style={{ fontSize: 12, marginTop: '0.3rem' }}>{err}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </details>
                    );
                  })}
                </div>
              </>
            )}

            {rows.length > 0 && (
              <>
                {invalidCount > 0 && (
                  <p className="error-note">打鍵できないふりがなが {invalidCount} 件あります。修正するか、チェックを外してください。</p>
                )}
                {error && <p className="error-note">{error}</p>}
                <div className="button-row">
                  <button className="link-button primary btn-with-spinner" onClick={submit} disabled={busy || !canSubmit}>
                    {busy ? (
                      <>
                        <Spinner /> 申請中…
                      </>
                    ) : (
                      `${included.length}件で申請する`
                    )}
                  </button>
                </div>
                <p className="info-note">申請後、管理者のレビューを経てアプリに反映されます。投稿は公開・gitの履歴に残ります。</p>
              </>
            )}
          </div>
        )}

        {/* ---- Step 3: 完了 ---- */}
        {step === 'done' && (
          <div className="contribute-section">
            <h3>ありがとうございます。あなたの申請を受け付けました。</h3>
            {prUrl && (
              <>
                <div className="button-row">
                  <a className="link-button primary" href={prUrl} target="_blank" rel="noreferrer">
                    申請の内容を確認する
                  </a>
                </div>
                <p className="info-note">（GitHubのページが開きます。閉じてしまっても申請は残ります。）</p>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

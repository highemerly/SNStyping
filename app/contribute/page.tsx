'use client';

// 自分のMastodon投稿を snstyping の辞書に載せる投稿フロー。
//   1. 本人確認(VerifyStep)
//   2. 公開投稿を取得してふりがな生成(既存の辞書があればマージ表示)+ 手直し
//   3. 追加/更新PRを作成(あなたのレビュー後にアプリへ反映)
// 削除は別ページ(/contribute/delete)。

import { useCallback, useState } from 'react';
import { parseKana, normalizeReading } from '@/lib/engine/romaji';
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

type Row = { display: string; reading: string; include: boolean; source: 'existing' | 'fresh' | 'dropped' };
type Step = 'verify' | 'edit' | 'done';

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
    note: '今回あたらしく取得した投稿です。「(要修正)」は自動でふりがなを付けられなかったものです。直すか、チェックを外してください。',
    sources: ['fresh', 'dropped'],
  },
  {
    label: '既存',
    open: false,
    note: 'すでに辞書にある投稿です。手直し済みのふりがながあれば、それが反映されています。',
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

  // 未マージの申請状況(本人確認直後に知らせる)
  const [pending, setPending] = useState<{ addUrl: string | null; deletePending: boolean } | null>(null);

  // --- 完了 ---
  const [prUrl, setPrUrl] = useState('');
  const [error, setError] = useState('');

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
    } catch {
      setFetchNote('投稿の取得に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, []);

  const onVerified = useCallback(
    (verifiedAcct: string) => {
      setAcct(verifiedAcct);
      setStep('edit');
      loadPosts();
    },
    [loadPosts],
  );

  const updateReading = (idx: number, reading: string) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, reading } : r)));
  const toggleInclude = (idx: number) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, include: !r.include } : r)));

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
            { n: 2, label: 'ふりがなの手直し' },
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

'use client';

// 統計(/stats)。これまでのプレイ数を「モード × ルール」ごとと、日別タイムラインで表示する。
// 個人情報は一切扱わない(サーバーが持っているのは回数だけ)。
// データは対戦サーバー(Worker)の GET /api/stats から取得し、ラベルは辞書カタログで補う。

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchStats, type StatsMode, type StatsSummary } from '@/lib/stats';
import { EMPTY_CATALOG, fetchCatalog } from '@/lib/dictsource';
import type { Catalog } from '@/components/modeTypes';

const MODE_LABEL: Record<StatsMode, string> = {
  solo: 'ソロプレイ',
  ghost: 'ゴースト対戦',
  online: 'オンライン対戦',
};
const MODE_ORDER: StatsMode[] = ['solo', 'ghost', 'online'];

export default function StatsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch(() => {});
    fetchStats()
      .then(setSummary)
      .catch(() => setError('統計を取得できませんでした。時間をおいて再度お試しください。'));
  }, []);

  // rule_key を人間が読めるラベルに変換する
  const ruleLabel = (mode: StatsMode, ruleKey: string): string => {
    if (mode === 'ghost') {
      if (ruleKey === 'file') return 'ローカルファイル';
      const g = catalog.ghosts.find((x) => x.id === ruleKey);
      return g?.title ?? ruleKey;
    }
    // solo / online: `<wordListId>|<durationSec>`
    const sep = ruleKey.lastIndexOf('|');
    const list = sep >= 0 ? ruleKey.slice(0, sep) : ruleKey;
    const dur = sep >= 0 ? ruleKey.slice(sep + 1) : '';
    const listTitle = list === 'upload' ? 'アップロード' : catalog.words.find((w) => w.id === list)?.title ?? list;
    return dur ? `${listTitle} / ${dur}秒` : listTitle;
  };

  const totalOf = (mode: StatsMode) =>
    summary?.byMode.find((b) => b.mode === mode)?.total ?? 0;

  const dailyMax = Math.max(1, ...(summary?.daily ?? []).map((d) => Number(d.total)));

  return (
    <main className="app">
      <h1 className="title">プレイ統計</h1>
      <p className="subtitle">これまでのルールごとのプレイ数(ユーザー情報は記録していません)</p>

      {error && <p style={{ textAlign: 'center', color: '#c00' }}>{error}</p>}
      {!error && !summary && <p style={{ textAlign: 'center' }}>読み込み中…</p>}

      {summary && (
        <>
          <p style={{ textAlign: 'center', fontSize: '1.1rem', margin: '0.5rem 0 1.5rem' }}>
            総プレイ数 <strong style={{ fontSize: '1.6rem' }}>{summary.total.toLocaleString()}</strong> 回
          </p>

          <div className="cards" style={{ marginBottom: '1.5rem' }}>
            {MODE_ORDER.map((mode) => {
              const rules = summary.rules
                .filter((r) => r.mode === mode)
                .sort((a, b) => Number(b.total) - Number(a.total));
              return (
                <div className="card" key={mode} style={{ alignItems: 'stretch', textAlign: 'left' }}>
                  <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span>{MODE_LABEL[mode]}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalOf(mode).toLocaleString()}</span>
                  </h2>
                  {rules.length === 0 ? (
                    <p style={{ opacity: 0.6 }}>まだプレイがありません</p>
                  ) : (
                    <table className="result-table" style={{ width: '100%' }}>
                      <tbody>
                        {rules.map((r) => (
                          <tr key={r.ruleKey}>
                            <th style={{ fontWeight: 'normal' }}>{ruleLabel(mode, r.ruleKey)}</th>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {Number(r.total).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          {summary.daily.length > 0 && (
            <div className="card" style={{ alignItems: 'stretch', textAlign: 'left', maxWidth: 640, margin: '0 auto' }}>
              <h2>日別(直近{summary.daily.length}日)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {summary.daily.map((d) => (
                  <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                    <span style={{ width: 88, flexShrink: 0, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                      {d.day.slice(5)}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        height: 14,
                        borderRadius: 3,
                        background: 'var(--accent, #4f8cff)',
                        width: `${(Number(d.total) / dailyMax) * 100}%`,
                        minWidth: 2,
                      }}
                    />
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(d.total).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
        <button className="settings-link" style={{ margin: 0 }} onClick={() => router.push('/')}>
          ← ホームへ
        </button>
      </div>
    </main>
  );
}

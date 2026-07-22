'use client';

// 自分の辞書の削除ページ。投稿フローとは分離して分かりやすくする。
//   1. 本人確認(VerifyStep)
//   2. 削除PRを作成(あなたのレビュー後にアプリ配信から除外)
// ランキングは消さない・gitの履歴には残る旨を明示する。

import { useCallback, useState } from 'react';
import VerifyStep from '../VerifyStep';

type Step = 'verify' | 'confirm' | 'done';

export default function DeletePage() {
  const [step, setStep] = useState<Step>('verify');
  const [acct, setAcct] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prUrl, setPrUrl] = useState('');
  const [error, setError] = useState('');

  const onVerified = useCallback((verifiedAcct: string) => {
    setAcct(verifiedAcct);
    setStep('confirm');
  }, []);

  const requestDelete = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/contribute/delete', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || '削除の申請に失敗しました。');
        return;
      }
      setPrUrl(data.prUrl);
      setStep('done');
    } catch {
      setError('削除に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="app">
      <section className="screen-box contribute">
        <h2>自分の辞書を削除する</h2>
        <p className="info-note">
          本人確認のうえ、あなたのMastodon投稿から作られた辞書を snstyping から削除できます。
        </p>

        {step === 'verify' && <VerifyStep onVerified={onVerified} />}

        {step === 'confirm' && (
          <div className="contribute-section">
            <h3>削除の確認</h3>
            <p className="info-note">
              対象アカウント: <strong>{acct}</strong>
            </p>
            <p>
              削除を申請します。管理者が確認したあと、アプリから取り除かれます(数分〜10分で反映)。
            </p>
            <ul className="info-note" style={{ lineHeight: 1.9, paddingLeft: '1.2rem' }}>
              <li>ランキングは残ります(過去の記録は消えません)。</li>
              <li>公開gitの履歴には残ります(完全消去はできません)。</li>
            </ul>
            {error && <p className="error-note">{error}</p>}
            <div className="button-row">
              <button className="link-button primary" onClick={requestDelete} disabled={busy}>
                削除を申請する
              </button>
              <a className="link-button" href="/contribute">
                やめる
              </a>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="contribute-section">
            <h3>削除を申請しました</h3>
            <p>内容を管理者が確認したあと、アプリから取り除かれます(数分〜10分で反映)。</p>
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

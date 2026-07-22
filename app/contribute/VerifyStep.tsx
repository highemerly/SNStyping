'use client';

// 本人確認ステップ(投稿フローと削除ページで共用)。
// Bot宛にコードを投稿してもらい、送信者が確定できたら onVerified(acct) を呼ぶ。

import { useCallback, useState } from 'react';

export default function VerifyStep({ onVerified }: { onVerified: (acct: string) => void }) {
  const [challenge, setChallenge] = useState<string | null>(null);
  const [postText, setPostText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/contribute/verify/start', { method: 'POST' });
      const data = await res.json();
      setChallenge(data.challenge);
      setPostText(data.postText);
    } catch {
      setMsg('開始に失敗しました。時間をおいて再試行してください。');
    } finally {
      setBusy(false);
    }
  }, []);

  const check = useCallback(async () => {
    if (!challenge) return;
    setBusy(true);
    // 連合の反映に少し時間がかかることがあるので、見つからなければ10秒だけ待って1回だけ再確認する
    const attempt = async (): Promise<'ok' | 'expired' | 'not_found'> => {
      const res = await fetch('/api/contribute/verify/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge }),
      });
      if (res.status === 410) return 'expired';
      const data = await res.json();
      if (data.verified) {
        onVerified(data.acct);
        return 'ok';
      }
      return 'not_found';
    };
    try {
      setMsg('確認しています…');
      let result = await attempt();
      if (result === 'not_found') {
        setMsg('まだ投稿が見つかりません。10秒ほど待ってもう一度確認します…');
        await new Promise((r) => setTimeout(r, 10000));
        result = await attempt();
      }
      if (result === 'expired') {
        setMsg('コードの有効期限が切れました。最初からやり直してください。');
        setChallenge(null);
      } else if (result === 'not_found') {
        setMsg('投稿が見つかりませんでした。Bot宛に投稿できているか確認して、もう一度お試しください。');
      }
      // 'ok' のときは onVerified 側で画面が切り替わる
    } catch {
      setMsg('確認に失敗しました。時間をおいて再試行してください。');
    } finally {
      setBusy(false);
    }
  }, [challenge, onVerified]);

  return (
    <div className="contribute-section">
      <h3>本人確認</h3>
      {!challenge ? (
        <div className="button-row">
          <button className="link-button primary" onClick={start} disabled={busy}>
            本人確認を始める
          </button>
        </div>
      ) : (
        <>
          <p>
            下の文を、あなたのMastodonアカウントから そのまま投稿 してください。
            公開・未収載・DM のいずれでも大丈夫です。
          </p>
          <code className="code-block">{postText}</code>
          <div className="button-row">
            <button className="link-button" onClick={() => navigator.clipboard?.writeText(postText)} disabled={busy}>
              文をコピー
            </button>
            <button className="link-button primary" onClick={check} disabled={busy}>
              投稿した
            </button>
          </div>
        </>
      )}
      {msg && <p className="error-note">{msg}</p>}
    </div>
  );
}

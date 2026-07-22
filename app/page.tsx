'use client';

// ホーム: 「ソロプレイ / ゴースト対戦 / オンライン対戦」の3択メニュー。
// それぞれ別URL(/solo・/ghost・/online)へ遷移し、詳細設定は各画面で選ぶ。
// キーボードでも選べる: 1=ソロ / 2=ゴースト / 3=オンライン / s=設定。

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SettingsModal from '@/components/SettingsModal';

export default function HomePage() {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // メニューのキーボードショートカット(1/2/3/s)。
  // 設定モーダルを開いている間や、入力欄にフォーカスがあるときは無効。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
      // 設定を開いている間は s でトグルして閉じるだけ(他のショートカットは無効)
      if (settingsOpen) {
        if ((e.key === 's' || e.key === 'S') && !typing) {
          e.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }
      if (typing) return;
      switch (e.key) {
        case '1':
          router.push('/solo');
          break;
        case '2':
          router.push('/ghost');
          break;
        case '3':
          router.push('/online');
          break;
        case 's':
        case 'S':
          e.preventDefault();
          setSettingsOpen(true);
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, settingsOpen]);

  return (
    <main className="app">
      <h1 className="title">SNS Typing</h1>
      <p className="subtitle">ログイン不要な楽しいタイピングゲーム</p>

      <div className="cards">
        <div className="card">
          <h2>ソロプレイ</h2>
          <p>1人で腕試し。制限時間・単語リストは次の画面で選べます。</p>
          <button className="primary" data-testid="menu-solo" onClick={() => router.push('/solo')}>
            はじめる <kbd>1</kbd>
          </button>
        </div>

        <div className="card">
          <h2>ゴースト対戦</h2>
          <p>録画されたプレイ(ゴースト)と同じお題で競争。1人でいつでも遊べます。</p>
          <button className="primary" data-testid="menu-ghost" onClick={() => router.push('/ghost')}>
            はじめる <kbd>2</kbd>
          </button>
        </div>

        <div className="card">
          <h2>オンライン対戦</h2>
          <p>公開ルームに参加するか、部屋を作ってURLを友だちに送って1対1で対戦。</p>
          <button className="primary" data-testid="menu-online" onClick={() => router.push('/online')}>
            はじめる <kbd>3</kbd>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
        <button className="settings-link" style={{ margin: 0 }} data-testid="menu-settings" onClick={() => setSettingsOpen(true)}>
          ⚙ 設定 <kbd>S</kbd>
        </button>
        <button className="settings-link" style={{ margin: 0 }} onClick={() => router.push('/contribute')}>
          ✎ 自分の投稿を載せる
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

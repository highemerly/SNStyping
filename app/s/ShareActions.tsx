'use client';

// 共有ページ(/s)下部のボタン。目立つ「自分も挑戦する」(Space割当)と、
// 目立たない「トップへ戻る」の2つ。playHref が同じモードのURL(共有元がリストIDを
// 埋め込んでいれば /solo?t=&list=、無ければ /)。/s は OGP のため server component の
// ままにしたいので、ここだけ client に切り出す。

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ShareActions({ playHref }: { playHref: string }) {
  const router = useRouter();

  // Space / Enter で「自分も挑戦する」
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        router.push(playHref);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, playHref]);

  return (
    <div className="button-row">
      <Link href={playHref} className="link-button primary">
        {playHref === '/' ? '自分も挑戦する' : '同じルールで自分も挑戦する'} <kbd>Space</kbd>
      </Link>
      <Link href="/" className="link-button">トップへ戻る</Link>
    </div>
  );
}

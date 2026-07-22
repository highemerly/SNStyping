// 本人確認済みユーザーが自分の辞書ファイルの削除PRを作る。
// concept: 削除してもランキングは消さない(id+version のランキングはそのまま残る)。
// 注意: アプリ配信からは消えるが、公開gitの履歴には残る(UIで明示する)。

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '@/lib/contribute/session';
import { filenameFor } from '@/lib/contribute/dict';
import { getWordFile, createDeletePr, findOpenContributePr } from '@/lib/contribute/github';

export const runtime = 'nodejs';

function slug(acct: string): string {
  return acct.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export async function POST() {
  const store = await cookies();
  const session = readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const acct = session.acct;
  const filename = filenameFor(acct);

  let file: Awaited<ReturnType<typeof getWordFile>>;
  try {
    file = await getWordFile(filename);
  } catch {
    return NextResponse.json({ error: 'github_failed', message: '状態の確認に失敗しました。' }, { status: 502 });
  }
  if (!file) {
    return NextResponse.json({ error: 'not_found', message: '削除対象の辞書がありません。' }, { status: 404 });
  }

  // 既に削除を申請中なら、重複を作らずその申請を返す(1ユーザー1件)。
  try {
    const openDelete = await findOpenContributePr(`contribute-delete-${slug(acct)}-`);
    if (openDelete) return NextResponse.json({ prUrl: openDelete.htmlUrl, alreadyPending: true });
  } catch {
    // 一覧取得の失敗は握りつぶして新規作成にフォールバック
  }

  // @ の自動メンションを避けるため、タイトル・コミットは "user (server)"、本文はバッククォート。
  const [, user, server] = acct.split('@');
  const acctPlain = `${user} (${server})`;
  const acctCode = '`' + acct + '`';
  try {
    const prUrl = await createDeletePr({
      filename,
      sha: file.sha,
      branch: `contribute-delete-${slug(acct)}-${Date.now()}`,
      commitMessage: `単語リスト削除: ${acctPlain}`,
      prTitle: `単語リスト削除: ${acctPlain}`,
      prBody: [
        `本人確認済みユーザー ${acctCode} による削除依頼。`,
        '',
        '- アプリ配信からは除外されます(マージ後、数分〜10分で反映)。',
        '- ランキングは維持します(id+version の記録は残す方針)。',
      ].join('\n'),
    });
    return NextResponse.json({ prUrl });
  } catch {
    return NextResponse.json({ error: 'github_failed', message: 'PRの作成に失敗しました。' }, { status: 502 });
  }
}

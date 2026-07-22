// 本人確認済みユーザーの最終エントリを受け取り、辞書TSVの追加/更新PRを作る。
// auto-merge はしない = あなたのPRレビューが人手の審査ゲート。

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '@/lib/contribute/session';
import { filenameFor, buildTsv, validateEntry, type Entry } from '@/lib/contribute/dict';
import { getWordFile, createUpsertPr, findOpenContributePr, commitToBranch } from '@/lib/contribute/github';

export const runtime = 'nodejs';

const MAX_ENTRIES = 300;

function slug(acct: string): string {
  return acct.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export async function POST(req: Request) {
  const store = await cookies();
  const session = readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const acct = session.acct;

  let title: unknown;
  let entries: unknown;
  try {
    ({ title, entries } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title が必要です' }, { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'エントリが空です' }, { status: 400 });
  }
  if (entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `エントリが多すぎます(最大${MAX_ENTRIES})` }, { status: 400 });
  }

  // サーバー側でも全エントリを検証(多層防御)。1件でも不正なら弾く。
  const clean: Entry[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const [i, e] of entries.entries()) {
    const display = String((e as Entry)?.display ?? '').trim();
    const reading = String((e as Entry)?.reading ?? '').trim();
    const err = validateEntry(display, reading);
    if (err) {
      errors.push(`${i + 1}件目「${display || '(空)'}」: ${err}`);
      continue;
    }
    if (seen.has(display)) continue; // 重複表示は静かに除去
    seen.add(display);
    clean.push({ display, reading });
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: 'invalid_entries', details: errors.slice(0, 20) }, { status: 400 });
  }

  const filename = filenameFor(acct);
  const content = buildTsv(acct, title.trim(), clean);

  let existingSha: string | undefined;
  try {
    const file = await getWordFile(filename);
    if (file) {
      if (file.text === content) {
        return NextResponse.json({ error: 'no_change', message: '現在の内容と同一です。変更はありません。' }, { status: 409 });
      }
      existingSha = file.sha;
    }
  } catch {
    // 既存確認に失敗しても新規作成として続行(sha 無し PUT)
  }

  const verb = existingSha ? '更新' : '追加';
  // "@user@server" をそのまま書くと GitHub が @ を無関係なユーザーへのメンションに
  // 自動リンクしてしまう。タイトル・コミットは @ を含まない "user (server)" 形式にし、
  // 本文はバッククォートで囲んで自動リンクを無効化する。
  const [, user, server] = acct.split('@');
  const acctPlain = `${user} (${server})`;
  const acctCode = '`' + acct + '`';
  const commitMessage = `単語リスト${verb}: ${acctPlain}(${clean.length}エントリ)`;

  // 1ユーザー1件に保つ: 既存の未マージ申請があれば、それを上書き更新する。
  // 削除を申請中のときは新しい申請を受け付けない。
  let openAdd: Awaited<ReturnType<typeof findOpenContributePr>> = null;
  try {
    const openDelete = await findOpenContributePr(`contribute-delete-${slug(acct)}-`);
    if (openDelete) {
      return NextResponse.json(
        { error: 'delete_pending', message: '削除の申請を受付中です。反映されるまで、新しい申請はできません。' },
        { status: 409 },
      );
    }
    openAdd = await findOpenContributePr(`contribute-${slug(acct)}-`);
  } catch {
    // 一覧取得に失敗したら重複チェックは諦めて新規作成にフォールバック
  }

  try {
    let prUrl: string;
    if (openAdd) {
      // 既存の未マージ申請を上書き更新(申請は1本のまま最新化)
      await commitToBranch({ filename, content, branch: openAdd.ref, commitMessage });
      prUrl = openAdd.htmlUrl;
    } else {
      prUrl = await createUpsertPr({
        filename,
        content,
        branch: `contribute-${slug(acct)}-${Date.now()}`,
        existingSha,
        commitMessage,
        prTitle: `単語リスト${verb}: ${acctPlain}`,
        prBody: [
          `本人確認済みユーザー ${acctCode} による投稿フローからの${verb}(${clean.length}エントリ)。`,
          '',
          '- ふりがなは自動生成 + 本人手直し。マージ前に内容をご確認ください。',
          '- 全エントリはエンジンで打鍵可能・文字集合を検証済み。',
        ].join('\n'),
      });
    }
    return NextResponse.json({ prUrl, entries: clean.length, action: verb, updated: !!openAdd });
  } catch (e) {
    return NextResponse.json({ error: 'github_failed', message: '申請の送信に失敗しました。時間をおいて再試行してください。' }, { status: 502 });
  }
}

// 本人確認済みユーザーの公開投稿を取得し、ふりがな生成して返す。
// 既存の辞書ファイルがあれば、その手直し済みエントリも一緒に返す(更新時のマージ用)。

import path from 'node:path';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '@/lib/contribute/session';
import { lookupAccount, fetchStatuses, getTokenizer, statusesToEntries, DEFAULT_COUNT } from '@/lib/sns/pipeline';
import { filenameFor, parseTsv } from '@/lib/contribute/dict';
import { getWordFile, findOpenContributePr } from '@/lib/contribute/github';

export const runtime = 'nodejs';

const slug = (acct: string) => acct.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

export async function GET(req: Request) {
  const store = await cookies();
  const session = readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const acct = session.acct; // "@user@server"
  const [, username, server] = acct.split('@');
  const count = Number(new URL(req.url).searchParams.get('count')) || DEFAULT_COUNT;

  // 既存ファイル(あれば)を先に読む → 手直し済みエントリを保護し、重複を防ぐ
  let existing: { display: string; reading: string }[] = [];
  let existingTitle: string | null = null;
  try {
    const file = await getWordFile(filenameFor(acct));
    if (file) {
      const parsed = parseTsv(file.text);
      existing = parsed.entries;
      existingTitle = parsed.title;
    }
  } catch {
    // 既存ファイル取得の失敗は致命ではない(新規として続行)
  }

  let account: { id: string; display_name: string };
  let statuses: { content: string; spoiler_text?: string; sensitive?: boolean; url?: string; uri?: string }[];
  try {
    account = await lookupAccount(server, username);
    statuses = await fetchStatuses(server, account.id, count);
  } catch (e) {
    return NextResponse.json({ error: 'mastodon_unreachable', message: '投稿の取得に失敗しました。' }, { status: 502 });
  }

  const tokenizer = await getTokenizer(path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict'));
  const existingDisplays = new Set(existing.map((e) => e.display));
  const { entries, skipped, dropped } = statusesToEntries(tokenizer, statuses, { existingDisplays });

  // 未マージの申請があるか(本人確認直後にUIで知らせる)
  let pending: { addUrl: string | null; deletePending: boolean } = { addUrl: null, deletePending: false };
  try {
    const openDelete = await findOpenContributePr(`contribute-delete-${slug(acct)}-`);
    const openAdd = await findOpenContributePr(`contribute-${slug(acct)}-`);
    pending = { addUrl: openAdd?.htmlUrl ?? null, deletePending: !!openDelete };
  } catch {
    // 申請状況の取得失敗は致命ではない(通知を出さないだけ)
  }

  return NextResponse.json({
    acct,
    title: existingTitle ?? `${account.display_name} @${username}`,
    pending,
    existing,
    fresh: entries,
    dropped, // 打鍵不能で自動除外(UIで手直しすれば復活可能)
    skipped,
  });
}

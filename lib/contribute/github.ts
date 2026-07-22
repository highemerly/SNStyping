// snstyping-dict への PR を GitHub REST API で作る(サーバーレスにローカル git は無い)。
// 追加/更新は PUT contents、削除は DELETE contents をブランチ上で行い、PR を立てる。
// auto-merge はしない = リポジトリ所有者(あなた)の PR レビューが人手の審査ゲート。
//
// 必要な環境変数:
//   GITHUB_BOT_PAT    fine-grained PAT(snstyping-dict の Contents:RW / Pull requests:RW)
//   GITHUB_DICT_REPO  省略時 "highemerly/snstyping-dict"

const API = 'https://api.github.com';

function repo(): { owner: string; repo: string } {
  const full = process.env.GITHUB_DICT_REPO || 'highemerly/snstyping-dict';
  const [owner, name] = full.split('/');
  return { owner, repo: name };
}

function token(): string {
  const t = process.env.GITHUB_BOT_PAT;
  if (!t) throw new Error('GITHUB_BOT_PAT が未設定です');
  return t;
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'snstyping-contribute',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

async function ghJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await gh(path, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub ${init?.method ?? 'GET'} ${path}: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

const wordsPath = (filename: string) => `words/${encodeURIComponent(filename)}`;

// PRの差分(Files changed)タブのURL。会話タブより差分が見やすいのでこちらを返す。
const filesView = (htmlUrl: string) => `${htmlUrl}/files`;

// 指定ref(既定 main)の TSV を読む(なければ null)。
// 更新時の既存マージ・削除時の sha 取得・既存PRブランチの内容確認に使う。
export async function getWordFile(
  filename: string,
  ref = 'main',
): Promise<{ text: string; sha: string } | null> {
  const { owner, repo: name } = repo();
  const res = await gh(`/repos/${owner}/${name}/contents/${wordsPath(filename)}?ref=${encodeURIComponent(ref)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get contents: HTTP ${res.status}`);
  const json = (await res.json()) as { content: string; sha: string; encoding: string };
  const text = Buffer.from(json.content, json.encoding as BufferEncoding).toString('utf8');
  return { text, sha: json.sha };
}

// head ブランチが prefix で始まる未マージ(オープン)のPRを1件返す。
// 1ユーザー1PRを保つため、既存の投稿/削除申請を探すのに使う。
export async function findOpenContributePr(
  headPrefix: string,
): Promise<{ number: number; ref: string; htmlUrl: string } | null> {
  const { owner, repo: name } = repo();
  const pulls = await ghJson<Array<{ number: number; html_url: string; head: { ref: string } }>>(
    `/repos/${owner}/${name}/pulls?state=open&per_page=100`,
  );
  const hit = pulls.find((p) => p.head.ref.startsWith(headPrefix));
  return hit ? { number: hit.number, ref: hit.head.ref, htmlUrl: filesView(hit.html_url) } : null;
}

// 既存PRのブランチに新内容をコミットする(= そのPRを最新化)。
// ブランチ上の内容が既に同一なら何もしない(冪等)。
export async function commitToBranch(opts: {
  filename: string;
  content: string;
  branch: string;
  commitMessage: string;
}): Promise<void> {
  const current = await getWordFile(opts.filename, opts.branch);
  if (current && current.text === opts.content) return; // 既に最新
  const { owner, repo: name } = repo();
  await ghJson(`/repos/${owner}/${name}/contents/${wordsPath(opts.filename)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: opts.commitMessage,
      content: Buffer.from(opts.content, 'utf8').toString('base64'),
      branch: opts.branch,
      ...(current ? { sha: current.sha } : {}),
    }),
  });
}

async function mainSha(): Promise<string> {
  const { owner, repo: name } = repo();
  const ref = await ghJson<{ object: { sha: string } }>(`/repos/${owner}/${name}/git/ref/heads/main`);
  return ref.object.sha;
}

async function createBranch(branch: string, fromSha: string): Promise<void> {
  const { owner, repo: name } = repo();
  await ghJson(`/repos/${owner}/${name}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
}

async function openPr(branch: string, title: string, body: string): Promise<string> {
  const { owner, repo: name } = repo();
  const pr = await ghJson<{ html_url: string }>(`/repos/${owner}/${name}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, head: branch, base: 'main', body }),
  });
  return filesView(pr.html_url);
}

// TSV を追加/更新する PR を作る。既存があれば上書き(sha 指定)。
export async function createUpsertPr(opts: {
  filename: string;
  content: string;
  branch: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  existingSha?: string;
}): Promise<string> {
  const { owner, repo: name } = repo();
  await createBranch(opts.branch, await mainSha());
  await ghJson(`/repos/${owner}/${name}/contents/${wordsPath(opts.filename)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: opts.commitMessage,
      content: Buffer.from(opts.content, 'utf8').toString('base64'),
      branch: opts.branch,
      ...(opts.existingSha ? { sha: opts.existingSha } : {}),
    }),
  });
  return openPr(opts.branch, opts.prTitle, opts.prBody);
}

// TSV を削除する PR を作る。
export async function createDeletePr(opts: {
  filename: string;
  sha: string;
  branch: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
}): Promise<string> {
  const { owner, repo: name } = repo();
  await createBranch(opts.branch, await mainSha());
  await ghJson(`/repos/${owner}/${name}/contents/${wordsPath(opts.filename)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: opts.commitMessage, sha: opts.sha, branch: opts.branch }),
  });
  return openPr(opts.branch, opts.prTitle, opts.prBody);
}

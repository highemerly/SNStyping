# 開発

手元での起動は [README.md](../README.md)「開発環境の起動」を参照。

## ブランチと PR

- **main へは直接コミット・push しない。** 変更は必ずブランチを切り、PR → CI 緑 → squash マージで取り込む
- 手元: [.githooks/pre-commit](../.githooks/pre-commit) が main 上のコミットを拒否する。clone ごとに1回有効化する。
  あわせてコミットの作者のメールを GitHub の noreply にする（公開リポジトリなので、ブランチのコミットの作者は
  PR の画面で誰でも見られる。squash のコミットは GitHub の設定のメールになるが、ブランチのコミットは手元の設定のまま残る）:
  ```bash
  git config core.hooksPath .githooks
  git config user.email 3039555+highemerly@users.noreply.github.com
  ```
- サーバー側: GitHub の ruleset（定義は [.github/rulesets/main.json](../.github/rulesets/main.json)）が
  main への push を拒否する
- PR は自分に assign する（`gh pr create --assignee @me`）。どのリポジトリの PR も github.com/pulls の
  「Assigned to you」にまとまるので、見落とさない

### ruleset の中身と理由

| ルール | 設定 | 理由 |
|---|---|---|
| PR 必須 | 承認数 0 | 一人運用で、自分の PR は自分で承認できないため |
| マージ方式 | squash のみ＋linear history | 「1変更＝1コミット」の履歴を保つ |
| 必須チェック | `ci-result`（走ったジョブの結果をまとめたもの） | ブランチへの push で [ci.yml](../.github/workflows/ci.yml) が付ける。ジョブは差分で間引く（下の「CI」）ので、個別に必須にするとスキップされたジョブに結果が付かずマージできなくなる |
| 最新化の強制 | しない（strict=false） | PR が並んだとき、1件マージするたびに全件を rebase・再 CI させないため |
| force push・削除 | 禁止 | |
| バイパス | なし（管理者も対象） | |
| 作者の紐づかないコミットの追加承認 | 求めない | 省略すると true が入り、アカウントに紐づかない作者のコミットがあると自分で承認できずマージできなくなる |

ruleset を変えたら JSON を直して反映する（作成時は POST、以降は `gh api repos/highemerly/SNStyping/rulesets` で id を引いて PUT）:
```bash
gh api -X POST repos/highemerly/SNStyping/rulesets --input .github/rulesets/main.json
gh api -X PUT repos/highemerly/SNStyping/rulesets/<id> --input .github/rulesets/main.json
```

リポジトリの設定（squash のみ・マージ後にブランチを自動削除・auto-merge を有効・squash のコミットメッセージは PR のタイトルだけ）:
```bash
gh api -X PATCH repos/highemerly/SNStyping \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_auto_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK
```

## CI

[ci.yml](../.github/workflows/ci.yml) が **main 以外のブランチへの push** で動く。main への push では回さない
（squash マージ前に同じ中身をブランチで通しているため）。

| ジョブ | 中身 | 所要時間の目安 |
|---|---|---|
| checks（[checks.yml](../.github/workflows/checks.yml)） | `npm test`（判定エンジンの unit テスト）・`next build`（型検査を含む）・`wrangler deploy --dry-run`（Worker のバンドル） | 1〜2分 |
| ci-result | 走ったジョブの結果を1つにまとめる（必須チェック） | 数秒 |

**差分で間引く。** [.github/scripts/ci-targets.sh](../.github/scripts/ci-targets.sh) が main との merge-base からの差分ファイルを見て決める:

- 動作に影響しないもの（`*.md`・`docs/`・`.claude/`・`.githooks/`・`.github/rulesets/`・`.github/renovate.json5`・`.github/release.yml`・`.gitignore`）だけなら何も回さない。ci-result はスキップを通すので緑になる
- タグ push・手での実行でしか動かないワークフロー（`release.yml`・`tag-release.yml`）はブランチでは確かめようがないので回さない
- それ以外（アプリ・Worker・依存・CI の配線・一覧に無い種類のファイル）は checks を回す

手元で判定を試す（`GITHUB_OUTPUT` が無ければ標準出力に出る）:
```bash
git fetch origin && .github/scripts/ci-targets.sh
```

新しい種類のファイルを足したら、判定の一覧も見直す。

## リリース

**リリース＝本番へのデプロイ。`v*` タグで行う。** main へのマージではどこにもデプロイされない
（Vercel の main の自動デプロイは [vercel.json](../vercel.json) の `git.deploymentEnabled` で止めている。PR のプレビューは付く）。
依存の更新が自動でマージされても、対戦中の部屋を切る Worker の再デプロイも、リリースするまでは起きない。

### 出し方

Actions の **Tag a release**（[tag-release.yml](../.github/workflows/tag-release.yml)）で上げ方を選んで実行する。
前回の `vX.Y.Z` タグから次の版を計算し、main の先頭にタグを打って [release.yml](../.github/workflows/release.yml) を呼ぶ。

```bash
gh workflow run tag-release.yml --ref main -f bump=patch
```

| 上げ方 | いつ |
|---|---|
| patch | 修正と依存の更新だけ（脆弱性の PR をマージしたら、パッチ版を出す） |
| minor | 新しい機能（遊ぶ人から見てできることが増えた） |
| major | 互換性を崩す（例：ゴーストのファイルや URL が使えなくなる） |

版はタグだけに持つ（package.json に `version` は置かない）。飛び番の版や最初の版は、タグを手で push してもよい
（`git tag v1.2.3 && git push origin v1.2.3`。tag push でも同じ release.yml が動く）。

### タグで何が起きるか

| ジョブ | 中身 |
|---|---|
| meta | 版の確認、前回のタグ、Worker が変わったか（`realtime/`・`lib/engine/words.js`）、DO のマイグレーションが増えたか |
| checks | ブランチの CI と同じ検査を**全部**（差分で省かない） |
| deploy-worker | `wrangler deploy`。**前回のタグから Worker に関わるファイルが変わったときだけ**（再デプロイで対戦中の部屋が切れるため） |
| deploy-vercel | `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`。続けて本番の画面と Worker が 200 を返すかを確かめる |
| release | GitHub Release を作る（ノートは自動生成。PR の一覧を Changes と Dependencies（`dependencies` ラベル）に分ける。分類は [.github/release.yml](../.github/release.yml)） |

- **GitHub Release がある版＝本番に出た版。** 途中で落ちたら Release はできない。直したら失敗した実行を Re-run するか、次のパッチ版を出す
- **Worker を先、Vercel を後に出す。** 新しい画面は新しい Worker を前提にしうるため。数十秒は「新しい Worker＋古い画面」が共存するので、
  対戦プロトコルの変更は古い画面からの接続でも壊れないようにする
- Worker が import する `realtime/` の外のファイルを増やしたら、release.yml の `WORKER_PATHS` にも足す（足さないと、その変更だけのリリースで Worker が出ない）
- **Durable Objects のマイグレーション**（`realtime/wrangler.jsonc` の `migrations`）は `wrangler deploy` で自動で当たるが、戻せない。
  増えた版は Release の先頭に警告が付く。DO のクラスの削除・改名は特に慎重に
- 同時に2つのリリースは走らない（concurrency。キャンセルもしない）

### 必要な設定

GitHub の Environment **`release`**（デプロイ元を `main` ブランチと `v*` タグに限る。Tag a release から呼ばれると ref は main のため両方）に Secrets を置く:

| Secret | 中身 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 「Edit Cloudflare Workers」テンプレートで発行したトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |
| `VERCEL_TOKEN` | Vercel のトークン |
| `VERCEL_ORG_ID`・`VERCEL_PROJECT_ID` | `vercel link` で作られる `.vercel/project.json` の `orgId`・`projectId` |

Vercel の環境変数（Production）: `.env.local` の一式（`CONTRIBUTE_SESSION_SECRET` / `BOT_MASTODON_*` / `GITHUB_BOT_PAT` / `GITHUB_DICT_REPO`）
＋ `NEXT_PUBLIC_REALTIME_URL`（Worker の URL。疎通確認もここから読む）＋ 独自ドメイン運用時は `NEXT_PUBLIC_SITE_URL`。
`NEXT_PUBLIC_*` はビルド時に埋め込まれるので、変えたら次のリリースで反映される。独自ドメインへ移したら release.yml の `SITE_URL` も直す。

### ロールバック

- 画面（Vercel）: ダッシュボードの Instant Rollback、または `npx vercel rollback`
- Worker: `npx wrangler rollback -c realtime/wrangler.jsonc`（DO のマイグレーションより前には戻せない）
- 落ち着いたら revert の PR をマージして、パッチ版を出す（main と本番をずらしたままにしない）

### 手動デプロイ（フォールバック）

Actions が使えないときだけ:

```sh
npm run deploy:realtime          # Worker を Cloudflare にデプロイ(要 wrangler login)
npx vercel --prod                # Next.js 本体を Vercel にデプロイ
```

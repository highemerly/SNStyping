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
- main への push でしか動かないワークフロー（`deploy-worker.yml`）はブランチでは確かめようがないので回さない
- それ以外（アプリ・Worker・依存・CI の配線・一覧に無い種類のファイル）は checks を回す

手元で判定を試す（`GITHUB_OUTPUT` が無ければ標準出力に出る）:
```bash
git fetch origin && .github/scripts/ci-targets.sh
```

新しい種類のファイルを足したら、判定の一覧も見直す。

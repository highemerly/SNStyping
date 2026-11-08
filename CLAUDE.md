# CLAUDE.md

- 応答は日本語で行う。GitHub に出すもの（コミットメッセージ・PR のタイトルと本文・Release のノート・Issue）は英語で書く。PR の本文は短く（`## Summary` に何をなぜ変えるかを1〜3文）。
- main へは直接コミットしない。作業を始めるときにブランチを切り、PR（squash マージ）で取り込む（[docs/development.md](docs/development.md)「ブランチと PR」）。PR は自分に assign する（`gh pr create --assignee @me`）。
- CI の構成・差分での間引きは [docs/development.md](docs/development.md)「CI」を参照する。新しい種類のファイルを足したら `.github/scripts/ci-targets.sh` の判定も見直す。
- 構成・遊び方・対戦プロトコル・デプロイは [README.md](README.md) を参照する。

## 公開リポジトリ

- ワークフローで要る値（Cloudflare のアカウント ID・API トークン、Vercel のトークンや ID など）はコード・docs・コミットメッセージ・PR に書かず、GitHub の Secrets に置く（Actions のログも公開される）。
- コミットの作者のメールは GitHub の noreply（`3039555+highemerly@users.noreply.github.com`）にする（設定は docs/development.md「ブランチと PR」）。

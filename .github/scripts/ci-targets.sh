#!/usr/bin/env bash
# ブランチ push の CI（ci.yml）で、どのジョブを回すかを決める。
# main との差分ファイルを見て、変更が影響しうるジョブだけ true にする。
#
# 方針（docs/development.md「CI」）:
# - 動作に影響しないもの（ドキュメント・設定・hook）だけの変更では何も回さない。
# - 下の一覧にないファイルは全部回す（知らない種類の変更を素通しさせない）。
#
# 使い方: ci-targets.sh。GITHUB_OUTPUT があればそこへ、無ければ標準出力へ書く（手元で試せる）。
set -euo pipefail

checks=false

base="$(git merge-base origin/main HEAD)"
while IFS= read -r file; do
  case "$file" in
    # 動作に影響しないもの（ドキュメント・Claude Code の設定・ローカル hook・GitHub の設定・
    # リリースノートの分類・手元用の設定）
    *.md | docs/* | .claude/* | .githooks/* | .github/rulesets/* | .github/renovate.json5 | .github/release.yml | .gitignore) ;;
    # main への push でしか動かない（ブランチでは確かめようがない）
    .github/workflows/deploy-worker.yml) ;;
    *) checks=true ;;
  esac
done < <(git diff --name-only "$base" HEAD)

out="${GITHUB_OUTPUT:-/dev/stdout}"
echo "checks=$checks" >> "$out"

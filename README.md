# SNS Typing

SNSの投稿内容を使ってタイピングアプリ [Weather Typing](https://denasu.com/software/weathertyping.html) の教材を作成するスクリプトです。現在は[Mastodon](https://github.com/tootsuite/mastodon)にのみ対応しています。

## Requirements

- Ruby
- 形態素解析
	- [Juman++](http://nlp.ist.i.kyoto-u.ac.jp/index.php?JUMAN++)
	- [Mecab](https://www.mlab.im.dendai.ac.jp/~yamada/ir/MorphologicalAnalyzer/MeCab.html)

### 形態素解析

このスクリプトでは，投稿内容をひらがなに変換するため，形態素解析システムを2つ使います（実際にはどちらか片方だけでも良いのですが，完全にひらがなに変換できない場合があるようで，組み合わせて使うことで精度と速度を両立できるようにしています）。

MacOSの場合，brewがインストールされていれば，以下のようにインストール可能です。Mecabの辞書は環境に合わせて適当に選択してください。

```
% brew install jumanpp
% brew install mecab mecab-ipadic
```

## Install

```
% git clone https://github.com/highemerly/snstyping
% cd snstyping
% bundle install
```

## How to use

### Mastodon

[Mastodon](https://github.com/tootsuite/mastodon)の特定ユーザの最近の発言，ログインユーザのお気に入りやブックマーク等を元にワードファイルを生成します。

#### 事前設定

Mastodonへのログイン設定です。取得するデータによって必須の場合と必須でない場合がありますが，必須でなくともログインしておくことでAPI制限が緩和されますので，ログインすることを強くオススメします。アクセストークンは何らかの方法で予め取得し，以下の様に環境変数に読ませておいてください。

```
% export MASTODON_ACCESS_TOKEN="<mastodon-access-token>"
```

#### ファイルの出力

現状はMastodonにおいて，特定ユーザの発言を遡る部分だけ実装されています。結果は標準出力に出力されます。

```
% ruby user.rb -h
Usage: user [options]
    -i, --account-id VALUE           Specify :id for account
    -m, --max-id VALUE               Specify initial max_id
    -u, --with-unlisted-toot         Accept not only public but also unlisted toot (default: false)
    -n, --number VALUE               Specify number of API call (default: 10)
```

実行例を示します。標準出力をテキストファイルに保存し，そのファイルをWeatherTyptingに読ませれば，タイピングゲームを楽しむことができます。

```
% ruby user.rb -i 1 -u -n 3 > snstyping.txt
```

### Weather Typing

現在SNS Typingは，`.txt` 形式の出力のみ対応しています。将来的には `.xml` にも対応予定です。

タイピングを行うためには，`.txt` 形式で保存したファイルを読み込んでください。詳細な方法は，[Weather Typing 公式FAQ](https://denasu.com/software/wtfaq.html)などを参照してください。

## 注意

- SNSでの発言は，たとえインターネット上に公開されているものであったとしても，発言者に著作権等がある場合がほとんどです（正確には，Mastodonサーバなどサービス提供元の利用規約に記載のとおりですので，サーバにより異なります。各自で確認してください）。そのため，発言の利用可否については慎重に判断をしてください。このスクリプトは他人の発言の無断利用を推奨するものではなく，適切な承諾を得て利用することを前提としています。
- このスクリプトでは発言をひらがなに変換します。その精度は利用している外部ライブラリに依存します。
- このスクリプトは，Weather typingの開発元様とは関係がありません。このスクリプトについて，Weather Typingの開発元へ問合せるのは控えてください。
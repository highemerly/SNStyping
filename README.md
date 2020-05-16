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

#### 事前設定：Mastodonへのログイン

Mastodonへのログイン設定です。取得するデータによって必須の場合と必須でない場合がありますが，必須でなくともログインしておくことでAPI制限が緩和されますので，ログインすることを強くオススメします。アクセストークンは何らかの方法で予め取得し，以下のように環境変数に読ませておいてください。

```
% export MASTODON_ACCESS_TOKEN="<mastodon-access-token>"
```

#### トゥートの取得方法

取得方法に応じて適切なスクリプトファイルを選択します。

|ファイル名|内容|ログイン|
|:--------|:---|:---|
|`user.rb`|特定のユーザの発言を取得します。|推奨|
|`bookmark.rb`|自身がブックマークした発言を取得します。|必須|
|`favourite.rb`|自身がお気に入りに登録した発言を取得します。|必須|

#### ファイルの出力

特定ユーザの発言をさかのぼって取得する，`user.rb`を利用する場合の例で説明します。設定はコマンドラインパラメータで設定します。`-h`または`--help` を付与することで各パラメータの詳細を確認することができます。

```
% ruby user.rb -h
Usage: user [options]
    -s, --service VALUE              Specify service hostname
    -i, --account-id VALUE           Specify :id for account
    -m, --max-id VALUE               Specify initial max_id
    -f, --favourite-threshold VALUE  Specify favourite-threshold (default: 2)
    -u, --with-unlisted-toot         Accept not only public but also unlisted toot (default: false)
    -n, --number VALUE               Specify page count for API call (default: 10)
    -v, --verbose                    Set verbose mode (default: false)
```

実行例を示します。標準出力をテキストファイルに保存し，そのファイルをWeatherTyptingに読ませれば，タイピングを楽しむことができます。また，標準エラー出力として，より古い発言を取得したい場合にそのまま利用出来るコマンドが表示されます。

```
% ruby user.rb -s handon.club -i 1 -u -n 3 > output/snstyping.txt
For more toot:
 ruby user.rb -s handon.club -i 1 -m 104178019177316642 -f 2 -n 3
```

`-m`オプションで設定出来る`max-id`は，Mastodon API上の値です。`user.rb`の場合はトゥート自体のIDを指定しますが，`favourite.rb`や`bookmark.rb`の場合は内部的に利用されているIDを指定することに注意してください。詳細は，MastodonのAPIガイドを参照してください。

### Weather Typing

現在SNS Typingは，`.txt` 形式の出力のみ対応しています。将来的には `.xml` にも対応予定です。

タイピングを行うためには，`.txt` 形式で保存したファイルを読み込んでください。詳細な方法は，[Weather Typing 公式FAQ](https://denasu.com/software/wtfaq.html)などを参照してください。

## 注意

- SNSでの発言は，たとえインターネット上に公開されているものであったとしても，発言者に著作権等がある場合がほとんどです（正確には，Mastodonサーバなどサービス提供元の利用規約に記載のとおりですので，サーバにより異なります。各自で確認してください）。そのため，発言の利用可否については慎重に判断をしてください。このスクリプトは他人の発言の無断利用を推奨するものではなく，適切な承諾を得て利用することを前提としています。
- このスクリプトでは発言をひらがなに変換します。その精度は利用している外部ライブラリに依存します。
- このスクリプトは，Weather typingの開発元様とは関係がありません。このスクリプトについて，Weather Typingの開発元へ問合せるのは控えてください。
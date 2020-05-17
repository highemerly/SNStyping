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

### Mastodonを用いたワードファイル生成

[Mastodon](https://github.com/tootsuite/mastodon)の特定ユーザの最近の発言，ログインユーザのお気に入りやブックマーク等を元にワードファイルを生成します。

#### 事前設定：Mastodonへのログイン

Mastodonへのログイン設定です。取得するデータによって必須の場合と必須でない場合がありますが，必須でなくともログインしておくことでAPI制限が緩和されますので，ログインすることをオススメします。アクセストークンは何らかの方法で予め取得し，以下のように環境変数に読ませておいてください。

```
% export MASTODON_ACCESS_TOKEN="<mastodon-access-token>"
```

#### スクリプトファイルの選択

ワードファイルの基となるトゥートをどのように取得するかを決定します。その取得方法に応じて適切なスクリプトファイルを選択する必要があります。ファイルは `bin/mastodon` または `bin/mastodon-ext` の中にあり，以下に示す取得方法を選ぶことが出来ます。

- `bin/mastodon`配下
|ファイル名|取得方法|ログイン|
|:--------|:---|:---|
|`user.rb`|特定のユーザの発言を取得します。|推奨|
|`bookmark.rb`|自身がブックマークした発言を取得します。|必須|
|`favourite.rb`|自身がお気に入りに登録した発言を取得します。|必須|
|`local_timeline.rb`|ローカルタイムラインの発言を取得します。|推奨|
|`hashtag.rb`|ハッシュタグタイムラインの発言を取得します。|推奨|

- `bin/mastodon-ext`配下: Mastodonに関する外部サービス
|ファイル名|取得方法|ログイン|ドキュメント|
|:--------|:---|:---|
|`hagetter.rb`|ログまとめサービス([Hagetter](https://hagetter.hansode.club/))の発言を取得します。|不要|[リンク](doc/hagetter.md)|

#### スクリプトの実行

ここでは，特定ユーザの発言をさかのぼって取得する，`bin/mastodon/user.rb`を利用する場合の例で説明します。

設定は原則コマンドラインパラメータで設定します。`-h`または`--help` を付与することで各パラメータの詳細を確認することができます（パラーメタはスクリプトファイルにより若干異なります）。

```
% ruby bin/mastodon/user.rb --help
Usage: user [options]
    -s, --service STRING             Specify service hostname
    -i, --account-id VALUE           Specify :id for account
    -m, --max-id VALUE               Specify initial max_id
    -f, --favourite-threshold VALUE  Specify threshold of favourite (default: 0)
    -u, --with-unlisted-toot         Accept not only public but also unlisted toot (default: false)
    -p, --enable-permission-check    Check permission .json file (default: false)
    -n, --number VALUE               Specify page count for API call (default: 10)
    -v, --verbose                    Set verbose mode (default: false)
```

実行例を示します。標準出力をテキストファイルに保存し，そのファイルをWeatherTyptingに読ませれば，タイピングを楽しむことができます。また，標準エラー出力として，より古い発言を取得したい場合にそのまま利用出来るコマンドが表示されます。

```
% ruby bin/mastodon/user.rb -s handon.club -i 1 -u -n 3 > output/snstyping.txt
For more toot:
 ruby bin/mastodon/user.rb -s handon.club -i 1 -m 104178019177316642 -f 2 -n 3
```
- `-m [VALUE]`: max-idの指定

Mastodon API上の値です。指定が無い場合，最新のトゥートを取得します。
`user.rb`の場合はトゥート自体のIDを，`favourite.rb`や`bookmark.rb`の場合はHTTPリンクヘッダによって取得出来るIDを指定することで，古いトゥートを取得出来るようになります。
詳細は，[MastodonのAPIガイド](https://docs.joinmastodon.org/api/)を参照してください。

**Tips:** まずは指定せずに実行してみてください。
その際，「For more toot:」に max-id が表示されますので，この max-id を使う事でつづきのトゥート（より古いトゥート）が取得出来ます。

- `-u`: 非収載トゥートの許容

初期設定では，公開トゥートのみの許容となっています。このオプションを有効にすることで，非収載トゥートも許容するようになります。

- `-p`: 許諾リストチェック

本スクリプトの作者により，トゥートをSNS Typingで利用する旨に許諾を得たユーザのリストを[json形式で公開](https://highemerly.net/snstyping/permission.json)しています。
このオプションを付与することで，このjsonファイルを取得し，自動的に許諾確認を行うことが出来ます。
許諾されていないユーザおよび公開範囲のトゥートはワードファイルに含まれなくなります。

### Weather Typingへの読み込み
注意： 現在SNS Typingは，`.txt` 形式の出力のみ対応しています。将来的には `.xml` にも対応予定です。

SNS Typingで作成した `.txt` 形式のファイルを，Weather Typingに読み込んでください。
Weather Typingの詳細な操作方法は，[Weather Typing 公式FAQ](https://denasu.com/software/wtfaq.html)などを参照してください。

## 注意

- SNSでの発言は，たとえインターネット上に公開されているものであったとしても，発言者に著作権等がある場合がほとんどです（正確には，Mastodonサーバなどサービス提供元の利用規約に記載のとおりですので，サーバにより異なります。各自で確認してください）。そのため，発言の利用可否については慎重に判断をしてください。このスクリプトは他人の発言の無断利用を推奨するものではなく，適切な承諾を得て利用することを前提としています。
- このスクリプトでは発言をひらがなに変換します。その精度は利用している外部ライブラリに依存します。
- このスクリプトは，Weather typingの開発元様とは関係がありません。このスクリプトについて，Weather Typingの開発元へ問合せるのは控えてください。
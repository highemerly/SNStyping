# SNS typing

SNSの投稿内容を使ってタイピングアプリ [Weathertyping](https://denasu.com/software/weathertyping.html) の教材を作成するスクリプトです。現在はMastodonにのみ対応しています。

## Requirements

- Ruby
- 形態素解析
	- [Juman++](http://nlp.ist.i.kyoto-u.ac.jp/index.php?JUMAN++)
	- [Mecab](https://www.mlab.im.dendai.ac.jp/~yamada/ir/MorphologicalAnalyzer/MeCab.html)

### 形態素解析

このスクリプトでは，投稿内容をひらがなに変換するため，形態素解析システムを2つ使います（実際にはどちらか片方だけでも良いのですが，完全にひらがなに変換できない場合があるようで，組み合わせて使うことで精度と速度を両立しています）。

MacOSの場合，以下でインストール可能です。

```
% brew install jumanpp
% brew install mecab mecab-ipadic
```

### スクリプト

```
% git clone https://github.com/highemerly/snstyping
% cd snstyping
% bundle install
```

### ログイン設定

Mastodonへのログイン設定です。取得するデータによって必須の場合と必須でない場合があります。アクセストークンは予め取得しておいてください。

```
export MASTODON_ACCESS_TOKEN="<mastodon-access-token>"
```

## How to use

現状はMastodonにおいて，特定ユーザの発言を遡る部分だけ実装済されています。結果は標準出力に出力されます。

```
% ruby user.rb -h
Usage: user [options]
    -i, --account-id VALUE           Specify :id for account
    -m, --max-id VALUE               Specify initial max_id
    -u, --with-unlisted-toot         Accept not only public but also unlisted toot (default: false)
    -n, --number VALUE               Specify number of API call (default: 10)
```

実行例です。標準出力をテキストファイルに保存し，そのファイルをWeatherTyptingに読ませれば，タイピングゲームを楽しむことができます。

```
% ruby user.rb -i 1 -u -n 3 > snstyping.txt
```

## 注意

SNSでの発言は，たとえ公開されているものであったとしても，発言者に著作権等の権利が残ります（Mastodonの場合は各サーバの利用規約を参照してください）。発言の利用については慎重に判断をしてください。





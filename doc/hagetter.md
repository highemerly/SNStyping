# SNS Typing - hagetter.rb

[Hagetter](https://hagetter.hansode.club/)は，一部のMastodonサーバのログをまとめたページを生成できるサービスです。SNS Typingは，hagetterのデータを取得し，Weather Typingのワードファイルを作ることが可能です。

## 準備

[README](../README.md)を参照してください。

## SNS Typingの実行

```
% ruby bin/mastodon-ext/hagetter.rb --help
Usage: hagetter [options]
    -g, --hagetter-id VALUE          Specify hagetter status id
    -f, --favourite-threshold VALUE  Specify threshold of favourite (default: 0)
    -u, --with-unlisted-toot         Accept not only public but also unlisted toot (default: false)
    -p, --enable-permission-check    Check permission .json file (default: false)
```

実行例を示します。

```
% ruby bin/mastodon-ext/hagetter.rb -g 5755696167518208 -up
はんどん相変わらずギャグが低レベル帯 (@hiroakichan)
はんどんあいかわらずぎゃぐがていれべるたい
facなんじ！？ (@highemerly)
facなんじ!?
おやじ (@hiroakichan)
おやじ
```

- `-g`: hagetter-id

必須です。Hagetter内部で使われるIDを指定してください。
IDは，Hagetterの個別まとめページのURLの末尾から取得してください。`https://hagetter.hansode.club/hi/<hagetter-id>`

- その他

その他のオプションは `bin/mastodon` 配下のものと同様です。

## Weather Typingへの読み込み

`bin/mastodon` 配下のものと同様です。

## 謝辞

本スクリプト対応のためにAPIを切ってくれた @osa9 [hagetter](https://github.com/hansodeclub/hagetter) に感謝します。
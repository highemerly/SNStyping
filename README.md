# SNS Typing

Webブラウザで遊べる日本語ローマ字タイピングゲーム。ログイン不要。

将来的には、SNS(まずは Mastodon)の発言履歴をアップロードしてお題として共有できるサービスにする予定。現在は **ソロプレイ + ルームコード対戦** まで実装済み。

## 技術スタック(完全サーバーレス構成)

- **Next.js 16**(App Router / TypeScript)+ React 19 — Vercel等にそのままデプロイ可能
- **対戦サーバー**: Cloudflare Worker + **Durable Objects**(`realtime/`)
  - 「1ルーム = 1 Durable Object」。WebSocket Hibernation API 使用(受信20通=1課金リクエスト換算、アイドル中は実行時間課金なし)
  - 無料枠(10万リクエスト/日)でおよそ1日1,000マッチまで¥0
- タイピング判定エンジンは DOM 非依存の純粋JS(`lib/engine/`)。Next側・Worker側の両方から同じコードを使用

## 開発環境の起動

ターミナル2つで:

```sh
npm install
npm run dev:realtime   # Cloudflare Worker (wrangler dev, port 8787)
npm run dev            # Next.js (port 3100)
```

http://localhost:3100 を開く。

> Node 25 では Next.js が依存する sharp のインストールスクリプトが誤動作するため、
> `package.json` の `overrides` で sharp 0.35 系に固定している。

## デプロイ

```sh
npm run deploy:realtime          # Worker を Cloudflare にデプロイ(要 wrangler login)
```

Next.js 側は Vercel 等へ。環境変数 `NEXT_PUBLIC_REALTIME_URL` に Worker のURL
(例: `https://snstyping-realtime.<account>.workers.dev`)を設定する。

## 遊び方

ホームは **「ソロプレイ / ゴースト対戦 / オンライン対戦」の3択のみ**で、詳細は次の画面で選ぶ。
**スマホ非対応**: モバイルUAでは全ページで案内を表示する(判定間違いは「このまま進む」で通過でき、その選択とUAを localStorage に保存)。

- **ルール**(全遊び方共通): 制限時間(30/60/120秒)内にどれだけ打てるかのスコアアタック。お題はリストを循環する
- **ソロプレイ**: 設定画面で制限時間・単語リストを選ぶ。単語リストは登録済みリストのほか、
  **「TSVをアップロードする…」を選ぶと手元のTSVでそのままプレイできる**(読みが打てないお題は除外して読み込む)。
  リザルトから**ゴースト保存**(下記)もできる
- **ゴースト対戦**: 録画された他人(または過去の自分)のプレイと1人で競争。サーバー不要。
  選択画面で登録済みゴースト(デモは同一お題で ゆっくり/ふつう/はやい の3段階)か `.ghost.json` ファイルを選ぶ
- **開始方法**: ソロ・ゴースト対戦とも **Space で開始 → 3,2,1 のカウントダウン**(オンライン対戦と同じ)
- **オンライン対戦**: 公開ルーム一覧から参加・観戦するか、「部屋を作成」→ 払い出された URL(`/room/xxxxxx`)を相手に送る → 各自が**名前を入力して参加**(前回の名前を記憶)→ ロビーで**両者が Space(または準備OKボタン)を押すと** 3,2,1 のカウントダウンで同時スタート(同じお題・同じ順序)。進捗はリアルタイムで相手に表示され、終了後はロビーに戻って再戦できる
- **対戦ルールの決め方**(部屋の作成時に選択):
  - **提案方式**(デフォルト): 毎試合、ロビーで各自が制限時間・リストを提案し、**両者の提案からランダムでどちらかが採用**される(採用された提案者名はカウントダウン画面に表示)
  - **幹事方式**: 部屋を作った人がホーム画面の設定で固定
- ローマ字はヘボン式・訓令式・混在をすべて受理(`shi/si/ci`、`cchi/tti`、`ja/jya/zya`、`n/nn/n'` など)
- 対戦中は画面上部に自分と相手の進捗バーが並ぶ(スコアの相対比較)
- リザルト画面は **Space でロビーに戻れる**。相手がまだリザルトに居るか、ロビーに移動済みかも表示される
- **観戦**: 満員(2人)の部屋にURLで入ると自動的に観戦者になる(最大20人)。両プレイヤーの打鍵の様子・スコアをリアルタイムで並べて見られ、結果も表示される。対戦中の途中参加も可
- **公開ルーム**: 部屋作成時に「部屋を公開する」(デフォルトON)を選ぶと、オンライン対戦画面の公開ルーム一覧に表示され、URLを共有しなくても誰でも参加・観戦できる。一覧は Directory DO(`realtime/directory.mjs`)が保持し、各 Room DO が参加者の増減・状態変化のたびに報告する(`GET /api/rooms` で取得、一覧画面は5秒ポーリング)。加えて対戦中以外は Room DO が **2分間隔のハートビート**で自分を再報告し、**5分以上更新のないエントリは死んだ部屋として間引く**
- **放置部屋のタイムアウト**: ロビー・リザルトで**10分間操作がない部屋はサーバーが閉じる**(接続者には「しばらく操作がなかったため、部屋が閉じられました。」と表示)。対戦中は対象外
- 対戦ルームの Esc は確認ダイアログを挟んでから退出(誤操作防止。もう一度 Esc でキャンセル、Enter で退出)

## 単語リスト・ゴーストの配信(snstyping-dict リポジトリ)

単語リストTSVとゴーストは本体には置かず、独立リポジトリ
[highemerly/snstyping-dict](https://github.com/highemerly/snstyping-dict) から
GitHub Pages で配信する(`https://highemerly.github.io/snstyping-dict/`)。

- Next側・Worker側とも、カタログ(辞書 `words.json` / ゴースト `ghosts.json`)とファイルを
  **実行時に取得**する(Next側: `lib/dictsource.js` は両方を取得しマージ /
  Worker側: `realtime/room.mjs` の `resolveWordList` は `words.json` のみ取得)
- **リストの追加・更新は snstyping-dict へのPRだけ**でよい。マージすると GitHub Actions が
  カタログを再生成して Pages にデプロイし、数分〜10分程度で本体に反映される(本体の再デプロイ不要)
- 配信元が落ちている場合は内蔵の最小リスト(`lib/engine/words.js` の `FALLBACK_WORDS`)で動く
- 配信元URLは `NEXT_PUBLIC_DICT_BASE_URL`(Next)/ `DICT_BASE_URL`(wrangler.jsonc の vars)で上書き可能

### 単語リストの形式

1行 = `表示テキスト<TAB>ふりがな(ひらがな)`。`#` 始まりはコメント。
ファイル先頭のコメントブロックに `# id:` / `# title:` / `# order:` のメタデータを書く
(カタログ生成に使われる。詳細は snstyping-dict の README)。

```tsv
# id: basic
# title: 基本
今日はいい天気です	きょうはいいてんきです
新幹線	しんかんせん
```

ふりがなはカタカナでも可(内部でひらがなに正規化)。WeatherTyping 形式のインポートは今後対応予定。

## SNSアカウントからの単語リスト生成

**⚠ 投稿の利用は必ず本人の許諾を得てから。**

```sh
npm run words:sns -- @highemerly@handon.club                  # 最新50件(デフォルト)
npm run words:sns -- @highemerly@handon.club --pr             # 生成して snstyping-dict にPRまで自動作成
npm run words:sns -- @seibe@handon.club --count 30            # 件数指定
npm run words:sns -- @seibe@handon.club --title "せいべ"      # 選択UIの表示名を指定(省略時はSNSの表示名)
```

`--pr` は `../snstyping-dict` で最新 main からブランチを切り、TSVをコミット・pushして
`gh` でPRを作成する(要 `gh auth login`)。words/ に未コミットの変更があると中断する。

`scripts/fetch-sns-words.mjs` が以下を一括で行う:

1. Mastodon API で公開投稿を取得(リプライ・ブースト・CW/閲覧注意付きは除外)
2. クリーニング — HTMLタグ・URL・メンション・ハッシュタグ・カスタム絵文字・記号(○●等)を除去し、
   全角英数字を半角へ正規化。残すのは「漢字・かな・ー・々・英数字・、。！？・「」・空白」のみ
3. kuromoji で形態素解析してふりがな(ひらがな)を生成
4. 全エントリを判定エンジン(`lib/engine/romaji.js`)に通して打鍵可能なことを検証
5. snstyping-dict の `words/@ユーザー名@サーバー@YYYYMMDDHHMM.tsv` に書き出し
   (既定の出力先は `../snstyping-dict/words`、`--out` で変更可。同アカウントの旧ファイルは削除)

除外されるエントリ: 読みが5文字未満 / 80文字超 / 重複 / 辞書で読みを決められない語を含む投稿。
件数の内訳は実行ログに出る。

**実行後は必ず生成されたTSVを目視確認する**こと。特にふりがなは kuromoji の辞書頼みなので、
固有名詞やスラングは誤読することがある。誤読を見つけたらスクリプト冒頭の
`KANA_FIXES`(トークン単位)または `READING_FIXES`(文字列置換)に補正を追加して再実行する
(例: 「モバ充→もばたかし」を「もばじゅう」に補正済み)。

書き出したら snstyping-dict 側でコミット・PRを作成する(カタログはマージ後に
Actions が自動生成するので、**TSVファイルだけでよい**)。本体のデプロイは不要。

### リストの削除(許諾の取り下げなど)

snstyping-dict 側で該当TSVを削除するPRを出すだけ(マージでカタログからも消える)。
許諾の取り下げに対応する場合は、git 履歴にも残る点に注意
(必要なら履歴の書き換えも検討する)。

## ゴースト対戦

録画したプレイ(打鍵ログ)を仮想プレイヤーとして再生し、それと競争するモード。
判定エンジンが決定的なので、キー入力の列(開始からのms + キー)を録るだけで
**ミスタイプや綴りの揺れ(shi/si等)も含めてプレイが完全に再現される**。

**⚠ 他人のゴーストの保存・公開は必ず本人の許諾を得てから。**

### 録画する(ゴーストを作る)

1. ソロプレイで普通に遊ぶ(打鍵は常に録画されている。ゲーム中の判定対象キーのみ)
2. リザルト画面で名前を入れて「👻 ゴーストとして保存」→ `.ghost.json` がダウンロードされる

他の人に録画してもらう場合は、デプロイ済みのURLを送って上記をやってもらい、
できた `.ghost.json` を送り返してもらう。

### 対戦する

ホームの「ゴースト対戦」カードで、登録済みゴーストを選ぶか、`.ghost.json` を
ファイル選択して「対戦する」。お題・順序・制限時間はゴースト録画時のものが使われる。
画面にはゴーストがいま打っているお題とローマ字もリアルタイムで表示される。

### ゴーストの登録(共有)

もらった `.ghost.json` を snstyping-dict の `ghosts/` に置くPRを出す
(命名例: `@seibe@handon.club@202607181200.ghost.json`)。表示名はJSONの
トップレベル `"title"`(省略時は `プレイヤー名 (KPM xxx)` を自動生成)。
マージすれば数分で反映され、本体のデプロイは不要。

### ファイル形式と互換性

- お題は単語リストTSVの再生成で変わりうるため、**ゴーストファイルに埋め込む**(自己完結)
- `engineVersion` を持ち、読み込み時に打鍵ログを最後まで再生して記録値と照合する
  (`verifyGhost`)。エンジン変更でずれた場合は警告を出しつつ、勝敗は録画時の確定値で付ける
- 判定を「過去に弾いたキーが受理される」方向に変えたら `lib/engine/ghost.js` の
  `ENGINE_VERSION` をインクリメントすること
- snstyping-dict の `ghosts/demo*.ghost.json` は `node scripts/make-demo-ghost.mjs` で生成した
  合成デモゴースト(一定ペース+時々ミス。実プレイの録画なしで動作確認できる)。
  **全く同じお題**で速度だけ違う3段階: ゆっくり(KPM175)/ ふつう(KPM263)/ はやい(KPM414)

## 構成

```
app/page.tsx               ホーム(ソロ開始 / 部屋作成)
app/room/[code]/page.tsx   対戦ページ
components/
  usePlayerGame.ts         自分側のゲーム進行フック(エンジン+タイマー+キー入力+ゴースト録画)
  SoloGame.tsx / VersusGame.tsx / GhostGame.tsx / WordArea.tsx / sound.ts
  MobileGate.tsx           スマホ非対応の案内ゲート(layout.tsx で全ページを包む)
lib/engine/
  romaji.js                ローマ字テーブル + ふりがな→入力候補チャンクのパーサ
  typing.js                入力判定エンジン(複数の入力経路を並行追跡)
  game.js                  ゲーム進行・スコア
  ghost.js                 ゴーストの形式・検証・再生(GhostPlayer)
  words.js                 単語リストの読み込み・TSVパース
lib/realtime.ts            対戦サーバーの接続先解決
lib/dictsource.js          辞書・ゴーストのカタログ取得(snstyping-dict の Pages から)
scripts/fetch-sns-words.mjs SNS投稿から単語リストTSVを生成(snstyping-dict に書き出し)
scripts/make-demo-ghost.mjs デモゴーストの生成(snstyping-dict に書き出し)
realtime/
  index.mjs                Worker エントリ(部屋作成API・WS振り分け・CORS)
  room.mjs                 Room Durable Object(ルーム状態・マッチ進行・単語リスト取得)
  wrangler.jsonc           Wrangler 設定
tests/typing.test.mjs      エンジンのテスト(node --test)
(単語リスト・ゴーストの実体は ../snstyping-dict → GitHub Pages 配信)
```

### 判定エンジンの仕組み

ふりがなを「チャンク」(かな1〜2文字 + 受理綴り候補の集合)の列に変換し、入力中は `(チャンク位置, チャンク内の入力済み文字列)` の集合として全経路を並行追跡する。`n`(確定)と `nn`(継続)のような曖昧さも枝分かれのまま保持し、後続の打鍵で自然に収束する。促音「っ」・撥音「ん」は次チャンクと結合して文脈依存の候補を生成する。

### 対戦プロトコル(WebSocket)

- `POST <realtime>/api/rooms {ruleType, rule?}` → `{code}` で部屋を作成し、`/room/<code>` で参加(`ruleType`: `propose` | `host`)
- クライアントは `wss://<realtime>/rooms/<code>/ws?name=<名前>` に接続した時点で参加扱い(名前はサーバー側で制御文字除去・20文字制限)
- 各自が `ready`(提案方式ならルール提案付き)を送り、両者揃うとサーバーがルールを確定(提案方式はランダム採用)。お題リスト(シャッフル済み)を両者に配布し、3秒カウントダウン後に同時開始
- 進捗(`progress`)は**250ms間隔に間引いて**送信(トレーリング送信で最終状態は必ず届く)。サーバーは相手にそのまま中継
- 終了時に各自が結果(`done`)を申告し、サーバーが両者分をまとめて配信(`result`)。揃わない場合は Durable Object の Alarm が保険として発火(試合時間+10秒)
- Alarm は対戦中以外はハートビートとして動く(2分間隔で Directory へ再報告、最終活動から10分で部屋を閉じて `idle_timeout` を送る)。対戦開始で試合の保険 Alarm に切り替わり、試合終了で戻る
- 再戦はロビーに戻って再び両者が `ready` するだけ(毎試合ルール決定からやり直し)。切断時は相手に通知して待機状態に戻り、準備状態はリセットされる

## テスト

```sh
npm test                       # 判定エンジン(node --test)
```

## ロードマップ

- [x] 1人用タイムアタック(ローカルTSV)
- [x] オンライン対戦(ルームコード / WebSocket)
- [x] 対戦サーバーのサーバーレス化(Cloudflare Durable Objects)
- [x] Mastodon 投稿からの単語リスト生成(`npm run words:sns`、許諾済みアカウントのみ)
- [x] ゴースト対戦 Phase 1(打鍵ログの録画 → `.ghost.json` → ローカル再生対戦)
- [x] 単語リスト・ゴーストの外部配信化(snstyping-dict リポジトリ + GitHub Pages、PRで動的追加)
- [ ] WeatherTyping 形式ワードファイルのインポート
- [x] 単語リストのアップロード(ローカルファイル選択 → その場でプレイ。ソロのみ)
- [ ] Mastodon OAuth ログイン → 発言履歴の取得・お題化

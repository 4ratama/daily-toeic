# TOEIC Daily Discord ボット

Discord の中で、Part ごとのスレッドにボタン式の問題が出て、曜日ごとに決めた時刻にリマインドが届くボットです。
問題は学習アプリと同じ `questions.json`（GitHub Pages）を読むので、問題を増やすとボットにも出ます。

## できること

| コマンド | 内容 |
|---|---|
| `/setup` | 実行したチャンネルに「Part 5 文法」「Part 5 語彙」「Part 7 読解」「Part 7 言い換え」のスレッドを作ります。リマインドもこのチャンネルに届きます。 |
| `/remind` | リマインド時刻の設定画面を開きます。①曜日（複数可）→ ②時 → ③分 と選ぶと追加されます。「時刻を削除する」で消せます。画面は自分にだけ見えます。 |
| `/quiz` | 1問出します。Part のスレッドの中ならその Part から、外なら `part:` で選べます。 |

- 問題の下の A〜D ボタンを押すと、正解（緑）・あなたの答え（赤）・ポイント・解説が出ます。「次の問題 ▶」で続けられます。長文は設問を1問ずつ進めます。
- その日の最初のリマインドでは、各スレッドに「今日の1問目」を出します。リマインドはあなた宛てのメンション付きなので、スマホに通知が届きます。
- 初期の時刻は毎日 7:30 と 21:00（日本時間）です。1日6回まで設定できます。5分ごとに確認するので、数分遅れることがあります。

## 仕組みと費用

Cloudflare Workers（無料プラン）で動きます。Discord がボタンやコマンドの操作を Workers に送り、Workers が答えを返す方式（Interactions）なので、常に起動しているサーバーはいりません。リマインドは Workers の Cron Trigger が5分ごとに確認して送ります。設定は Workers KV に保存します。1人で使うぶんには無料枠（1日10万リクエスト、KV の書き込み1日1000回）を大きく下回ります。クレジットカードの登録も不要です。

「@ボット名 にメンションして話しかける」形は、Discord とずっと接続しておくサーバー（24時間動くPC）が必要になるため、この方式では使えません。代わりに `/remind` から曜日と時刻を選びます。

## セットアップ（Windows のブラウザで、約20分）

### 1. Discord でボットを作る

1. https://discord.com/developers/applications を開いて Discord でログインし、右上の「New Application」を押します。名前は `TOEIC Daily` などにして作成します。
2. 「General Information」のページで、**APPLICATION ID** と **PUBLIC KEY** をそれぞれ「Copy」してメモ帳に貼っておきます。
3. 左の「Bot」を開き、「Reset Token」→「Yes, do it!」→ 表示された **TOKEN** をコピーしてメモ帳に貼ります（この画面を閉じると二度と表示されません）。下の「Privileged Gateway Intents」は全部オフのままで大丈夫です。
4. 次のURLの `APPLICATION_ID` を2のIDに置き換えてブラウザで開き、自分のサーバーを選んで「認証」します。
   ```
   https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&scope=bot+applications.commands&permissions=309237730304
   ```
   （チャンネルを見る・メッセージ送信・埋め込みリンク・履歴を読む・公開スレッドの作成・スレッドでメッセージを送信、の権限です）

### 2. Cloudflare のアカウントを作る

1. https://dash.cloudflare.com/sign-up で無料登録します（クレジットカード不要）。
2. 左メニューの「Workers & Pages」（「コンピューティング（Workers）」と表示されることもあります）を一度開きます。`xxxx.workers.dev` のサブドメインを決める画面が出たら、好きな名前で登録します。
3. 右上の人のアイコン →「プロファイル」→ 左の「API トークン」→「トークンを作成する」→ **「Cloudflare Workers を編集する」** テンプレートの「テンプレートを使用する」を押します。
   「アカウント リソース」で自分のアカウント、「ゾーン リソース」は「すべてのゾーン」のままで「概要に進む」→「トークンを作成する」。表示されたトークンをコピーします。
4. ダッシュボードのトップ（アカウントのホーム）で、右側か「…」メニューにある **アカウント ID** をコピーします。

### 3. GitHub にシークレットを登録する

https://github.com/4ratama/daily-toeic/settings/secrets/actions →「New repository secret」で、次の5つを登録します。

| Name | Secret（値） |
|---|---|
| `DISCORD_APPLICATION_ID` | 1-2 の APPLICATION ID |
| `DISCORD_PUBLIC_KEY` | 1-2 の PUBLIC KEY |
| `DISCORD_BOT_TOKEN` | 1-3 の TOKEN |
| `CLOUDFLARE_API_TOKEN` | 2-3 のトークン |
| `CLOUDFLARE_ACCOUNT_ID` | 2-4 のアカウント ID |

### 4. デプロイする

1. https://github.com/4ratama/daily-toeic/actions/workflows/bot-deploy.yml を開き、「Run workflow」→「Run workflow」を押します。
2. 1〜2分で緑のチェックになったら、その実行を開き、ページ下の Summary に出る `https://toeic-daily-bot.xxxx.workers.dev` をコピーします。
3. Discord Developer Portal の「General Information」に戻り、**INTERACTIONS ENDPOINT URL** に貼って「Save Changes」を押します。保存できれば接続成功です（エラーになる場合は、`DISCORD_PUBLIC_KEY` が正しいか確認してください）。

### 5. Discord で始める

1. ボットを使いたいチャンネル（例：`#toeic`）で `/setup` と入力して実行します。4つのスレッドができて、それぞれに1問目が出ます。
2. `/remind` で曜日ごとの時刻を設定します。例：平日は「月〜金を選ぶ → 7時 → 30分」、土日は「土・日を選ぶ → 9時 → 0分」。
3. 学習アプリの GitHub Actions の通知と二重に届かないように、https://github.com/4ratama/daily-toeic/actions/workflows/notify.yml の右上「…」→「Disable workflow」で、以前の Webhook 通知を止めます（アプリの「⚙︎ 通知」の設定は使われなくなります）。

コマンドがすぐ出てこないときは、Discord アプリを一度閉じて開き直してください。

## 更新

`bot/` の中を変更して main に入ると、GitHub Actions が自動でデプロイし直します。
ローカルでの動作確認は `cd bot && npm install && npm test` です（Discord や Cloudflare には接続しません）。

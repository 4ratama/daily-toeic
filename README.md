# TOEIC Daily

通学中にスマホで進める、1日5ターム（1ターム約5分）のTOEIC学習ページです。

- 文法（Part 5）6問 / 語彙（Part 5）6問 / 長文読解（Part 7）3問 / 言い換え単語 8問 / 復習＋文法 6問
- 間違えた問題は翌日の「復習＋文法」で優先して出ます。正解するたびに次の出題までの間隔が伸びます（1→3→7→16→35日）。
- 学習記録はそのスマホのブラウザに保存されます（サーバーには送りません）。
- 設定した時刻（初期値は7:30と21:00、日本時間）に、Discordへ学習ページのリンク付きで通知が届きます。時刻と曜日はアプリの「⚙︎ 通知」から変えられます。

## セットアップ

1. このリポジトリの Settings → Pages で、Source を「Deploy from a branch」、Branch を `main` / `(root)` にします。
   数分で `https://<ユーザー名>.github.io/<リポジトリ名>/` が開けるようになります。
2. Discordのチャンネル設定 → 連携サービス → ウェブフック → 新しいウェブフック → 「ウェブフックURLをコピー」。
3. このリポジトリの Settings → Secrets and variables → Actions → New repository secret で、
   名前 `DISCORD_WEBHOOK_URL`、値に2のURLを貼って保存します。
4. Actions タブ → 「Daily Discord notification」→ Run workflow で、テスト通知が届くか確認します。

## 通知の時刻をアプリから変える

アプリのホーム右上「⚙︎ 通知」で時刻（最大5つ）と曜日を設定し、「保存する」を押します。
保存には最初に1回だけ GitHub のトークンが必要です。

1. https://github.com/settings/personal-access-tokens/new を開きます（Fine-grained token）。
2. Token name は `toeic-daily`、Expiration は好きな期間（最長1年）を選びます。
3. Repository access で「Only select repositories」→ `daily-toeic` を選びます。
4. Permissions → Repository permissions で **Contents** と **Actions** を「Read and write」にします。
5. 「Generate token」を押し、表示された `github_pat_...` をコピーして、アプリの設定画面に貼ります。

トークンはそのスマホのブラウザにだけ保存され、リポジトリには入りません。
仕組み：設定は `config.json` に保存され、GitHub Actions が10分ごとに確認して、その時刻を過ぎたら（最大90分以内）1回だけ送ります。
GitHub側の混雑で、通知が数分〜十数分遅れることがあります。

## iPhoneでアプリのように使う

Safariで学習ページを開き、共有ボタン →「ホーム画面に追加」を押すと、アイコンから全画面で開けます。
Discordアプリの通知をオンにしておくと、通知をタップしてそのまま学習を始められます。

## いつでも単語帳

ホームの「いつでも単語帳」から、毎日の5タームとは別にいつでも単語を練習できます。

- カード：タップでめくり、「覚えた／まだ」に仕分け（左右スワイプでも可）。終わったら「まだ」だけでもう一周。
- 学習：1ラウンド7語。まず4択で意味を選び、正解した語は次に英語を書く問題になり、書けたら「習得」。間違えた語は同じラウンドの少し後にもう一度出ます。
- テスト：問題数と形式（○✕・4択・記述）を選んでまとめて採点。間違えた語だけで再テストもできます。
- マッチ：英語と意味のカードをタップでそろえるタイムアタック（間違えると＋1秒、自己ベストを記録）。
- 単語は `words.json`（950〜990点向け）と、`questions.json` の言い換え・語彙のポイントから自動で作られます。自分の単語は1語ずつ、またはまとめて貼り付けて追加できます。
- 記録はブラウザの `toeic-daily-vocab` に保存されます。

## 問題を増やす

`questions.json` に問題を追加します。文法・語彙は `choices` の1番目が正解です（画面では毎回シャッフルされます）。

## Discordボット（Partごとのスレッドで出題・曜日別リマインド）

Discord の中でボタン式の問題を解けるボットもあります。`/remind` で曜日ごとにリマインド時刻を選べます。
Cloudflare Workers の無料プランで動き、問題はこの `questions.json` を共有します。
セットアップは [bot/README.md](bot/README.md) を見てください。

## iPhoneのホーム画面ウィジェット

Discordや Webアプリは、自分でホーム画面ウィジェットを作れません。そこで、無料アプリ「Scriptable」を使います。

1. App Store で **Scriptable** をインストールします。
2. Scriptable を開き、右上の「＋」で新しいスクリプトを作ります。
3. [widget/toeic-daily-widget.js](widget/toeic-daily-widget.js) の中身を全部コピーして貼り付けます。名前は `TOEIC Daily` にします。
4. ホーム画面を長押し →「＋」→ Scriptable → 中サイズを追加します。
5. 追加したウィジェットを長押し →「ウィジェットを編集」→ Script で `TOEIC Daily` を選びます。

ウィジェットには「今日の1問」（Discordの朝の通知と同じ問題）と、次の学習時刻が出ます。タップすると学習ページが開きます。

### 決まった時刻にアプリを自動で開く（ショートカット）

「ショートカット」アプリ →「オートメーション」→「＋」→「時刻」で通学時間を選び、「すぐに実行」にします。
アクションに「URLを開く」を追加し、`https://4ratama.github.io/daily-toeic/` を入れると、その時刻に学習ページが開きます。

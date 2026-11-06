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

## 問題を増やす

`questions.json` に問題を追加します。文法・語彙は `choices` の1番目が正解です（画面では毎回シャッフルされます）。

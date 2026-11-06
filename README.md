# TOEIC Daily

通学中にスマホで進める、1日5ターム（1ターム約5分）のTOEIC学習ページです。

- 文法（Part 5）6問 / 語彙（Part 5）6問 / 長文読解（Part 7）3問 / 言い換え単語 8問 / 復習＋文法 6問
- 間違えた問題は翌日の「復習＋文法」で優先して出ます。正解するたびに次の出題までの間隔が伸びます（1→3→7→16→35日）。
- 学習記録はそのスマホのブラウザに保存されます（サーバーには送りません）。
- 毎朝7:30と毎晩21:00（日本時間）に、Discordへ学習ページのリンク付きで通知が届きます。

## セットアップ

1. このリポジトリの Settings → Pages で、Source を「Deploy from a branch」、Branch を `main` / `(root)` にします。
   数分で `https://<ユーザー名>.github.io/<リポジトリ名>/` が開けるようになります。
2. Discordのチャンネル設定 → 連携サービス → ウェブフック → 新しいウェブフック → 「ウェブフックURLをコピー」。
3. このリポジトリの Settings → Secrets and variables → Actions → New repository secret で、
   名前 `DISCORD_WEBHOOK_URL`、値に2のURLを貼って保存します。
4. Actions タブ → 「Daily Discord notification」→ Run workflow で、テスト通知が届くか確認します。

## iPhoneでアプリのように使う

Safariで学習ページを開き、共有ボタン →「ホーム画面に追加」を押すと、アイコンから全画面で開けます。
Discordアプリの通知をオンにしておくと、通知をタップしてそのまま学習を始められます。

## 問題を増やす

`questions.json` に問題を追加します。文法・語彙は `choices` の1番目が正解です（画面では毎回シャッフルされます）。

// Discord に登録するスラッシュコマンド
export const COMMANDS = [
  {
    name: "remind",
    description: "リマインドの時刻を曜日ごとに設定します",
    type: 1,
  },
  {
    name: "quiz",
    description: "TOEICの問題を1問出します（Partのスレッド内ではそのPartから出題）",
    type: 1,
    options: [{
      type: 3, name: "part", description: "出題するPart", required: false,
      choices: [
        { name: "Part 5 文法", value: "grammar" },
        { name: "Part 5 語彙", value: "vocab" },
        { name: "Part 7 読解", value: "reading" },
        { name: "Part 7 言い換え", value: "para" },
      ],
    }],
  },
  {
    name: "setup",
    description: "このチャンネルにPart別のスレッドを作り、リマインドの送り先にします",
    type: 1,
    default_member_permissions: "32", // サーバー管理権限のある人だけ
    contexts: [0],
  },
];

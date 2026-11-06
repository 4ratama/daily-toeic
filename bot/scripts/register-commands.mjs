// スラッシュコマンドを Discord に登録する（デプロイのたびに上書き）
import { COMMANDS } from "./commands.mjs";

const { DISCORD_APPLICATION_ID: app, DISCORD_TOKEN: token } = process.env;
if (!app || !token) { console.error("DISCORD_APPLICATION_ID と DISCORD_TOKEN が必要です"); process.exit(1); }
const res = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(COMMANDS),
});
if (!res.ok) { console.error("コマンド登録に失敗:", res.status, await res.text()); process.exit(1); }
console.log("登録したコマンド:", (await res.json()).map(c => "/" + c.name).join(" "));

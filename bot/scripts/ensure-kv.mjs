// KV（設定の保存先）がなければ作り、その id を wrangler.toml に書き込む
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TITLE = "toeic-daily-bot-store";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const find = () => {
  const out = wrangler("kv", "namespace", "list");
  return JSON.parse(out.slice(out.indexOf("["))).find(n => n.title === TITLE || n.title.endsWith(`-${TITLE}`));
};
let ns = find();
if (!ns) {
  console.log("KV を作成します:", TITLE);
  wrangler("kv", "namespace", "create", TITLE);
  ns = find();
}
if (!ns) { console.error("KV の作成に失敗しました"); process.exit(1); }
const toml = readFileSync("wrangler.toml", "utf8").replace("__KV_ID__", ns.id);
writeFileSync("wrangler.toml", toml);
console.log("KV:", ns.id);

// decode.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import aaencode from "./plugins/aaencode.js";
import jsfuck from "./plugins/jsfuck.js";
import jsjiamiV7 from "./plugins/jsjiami_v7.js";
import { prettyFormat } from "./utils/format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_DIR = path.join(__dirname, "input");
const OUTPUT_DIR = path.join(__dirname, "output");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function detect(content) {
  const s = content.slice(0, 200000);
  return {
    isAA: /(\(\(ﾟДﾟ\)\)\[\]|\(ﾟДﾟ\)\[ﾟoﾟ\])/m.test(s),
    isJSFuck:
      /(?:(?:\+|\!|\[|\]|\(|\)){10,})/.test(s) &&
      /Function|return|this/.test(s) === false,
    isJsjiamiV7:
      /jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(s),
  };
}

async function processOne(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const tag = detect(raw);

  let code = raw;

  try {
    if (tag.isAA) code = await aaencode(code);
  } catch (e) {
    console.warn("[AAEncode] failed:", e?.message);
  }

  try {
    if (tag.isJSFuck) {
      const out = await jsfuck(code);
      if (out) code = out;
    }
  } catch (e) {
    console.warn("[JSFuck] failed:", e?.message);
  }

  try {
    if (tag.isJsjiamiV7) {
      const out = await jsjiamiV7(code);
      if (out) code = out;
    }
  } catch (e) {
    console.warn("[jsjiami v7] failed:", e?.message);
  }

  try {
    code = await prettyFormat(code);
  } catch (e) {
    console.warn("[format] failed, return raw");
  }

  return { code }; // 确保这里返回的就是字符串
}

async function main() {
  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".js"));

  if (files.length === 0) {
    console.log("input/ 里没有 .js 文件");
    process.exit(0);
  }

  for (const f of files) {
    const inPath = path.join(INPUT_DIR, f);
    const { code } = await processOne(inPath); // ← 必须 await
    const outPath = path.join(OUTPUT_DIR, f.replace(/\.js$/i, ".deobf.js"));
    fs.writeFileSync(outPath, code, "utf8");
    console.log("✅ Done:", f, "→", path.basename(outPath));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

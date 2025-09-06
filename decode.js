// decode.js —— 严格模式：任一步出错则不写 output
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import aaencode from "./plugins/aaencode.js";
import jsfuck from "./plugins/jsfuck.js";
import jsjiamiV7 from "./plugins/jsjiami_v7.js";
import { prettyFormatStrict } from "./utils/format.js";
import { cleanupToDotAccess } from "./utils/cleanup.js";

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

  if (tag.isAA) {
    code = await aaencode(code);
    if (typeof code !== "string" || !code.length) throw new Error("AAEncode 解码失败");
  }

  if (tag.isJSFuck) {
    const out = await jsfuck(code);
    if (!out) throw new Error("JSFuck 解码失败");
    code = out;
  }

  if (tag.isJsjiamiV7) {
    const out = await jsjiamiV7(code);
    if (!out) throw new Error("jsjiami v7 解码失败");
    code = out;
  }

  // 严格：美化必须成功，否则抛错
  code = await prettyFormatStrict(code);

  // 清理成点访问；失败也视为错误（不写出）
  const cleaned = cleanupToDotAccess(code);
  if (typeof cleaned !== "string" || !cleaned.length) throw new Error("清理失败");
  code = cleaned;

  // 简单自检
  if (/\b_0x1e61\s*\(|\b_0xc3dd0a\s*\(/.test(code)) {
    console.warn("[notice] 残留解码调用（可能有遗漏别名/调用点）");
  }

  return { code };
}

async function main() {
  const files = fs.readdirSync(INPUT_DIR).filter((f) => f.toLowerCase().endsWith(".js"));
  if (files.length === 0) {
    console.log("input/ 里没有 .js 文件");
    return;
  }

  let success = 0, failed = 0;
  for (const f of files) {
    const inPath = path.join(INPUT_DIR, f);
    try {
      const { code } = await processOne(inPath);
      const outPath = path.join(OUTPUT_DIR, f.replace(/\.js$/i, ".deobf.js"));
      fs.writeFileSync(outPath, code, "utf8");
      console.log("✅ Done:", f, "→", path.basename(outPath));
      success++;
    } catch (err) {
      console.error("❌ Failed:", f, "-", err?.message || err);
      failed++;
    }
  }

  console.log(`Summary: ${success} succeeded, ${failed} failed.`);
  // 若要失败时让 CI 直接失败：去掉下一行注释
  // if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  // process.exit(1);
});

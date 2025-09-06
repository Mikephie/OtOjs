// decode.js —— 严格模式：任一步失败就不写入；并打印阶段日志
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

function log(...a) {
  try { console.log("[decode]", ...a); } catch {}
}

function detect(content) {
  const s = content.slice(0, 200000);
  return {
    isAA: /(\(\(ﾟДﾟ\)\)\[\]|\(ﾟДﾟ\)\[ﾟoﾟ\])/m.test(s),
    isJSFuck:
      /(?:(?:\+|\!|\[|\]|\(|\)){10,})/.test(s) && /Function|return|this/.test(s) === false,
    isJsjiamiV7:
      /jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(s),
  };
}

async function processOne(filePath) {
  log("process:", path.basename(filePath));
  const raw = fs.readFileSync(filePath, "utf8");
  const tag = detect(raw);

  let code = raw;

  if (tag.isAA) {
    code = await aaencode(code);
    if (typeof code !== "string" || !code.length) throw new Error("AAEncode 解码失败");
    log("AAEncode ok");
  }

  if (tag.isJSFuck) {
    const out = await jsfuck(code);
    if (!out) throw new Error("JSFuck 解码失败");
    code = out;
    log("JSFuck ok");
  }

  if (tag.isJsjiamiV7) {
    const out = await jsjiamiV7(code);
    if (!out) throw new Error("jsjiami v7 解码失败");
    code = out;
    log("v7 ok");
  }

  code = await prettyFormatStrict(code);
  log("format ok");

  const cleaned = cleanupToDotAccess(code);
  if (typeof cleaned !== "string" || !cleaned.length) throw new Error("清理失败");
  code = cleaned;
  log("cleanup ok");

  if (/\b_0x1e61\s*\(|\b_0xc3dd0a\s*\(|\.call\s*\(|\.apply\s*\(/.test(code)) {
    console.log("Notice:  残留解码调用（可能有遗漏别名/调用点）");
  }

  return { code };
}

async function main() {
  log("scan input/", fs.existsSync(INPUT_DIR) ? fs.readdirSync(INPUT_DIR) : []);
  const files = fs.existsSync(INPUT_DIR)
    ? fs.readdirSync(INPUT_DIR).filter((f) => f.toLowerCase().endsWith(".js"))
    : [];
  log("target files:", files);

  if (files.length === 0) {
    console.log("input/ 里没有 .js 文件");
    return;
  }

  let success = 0;
  let failed = 0;

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
  // 若希望只要有失败就让 CI fail，取消下面的注释：
  // if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  // process.exit(1);
});

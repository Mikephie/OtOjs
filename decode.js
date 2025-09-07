#!/usr/bin/env node
/* eslint-disable */

/* ===== ESM helpers ===== */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path, { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/* ======================= */

/* ===== CJS requires in ESM ===== */
const fs = require("fs");
const vm = require("vm");
const glob = require("glob");

const parser = require("@babel/parser");
const traverseMod = require("@babel/traverse");
const traverse = traverseMod.default || traverseMod;
const genMod = require("@babel/generator");
const generate = genMod.default || genMod;
const t = require("@babel/types");

// prettier v3 的 format 是异步，这里统一用动态 import 以拿到最新实现
async function fmt(code) {
  try {
    const prettier = (await import("prettier")).default;
    return await prettier.format(code, { parser: "babel" });
  } catch {
    return code;
  }
}

/* ===== Consts ===== */
const INPUT_DIR = "input";
const OUTPUT_DIR = "output";
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/* ===== Utils ===== */
function read(file) {
  return fs.readFileSync(file, "utf8");
}
function write(file, s) {
  fs.writeFileSync(file, s);
}

function pick(regex, src) {
  const m = src.match(regex);
  return m ? m[0] : null;
}
function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractFuncAny(code, name) {
  // 支持：function name(...){} 以及 name = function(...) {}
  const re1 = new RegExp(`\\bfunction\\s+${escapeReg(name)}\\s*\\(`, "m");
  const re2 = new RegExp(`\\b${escapeReg(name)}\\s*=\\s*function\\s*\\(`, "m");
  const m = code.match(re1) || code.match(re2);
  if (!m) return null;

  const start = m.index;
  const braceStart = code.indexOf("{", start);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return null;
}
function findStringTableName(src) {
  if (/function\s+_0x1715\s*\(/.test(src)) return "_0x1715";
  // 兜底：找第一个 function _0x????() 且函数体内有 return [ 或 .concat(
  const m = src.match(/function\s+(_0x[0-9a-fA-F]{3,})\s*\(/);
  if (!m) return null;
  const name = m[1];
  const body = extractFuncAny(src, name) || "";
  if (/return\s*\[/.test(body) || /\.concat\s*\(/.test(body)) return name;
  return null;
}
function isStaticString(node) {
  return (
    t.isStringLiteral(node) ||
    (t.isTemplateLiteral(node) && node.expressions.length === 0)
  );
}
function evalStaticString(node) {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node)) {
    return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
  }
  return "";
}

/* ===== 解码器构建（仅装载字符串表和解码器） ===== */
function buildJsjiamiDecoderByName(src, decName) {
  // 尝试找到字符串表函数
  const tableName = findStringTableName(src);
  const tableSrc = tableName ? extractFuncAny(src, tableName) : "";
  // 取解码器源码
  const decSrc = extractFuncAny(src, decName);
  if (!decSrc) return null;

  // 有些样本需要 _0xodH 标记
  const banner =
    pick(/var\s+_0xodH\s*=\s*['"]jsjiami\.com\.v\d['"]\s*;?/i, src) ||
    `var _0xodH = "jsjiami.com.v7";`;

  const bootstrap =
    `
${banner}
var window = {}; var self = {}; var globalThis = global;
` +
    (tableSrc || "") +
    `
${decSrc}
module.exports = {
  table: ${JSON.stringify(tableName || "")},
  decode: function(i, k){
    try { return ${decName}(i, k); } catch(e) { return null; }
  }
};`;

  const mod = { exports: null };
  const ctx = { module: mod, exports: mod.exports, console };
  vm.createContext(ctx);
  try {
    vm.runInContext(bootstrap, ctx, { timeout: 700 });
    if (ctx.module?.exports?.decode) {
      return {
        decode: ctx.module.exports.decode,
        tableName: ctx.module.exports.table || null,
      };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/* ===== 核心：分析 → 提取 → 替换 ===== */
async function deobfOne(file) {
  const src = read(file);
  const base = path.basename(file, ".js");
  const out = path.join(OUTPUT_DIR, `${base}.deobf.js`);

  // 不是 jsjiami 直接美化写出即可（保持流水线有产物）
  if (!/jsjiami\.com\.v\d/i.test(src)) {
    const beautified = await fmt(src);
    write(out, beautified);
    return { ok: true, out, replaced: 0, note: "no-jsjiami-marker" };
  }

  // 先用 AST 找“f(数字, 'key')”模式并统计频率 → 候选解码器名 + 别名
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
    });
  } catch (e) {
    return { ok: false, reason: `parse-failed: ${e.message}` };
  }

  const freq = new Map();
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      const args = p.node.arguments;
      if (
        t.isIdentifier(callee) &&
        args.length >= 2 &&
        t.isNumericLiteral(args[0]) &&
        isStaticString(args[1])
      ) {
        const name = callee.name;
        freq.set(name, (freq.get(name) || 0) + 1);
      }
    },
  });
  if (freq.size === 0) {
    // 没有这种模式，可能是 v5 或已明文
    const beautified = await fmt(src);
    write(out, beautified);
    return { ok: true, out, replaced: 0, note: "no-decode-call-pattern" };
  }

  const candidate = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // 解析别名链：const alias = candidate;
  const aliasSet = new Set([candidate]);
  traverse(ast, {
    VariableDeclarator(p) {
      const id = p.node.id;
      const init = p.node.init;
      if (t.isIdentifier(id) && t.isIdentifier(init)) {
        if (aliasSet.has(init.name)) aliasSet.add(id.name);
      }
    },
  });

  // 构建解码器（按候选真名，不用别名）
  const dec = buildJsjiamiDecoderByName(src, candidate);
  if (!dec) return { ok: false, reason: "decoder-not-found" };

  // 在完整 AST 上执行替换：别名也要替换
  let replaced = 0;
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      const args = p.node.arguments;
      if (
        t.isIdentifier(callee) &&
        aliasSet.has(callee.name) &&
        args.length >= 2 &&
        t.isNumericLiteral(args[0]) &&
        isStaticString(args[1])
      ) {
        const idx = args[0].value;
        const key = evalStaticString(args[1]);
        const val = dec.decode(idx, key);
        if (typeof val === "string") {
          p.replaceWith(t.stringLiteral(val));
          replaced++;
        }
      }
    },
  });

  // 生成并美化
  let code = generate(ast, { comments: false, compact: false }).code;
  code = await fmt(code);
  write(out, code);

  if (replaced === 0) {
    return { ok: false, reason: "no-calls-replaced", out };
  }
  return { ok: true, out, replaced, note: `decoder=${candidate} aliases=[${[...aliasSet].join(",")}] table=${dec.tableName || "?"}` };
}

/* ===== 主程序（异步） ===== */
async function main() {
  const files = glob.sync(`${INPUT_DIR}/*.js`);
  if (files.length === 0) {
    console.log("No input/*.js found, skip.");
    process.exit(0);
  }

  let ok = 0,
    fail = 0;
  for (const f of files) {
    try {
      const res = await deobfOne(f);
      if (res.ok) {
        ok++;
        const extra = res.note ? `, ${res.note}` : "";
        const rep = typeof res.replaced === "number" ? ` (replaced: ${res.replaced})` : "";
        console.log(`✅ Done: ${path.basename(f)} → ${path.basename(res.out)}${rep}${extra}`);
      } else {
        fail++;
        console.log(`❌ Skip: ${path.basename(f)} - ${res.reason}`);
      }
    } catch (e) {
      fail++;
      console.log(`❌ Error: ${path.basename(f)} - ${e.message}`);
    }
  }
  console.log(`Summary: ${ok} succeeded, ${fail} failed.`);
}

main();

#!/usr/bin/env node
/* eslint-disable */

// ---- ESM helpers: allow require & __dirname in "type":"module" projects
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path, { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
// ---- end helpers

// CommonJS-style requires (now safe inside ESM via createRequire)
const fs       = require('fs');
// 注意：上面已用 ESM 导入了 path，这里不要再 require('path')
const vm       = require('vm');
const glob     = require('glob');
const parser   = require('@babel/parser');

// 兼容不同打包产物的 default 导出
const traverseMod  = require('@babel/traverse');
const traverse     = traverseMod.default || traverseMod;

const generateMod  = require('@babel/generator');
const generate     = generateMod.default || generateMod;

const t         = require('@babel/types');

// Prettier 既可能是对象也可能挂在 default 上，这里做个兜底
const prettierMod = require('prettier');
const prettier    = prettierMod.format ? prettierMod : (prettierMod.default || prettierMod);

// 你原来的脚本从这里继续……


const INPUT_DIR = "input";
const OUTPUT_DIR = "output";

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, s) { fs.writeFileSync(file, s); }
function fmt(code) { try { return prettier.format(code, { parser: "babel" }); } catch { return code; } }

function pick(regex, src) {
  const m = src.match(regex);
  return m ? m[0] : null;
}

/** 尝试从源码里抽出 jsjiami 的“字符串表函数”和“解码函数”并在 VM 中调用 */
function buildJsjiamiDecoder(src) {
  // 常见：var _0xodH='jsjiami.com.v7' 或 v6
  const marker = src.includes("jsjiami.com.v") ? "jsjiami" : null;
  if (!marker) return null;

  // 取“返回数组”的函数（装字典的）
  const arrFun = pick(/function\s+_0x[a-f0-9]+\s*\(\)\s*\{[\s\S]+?\}\s*;?/i, src);
  if (!arrFun) return null;

  // 取“RC4/base64 解码器”的函数
  const decFun = pick(/function\s+_0x[a-f0-9]+\s*\([\s\S]+?\)\s*\{[\s\S]+?\}\s*;?/i, src);
  if (!decFun) return null;

  // 找到解码器的函数名（如 _0x1e61 / _0x3cea）
  const decName = (decFun.match(/function\s+(_0x[a-f0-9]+)/i) || [])[1];
  if (!decName) return null;

  // 一些脚本会有 var _0xodH='jsjiami.com.v7'，尽量把它也带上
  const banner = pick(/var\s+_0xodH\s*=\s*['"]jsjiami\.com\.v\d['"]\s*;?/i, src) || "";

  const bootstrap = `
    ${banner}
    ${arrFun}
    ${decFun}
    module.exports = function(i, k){
      try { return ${decName}(i, k); } catch(e) { return null; }
    };
  `;

  const mod = { exports: null };
  const ctx = { module: mod, exports: mod.exports, console };
  vm.createContext(ctx);
  try {
    vm.runInContext(bootstrap, ctx, { timeout: 500 });
    if (typeof ctx.module.exports === "function") {
      return { decode: ctx.module.exports, decName };
    }
  } catch (e) {
    return null;
  }
  return null;
}

/** 对 AST 中的 decoder(i, 'key') 进行计算并替换为字面量字符串 */
function replaceDecodeCalls(ast, decoderName, decodeFn) {
  let replaced = 0;
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee) || callee.name !== decoderName) return;

      const args = path.node.arguments;
      if (args.length >= 2 && t.isNumericLiteral(args[0]) && t.isStringLiteral(args[1])) {
        const idx = args[0].value;
        const key = args[1].value;
        const val = decodeFn(idx, key);
        if (typeof val === "string") {
          path.replaceWith(t.stringLiteral(val));
          replaced++;
        }
      }
    },
  });
  return replaced;
}

function deobfOne(file) {
  const src = read(file);
  const baseName = path.basename(file, ".js");
  const out = path.join(OUTPUT_DIR, `${baseName}.deobf.js`);

  // 仅处理包含 jsjiami 标记的脚本；否则直接跳过（也可按需直接美化）
  if (!/jsjiami\.com\.v\d/.test(src)) {
    return { ok: false, reason: "no-jsjiami-marker" };
  }

  // 解析 AST
  let ast;
  try {
    ast = parser.parse(src, { sourceType: "script", allowReturnOutsideFunction: true });
  } catch (e) {
    return { ok: false, reason: "parse-failed: " + e.message };
  }

  // 构建解码器
  const dec = buildJsjiamiDecoder(src);
  if (!dec) return { ok: false, reason: "decoder-not-found" };

  const replaced = replaceDecodeCalls(ast, dec.decName, dec.decode);
  if (replaced === 0) {
    return { ok: false, reason: "no-calls-replaced" };
  }

  // 生成可读代码并格式化
  let code = generate(ast, { comments: false, compact: false }).code;
  code = fmt(code);

  write(out, code);
  return { ok: true, out, replaced };
}

function main() {
  const files = glob.sync(`${INPUT_DIR}/*.js`);
  if (files.length === 0) {
    console.log("No input/*.js found, skip.");
    process.exit(0);
  }

  let ok = 0, fail = 0;
  files.forEach(f => {
    const res = deobfOne(f);
    if (res.ok) {
      ok++;
      console.log(`✅ Done: ${path.basename(f)} → ${path.basename(res.out)} (replaced: ${res.replaced})`);
    } else {
      fail++;
      console.log(`❌ Skip: ${path.basename(f)} - ${res.reason}`);
    }
  });

  console.log(`Summary: ${ok} succeeded, ${fail} failed.`);
}

main();

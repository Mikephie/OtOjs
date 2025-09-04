#!/usr/bin/env node
// tools/v7_prepass.mjs
// Usage: node tools/v7_prepass.mjs -i input.js -o input.pre.js
// 作用：只执行 sojson/jsjiami v7 的 “字符串表 factory + 映射函数”，把 _0xMAP(0x??,'key') 替换成字面量。
// 修复：不再给 globalThis 赋值，避免只读环境报错；补充常见占位符（_0xodH/version），并尽量使用只读获取。

import fs from "node:fs/promises";

// ---------- CLI ----------
function args() {
  const a = process.argv.slice(2), r = {};
  for (let i=0;i<a.length;i++){
    if (a[i]==="-i") r.i = a[++i];
    else if (a[i]==="-o") r.o = a[++i];
  }
  if (!r.i || !r.o) {
    console.error("Usage: node tools/v7_prepass.mjs -i <input.js> -o <output.js>");
    process.exit(2);
  }
  return r;
}

// ---------- utils ----------
const strip = s => s
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .replace(/(^|[^\S\r\n])\/\/[^\n]*\n/g,'$1\n'); // 保留换行，避免位置信息错乱

function looksLikeV7(code){
  if (/jsjiami\.com\.v7|sojson\.v7/i.test(code)) return true;
  return /_0x[0-9a-fA-F]{3,}\(\s*0x[0-9a-fA-F]+\s*,\s*['"][^'"]+['"]\s*\)/.test(code)
      && /function\s+_0x[0-9a-fA-F]{3,}\s*\(\)\s*\{[\s\S]*?\breturn\b/.test(code)
      && /function\s+_0x[0-9a-fA-F]{3,}\s*\(\s*[a-zA-Z0-9_$]+\s*,\s*[a-zA-Z0-9_$]+\s*\)\s*\{/.test(code);
}

function extractPieces(code){
  const FR = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\)\s*\{[\s\S]*?\breturn\b[\s\S]*?\};?/m;    // factory
  const MR = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*\)\s*\{[\s\S]*?\}/m; // mapper
  const f = FR.exec(code), m = MR.exec(code);
  if (!f || !m) return null;
  return { factoryName:f[1], factorySrc:f[0], mapperName:m[1], mapperSrc:m[0] };
}

function buildSandbox(pieces){
  // 只读获取全局引用，不写入
  const prelude = `
    (function(){
      // 只读拿到全局，不去赋值
      var __g = (typeof globalThis!=='undefined')?globalThis:
                (typeof global!=='undefined')?global:
                (typeof window!=='undefined')?window:
                (typeof self!=='undefined')?self:{};

      // 提供最小环境占位，避免引用报错（不覆盖宿主）
      var window = __g.window || {};
      var self = __g.self || {};
      var document = __g.document || {};
      var navigator = __g.navigator || {};
      var location = __g.location || { href: "" };
      var console = __g.console || { log(){}, warn(){}, error(){} };

      var setTimeout = __g.setTimeout || function(){};
      var setInterval = __g.setInterval || function(){};
      var clearTimeout = __g.clearTimeout || function(){};
      var clearInterval = __g.clearInterval || function(){};

      // Surge/QuanX 兼容占位
      var $done = function(){};
      var $response = {};
      var $request = {};

      // 常见外部变量
      var _0xodH = 'jsjiami.com.v7';
      var version = 'V1.0.9';

      // atob polyfill（Node 里有 Buffer，但为避免依赖，用纯实现）
      var atob = (function(){
        var b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        return function(i){
          var s=String(i).replace(/=+$/,''); if(s.length%4===1) throw new Error('bad b64');
          var o='',bc=0,bs,B,idx=0;
          for(; B=s.charAt(idx++); ~B && (bs=bc%4 ? bs*64+B : B, bc++%4) ? o+=String.fromCharCode(255 & bs >> (-2*bc & 6)) : 0 ){
            B = b.indexOf(B);
          }
          return o;
        };
      })();

      // 导出一个对象空间，避免污染外层
      var __exports = {};
  `;
  const tail = `
      return __exports;
    })()
  `;

  // 把 factory 与 mapper 放在同一 IIFE 内执行（只读环境下应当安全）
  const src = prelude
    + "\n" + pieces.factorySrc + "\n"
    + pieces.mapperSrc + "\n"
    + `__exports.mapfn = ${pieces.mapperName};`
    + tail;

  try {
    const fn = new Function("return " + src);
    const res = fn();
    if (!res || typeof res.mapfn !== "function") return null;
    return res;
  } catch (e) {
    // 为了调试方便，把第一条原因打印到控制台，但不抛出（外层会记录失败并透传）
    // console.error("[v7-prepass] sandbox error:", e && e.message);
    return null;
  }
}

function replaceCalls(code, pieces, mapfn){
  // 严格模式：只替换 _0xMAP(0x123,'salt') 形态；避免误伤
  const callRe = new RegExp(
    pieces.mapperName.replace(/\$/g,"\\$")
    + String.raw`\(\s*(0x[0-9a-fA-F]+)\s*,\s*['"]([^'"]+)['"]\s*\)`,
    "g"
  );
  const seen = new Map(); let m;
  while ((m = callRe.exec(code))) {
    const idxHex = m[1], key = m[2], tk = idxHex+"::"+key;
    if (!seen.has(tk)) {
      let val = null;
      try { val = mapfn(Number(idxHex), key); } catch(_){}
      if (typeof val !== "string") val = null;
      seen.set(tk, val);
    }
  }
  let out = code;
  for (const [tk, val] of seen.entries()) {
    const [idxHex, key] = tk.split("::");
    const lit = (val!==null) ? JSON.stringify(val)
              : `/*v7_unresolved(${idxHex},${JSON.stringify(key)})*/`;
    const one = new RegExp(
      pieces.mapperName.replace(/\$/g,"\\$")
      + String.raw`\(\s*` + idxHex
      + String.raw`\s*,\s*['"]`
      + key.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&')
      + String.raw`['"]\s*\)`,
      "g"
    );
    out = out.replace(one, lit);
  }
  return out;
}

// ---------- main ----------
async function main(){
  const { i, o } = (()=>{ const {i:oIn,o:oOut}=args(); return { i:oIn, o:oOut }; })();
  const raw  = await fs.readFile(i, "utf8");
  const code = strip(raw);

  if (!looksLikeV7(code)) {
    await fs.writeFile(o, raw, "utf8");
    console.log("[v7-prepass] passthrough (not v7)");
    return;
  }
  const pieces = extractPieces(code);
  if (!pieces) {
    await fs.writeFile(o, raw, "utf8");
    console.log("[v7-prepass] pieces not found (passthrough)");
    return;
  }
  const box = buildSandbox(pieces);
  if (!box) {
    await fs.writeFile(o, raw, "utf8");
    console.log("[v7-prepass] sandbox failed (passthrough)");
    return;
  }
  const out = replaceCalls(raw, pieces, box.mapfn);
  await fs.writeFile(o, out, "utf8");
  console.log("[v7-prepass] replaced mapped string calls");
}

main().catch(e=>{ console.error(e); process.exit(1); });

#!/usr/bin/env node
// Usage: node tools/v7_prepass.mjs -i input.js -o input.pre.js
// 作用：只执行 jsjiami/sojson v7 的“字符串表 factory + 映射函数”，把 _0xMAP(0x??,'key') 替换成字面量。
// 特别处理：沙箱里补了常见外部变量（_0xodH/version），避免 factory 执行失败。

import fs from "node:fs/promises";

// -------------------- CLI --------------------
function args() {
  const a = process.argv.slice(2); const r = {};
  for (let i=0;i<a.length;i++) {
    if (a[i]==="-i") r.i = a[++i];
    else if (a[i]==="-o") r.o = a[++i];
  }
  if (!r.i || !r.o) {
    console.error("Usage: node tools/v7_prepass.mjs -i <input.js> -o <output.js>");
    process.exit(2);
  }
  return r;
}

// -------------------- utils --------------------
const strip = s => s
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .replace(/(^|[^\S\r\n])\/\/[^\n]*\n/g,'$1\n'); // 保留行尾换行

function looksLikeV7(code){
  if (/jsjiami\.com\.v7|sojson\.v7/i.test(code)) return true;
  // 常见特征：_0x??(0x123,'salt') + 一个无参 factory 函数 + 一个两参 mapper 函数
  return /_0x[0-9a-fA-F]{3,}\(\s*0x[0-9a-fA-F]+\s*,\s*['"][^'"]+['"]\s*\)/.test(code)
      && /function\s+_0x[0-9a-fA-F]{3,}\s*\(\)\s*\{[\s\S]*?\breturn\b/.test(code)
      && /function\s+_0x[0-9a-fA-F]{3,}\s*\(\s*[a-zA-Z0-9_$]+\s*,\s*[a-zA-Z0-9_$]+\s*\)\s*\{/.test(code);
}

function extractPieces(code){
  // factory：通常是 function _0x1715(){ ... return [ ... ]; }
  const FR = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\)\s*\{[\s\S]*?\breturn\b[\s\S]*?\};?/m;
  // mapper：通常是 function _0x1e61(a,b){ ... }
  const MR = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*\)\s*\{[\s\S]*?\}/m;
  const f = FR.exec(code);
  const m = MR.exec(code);
  if (!f || !m) return null;
  return {
    factoryName: f[1],
    factorySrc:  f[0],
    mapperName:  m[1],
    mapperSrc:   m[0],
  };
}

function buildSandbox(pieces){
  // 注意：补上 _0xodH/version，以免 factory 里引用时报错
  const prelude = `
    var window={},globalThis=globalThis||{},self={};
    var document={},navigator={},location={href:""};
    var console={log(){},warn(){},error(){}};
    var setTimeout=function(){},setInterval=function(){},clearTimeout=function(){},clearInterval=function(){};
    var $done=function(){},$response={},$request={};
    // 一些常见外部符号占位
    var _0xodH = 'jsjiami.com.v7';
    var version = 'V1.0.9';
    // atob polyfill
    var atob=(function(){var b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';return function(i){var s=String(i).replace(/=+$/,'');if(s.length%4===1)throw new Error('bad b64');var o='',bc=0,bs,B,idx=0;for(;B=s.charAt(idx++);~B&&(bs=bc%4?bs*64+B:B,bc++%4)?o+=String.fromCharCode(255&bs>>(-2*bc&6)):0){B=b.indexOf(B);}return o;};})();
  `;
  const src = prelude
    + "\n" + pieces.factorySrc + "\n"
    + pieces.mapperSrc + "\n"
    + `return { mapfn: ${pieces.mapperName} };`;

  try {
    const fn = new Function(src);
    const res = fn();
    return (res && typeof res.mapfn === "function") ? res : null;
  } catch (e) {
    return null;
  }
}

function replaceCalls(code, pieces, mapfn){
  // 只替换严格形态：_0xMAP(0x123,'salt')
  const callRe = new RegExp(
    pieces.mapperName.replace(/\$/g,"\\$")
    + String.raw`\(\s*(0x[0-9a-fA-F]+)\s*,\s*['"]([^'"]+)['"]\s*\)`,
    "g"
  );

  const seen = new Map();
  let m;
  while ((m = callRe.exec(code))) {
    const idxHex = m[1];
    const key    = m[2];
    const token  = `${idxHex}::${key}`;
    if (!seen.has(token)) {
      let val = null;
      try { val = mapfn(Number(idxHex), key); } catch (_){}
      if (typeof val !== "string") val = null;
      seen.set(token, val);
    }
  }

  let out = code;
  for (const [token, val] of seen.entries()) {
    const [idxHex, key] = token.split("::");
    const lit = (val !== null) ? JSON.stringify(val)
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

// -------------------- main --------------------
async function main(){
  const { i:oIn, o:oOut } = (()=>{ const {i,o}=args(); return {i,o}; })();
  const raw  = await fs.readFile(oIn, "utf8");
  const code = strip(raw);

  if (!looksLikeV7(code)) {
    await fs.writeFile(oOut, raw, "utf8");
    console.log("[v7-prepass] passthrough (not v7)");
    return;
  }

  const pieces = extractPieces(code);
  if (!pieces) {
    await fs.writeFile(oOut, raw, "utf8");
    console.log("[v7-prepass] pieces not found (passthrough)");
    return;
  }

  const box = buildSandbox(pieces);
  if (!box) {
    await fs.writeFile(oOut, raw, "utf8");
    console.log("[v7-prepass] sandbox failed (passthrough)"); // 若仍失败，主链路继续，但建议贴出源码让我再放宽适配
    return;
  }

  const out = replaceCalls(raw, pieces, box.mapfn);
  await fs.writeFile(oOut, out, "utf8");
  console.log("[v7-prepass] replaced mapped string calls");
}

main().catch(e=>{ console.error(e); process.exit(1); });

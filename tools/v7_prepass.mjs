#!/usr/bin/env node
/**
 * tools/v7_prepass.mjs (full)
 * 作用：sojson/jsjiami v7 预处理，把 _0xMAP(0x??,'salt') 替换为明文字面量。
 * 只执行“字符串表工厂 + 映射函数”，不执行业务逻辑；失败则透传。
 * 用法：
 *   node tools/v7_prepass.mjs -i input.js -o input.pre.js
 * 调试：
 *   PREPASS_DEBUG=1 node tools/v7_prepass.mjs -i input.js -o input.pre.js
 */

import fs from "node:fs/promises";

const DEBUG = process.env.PREPASS_DEBUG === "1";

// ---------------- CLI ----------------
function parseArgs(){
  const a = process.argv.slice(2), r = {};
  for (let i=0;i<a.length;i++){
    if (a[i] === "-i") r.i = a[++i];
    else if (a[i] === "-o") r.o = a[++i];
  }
  if (!r.i || !r.o) {
    console.error("Usage: node tools/v7_prepass.mjs -i <input.js> -o <output.js>");
    process.exit(2);
  }
  return r;
}

// --------------- utils ----------------
const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g,'')
   .replace(/(^|[^\S\r\n])\/\/[^\n]*\n/g,'$1\n'); // 保留换行

function looksLikeV7(code){
  if (/jsjiami\.com\.v7|sojson\.v7/i.test(code)) return true;
  return /_0x[0-9a-fA-F]{3,}\(\s*0x[0-9a-fA-F]+\s*,\s*['"][^'"]+['"]\s*\)/.test(code);
}

function findMatchingBrace(text, openIndex){
  let depth = 0;
  for (let i=openIndex; i<text.length; i++){
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// --------- mapper 名识别（加强版）---------
function detectMapperName(source){
  // 1) const a = _0x1e61;
  let m = /const\s+[_$a-zA-Z0-9]+\s*=\s*(_0x[0-9a-fA-F]{3,})\s*;/.exec(source);
  if (m) return m[1];
  // 2) var/let a = _0x1e61;
  m = /(var|let)\s+[_$a-zA-Z0-9]+\s*=\s*(_0x[0-9a-fA-F]{3,})\s*;/.exec(source);
  if (m) return m[2];
  // 3) 出现频度最高的 callee：_0x????(0x..,'salt')
  const rx = /(_0x[0-9a-fA-F]{3,})\s*\(\s*0x[0-9a-fA-F]+\s*,\s*['"][^'"]+['"]\s*\)/g;
  const cnt = new Map(); let t;
  while ((t = rx.exec(source))) {
    const name = t[1];
    cnt.set(name, (cnt.get(name) || 0) + 1);
  }
  if (cnt.size) {
    return Array.from(cnt.entries()).sort((a,b)=>b[1]-a[1])[0][0];
  }
  return null;
}

// --------- 工厂函数提取（容忍变体）---------
function extractFactory(source){
  const candidates = [];
  const reDecl = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\)\s*\{/g;
  let m;
  while ((m = reDecl.exec(source))) {
    const name = m[1];
    const start = m.index;
    const bodyStart = reDecl.lastIndex - 1; // at "{"
    const end = findMatchingBrace(source, bodyStart);
    if (end > start) {
      const fn = source.slice(start, end+1);
      // 宽松判断：函数体 600 字节内出现 return 和 "["（数组），并优先包含 concat/split
      if (/\breturn\b[\s\S]{0,600}\[/.test(fn)) {
        candidates.push({ name, fn, score: /\.(concat|split)\s*\(/.test(fn) ? 2 : 1 });
      }
    }
  }
  if (!candidates.length) return null;
  // 优先 _0x1715，其次 score 高者，再其次第一个
  const byName = candidates.find(c => c.name === "_0x1715");
  if (byName) return byName;
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0];
}

// --------- mapper 源码提取（含包裹函数回退）---------
function extractFunctionSourceByName(source, name){
  // A) 顶层函数声明：function name(...) { ... }
  let re = new RegExp(String.raw`function\s+${name.replace(/\$/g,"\\$")}\s*\([^)]*\)\s*\{`, "m");
  let m = re.exec(source);
  if (m) {
    const start = m.index, bodyStart = m.index + m[0].length - 1;
    const end = findMatchingBrace(source, bodyStart);
    if (end > start) return source.slice(start, end+1);
  }
  // B) 顶层赋值式：name = function(...) { ... }
  re = new RegExp(String.raw`${name.replace(/\$/g,"\\$")}\s*=\s*function\s*$begin:math:text$[^)]*$end:math:text$\s*\{`, "m");
  m = re.exec(source);
  if (m) {
    const start = m.index, bodyStart = m.index + m[0].length - 1;
    const end = findMatchingBrace(source, bodyStart);
    if (end > start) return source.slice(start, end+1);
  }
  // C) 包裹函数回退：找包含 “name = function(” 的外层函数块
  const wrapRe = /function\s+(_0x[0-9a-fA-F]{3,})\s*\([^)]*\)\s*\{/g;
  let w;
  while ((w = wrapRe.exec(source))) {
    const wStart = w.index, wBodyStart = w.index + w[0].length - 1;
    const wEnd = findMatchingBrace(source, wBodyStart);
    if (wEnd <= wStart) continue;
    const block = source.slice(wStart, wEnd+1);
    if (new RegExp(String.raw`${name.replace(/\$/g,"\\$")}\s*=\s*function\s*\(`).test(block)) {
      return block; // 整段里包含二次赋值
    }
  }
  return null;
}

// --------- 最小沙箱，仅执行工厂+mapper ----------
function buildSandbox(factorySrc, mapperSrc){
  const prelude = `
    (function(){
      "use strict";
      var _0xodH = 'jsjiami.com.v7';
      var version = 'V1.0.9';
      var atob=(function(){var b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';return function(i){var s=String(i).replace(/=+$/,'');if(s.length%4===1)throw new Error('bad b64');var o='',bc=0,bs,B,idx=0;for(;B=s.charAt(idx++);~B&&(bs=bc%4?bs*64+B:B,bc++%4)?o+=String.fromCharCode(255&bs>>(-2*bc&6)):0){B=b.indexOf(B);}return o;};})();
      var window={},self={},document={},navigator={},location={href:""},console={log(){},warn(){},error(){}};
      var setTimeout=function(){},setInterval=function(){},clearTimeout=function(){},clearInterval=function(){};
      var $done=function(){},$response={},$request={};
  `;
  const tail = `
      return { mapfn: mapref };
    })()
  `;
  // 将 mapper 重写成“var mapref = function(a,b){...}”以脱离真实名字
  let mapperRewritten = mapperSrc
    .replace(/^function\s+(_0x[0-9a-fA-F]{3,})\s*\(/, "var mapref = function(") // 函数声明式
    .replace(/^([ \t]*)([_$a-zA-Z0-9]+)\s*=\s*function\s*\(/, "$1var mapref = function("); // 赋值式
  const src = "return " + prelude + "\n" + factorySrc + "\n" + mapperRewritten + "\n" + tail;
  try{
    const fn = new Function(src);
    const res = fn();
    if (!res || typeof res.mapfn !== "function") return null;
    return res;
  }catch(e){
    if (DEBUG) console.error("[v7-prepass] sandbox error:", e && (e.stack || e.message || e));
    return null;
  }
}

// --------- 替换调用 ----------
function replaceCalls(fullCode, mapperName, mapfn){
  const callRe = new RegExp(
    mapperName.replace(/\$/g,"\\$")
    + String.raw`\(\s*(0x[0-9a-fA-F]+)\s*,\s*['"]([^'"]+)['"]\s*\)`,
    "g"
  );
  const seen = new Map(); let m;
  while ((m = callRe.exec(fullCode))) {
    const idxHex = m[1], key = m[2], tk = idxHex + "::" + key;
    if (!seen.has(tk)) {
      let val = null;
      try { val = mapfn(Number(idxHex), key); } catch(_){}
      if (typeof val !== "string") val = null;
      seen.set(tk, val);
    }
  }
  let out = fullCode;
  for (const [tk, val] of seen.entries()) {
    const [idxHex, key] = tk.split("::");
    const lit = (val!==null) ? JSON.stringify(val)
      : `/*v7_unresolved(${idxHex},${JSON.stringify(key)})*/`;
    const one = new RegExp(
      mapperName.replace(/\$/g,"\\$")
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

// --------------- main ----------------
async function main(){
  const { i:inPath, o:outPath } = parseArgs();
  const raw = await fs.readFile(inPath, "utf8");
  const code = strip(raw);

  if (!looksLikeV7(code)) {
    await fs.writeFile(outPath, raw, "utf8");
    console.log("[v7-prepass] passthrough (not v7)");
    return;
  }

  // 1) 确定 mapper 名
  const mapperName = detectMapperName(code) || "_0x1e61";

  // 2) 提取工厂函数
  const fac = extractFactory(code);
  if (!fac) {
    await fs.writeFile(outPath, raw, "utf8");
    console.log("[v7-prepass] factory not found (passthrough)");
    return;
  }

  // 3) 提取 mapper 源码（含包裹函数回退）
  const mapperSrc = extractFunctionSourceByName(code, mapperName);
  if (!mapperSrc) {
    await fs.writeFile(outPath, raw, "utf8");
    console.log("[v7-prepass] mapper source not found (passthrough)");
    return;
  }

  // 4) 沙箱执行两函数
  const box = buildSandbox(fac.fn, mapperSrc);
  if (!box || typeof box.mapfn !== "function") {
    await fs.writeFile(outPath, raw, "utf8");
    console.log("[v7-prepass] sandbox failed (passthrough)");
    return;
  }

  // 5) 替换调用
  const out = replaceCalls(raw, mapperName, box.mapfn);
  await fs.writeFile(outPath, out, "utf8");
  console.log("[v7-prepass] replaced mapped string calls");
}

main().catch(e=>{ console.error(e); process.exit(1); });
#!/usr/bin/env node
// tools/v7_prepass.mjs (v5)
// 目的：仅执行 sojson/jsjiami v7 的 _0x1715（工厂）与 mapper 函数，把 _0xMAP(0x??,'salt') 替换成明文字面量。
// 特点：
// - 不执行整段前导 IIFE，避免陌生依赖导致 sandbox 失败
// - 支持 mapper 的 "函数声明" 与 "变量赋值式函数" 两种写法
// - 失败即透传，不阻断主流程
import fs from "node:fs/promises";

const DEBUG = process.env.PREPASS_DEBUG === "1";

// ---------------- CLI ----------------
function args(){
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

// --------------- utils ----------------
const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g,'')
   .replace(/(^|[^\S\r\n])\/\/[^\n]*\n/g,'$1\n');

function looksLikeV7(code){
  if (/jsjiami\.com\.v7|sojson\.v7/i.test(code)) return true;
  return /_0x[0-9a-fA-F]{3,}\(\s*0x[0-9a-fA-F]+\s*,\s*['"][^'"]+['"]\s*\)/.test(code);
}

function detectMapperName(source){
  // 例：const _0xc3dd0a = _0x1e61;
  const m = /const\s+[_$a-zA-Z0-9]+\s*=\s*(_0x[0-9a-fA-F]{3,})\s*;/.exec(source);
  return m ? m[1] : null;
}

function extractFunctionSourceByName(source, name){
  // 支持两种： function name(a,b){...}   或   name = function(a,b){...}
  // 1) 函数声明
  let re = new RegExp(String.raw`function\s+${name.replace(/\$/g,"\\$")}\s*$begin:math:text$[^)]*$end:math:text$\s*\{`, "m");
  let m = re.exec(source);
  if (m) {
    const start = m.index;
    const bodyStart = m.index + m[0].length - 1; // at "{"
    const end = findMatchingBrace(source, bodyStart);
    if (end > start) return source.slice(start, end+1);
  }
  // 2) 变量赋值式
  re = new RegExp(String.raw`${name.replace(/\$/g,"\\$")}\s*=\s*function\s*$begin:math:text$[^)]*$end:math:text$\s*\{`, "m");
  m = re.exec(source);
  if (m) {
    const start = m.index;
    const bodyStart = m.index + m[0].length - 1;
    const end = findMatchingBrace(source, bodyStart);
    if (end > start) return source.slice(start, end+1);
  }
  return null;
}

function findMatchingBrace(text, openIndex){
  // openIndex 指向 '{' 位置
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

function extractFactory(source){
  // 常见命名 _0x1715 ；也兼容其它 _0x???? 模式，只要是 “无参函数 + return [...]” 的函数
  const candidates = [];
  const reDecl = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\)\s*\{/g;
  let m;
  while ((m = reDecl.exec(source))) {
    const name = m[1];
    const start = m.index;
    const bodyStart = reDecl.lastIndex - 1;
    const end = findMatchingBrace(source, bodyStart);
    if (end > start) {
      const fn = source.slice(start, end+1);
      if (/\breturn\b[\s\S]{0,200}\[/.test(fn)) { // 里面不严谨检测一下返回数组
        candidates.push({ name, fn });
      }
    }
  }
  // 优先 _0x1715
  const hit = candidates.find(c => c.name === "_0x1715") || candidates[0];
  return hit || null;
}

function buildSandbox(factorySrc, mapperSrc){
  const prelude = `
    (function(){
      "use strict";
      // 最小环境
      var _0xodH = 'jsjiami.com.v7';
      var version = 'V1.0.9';
      var atob=(function(){var b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';return function(i){var s=String(i).replace(/=+$/,'');if(s.length%4===1)throw new Error('bad b64');var o='',bc=0,bs,B,idx=0;for(;B=s.charAt(idx++);~B&&(bs=bc%4?bs*64+B:B,bc++%4)?o+=String.fromCharCode(255&bs>>(-2*bc&6)):0){B=b.indexOf(B);}return o;};})();
      var window={},self={},document={},navigator={},location={href:""},console={log(){},warn(){},error(){}};
      var setTimeout=function(){},setInterval=function(){},clearTimeout=function(){},clearInterval=function(){};
      var $done=function(){},$response={},$request={};
  `;
  const tail = `
      return { mapfn: ${/* mapper name is defined in snippet */""}mapref };
    })()
  `;

  // 为了不关心真实名字，把 mapper 源变成 “var mapref = function(a,b){...}”
  let mapperRewritten = mapperSrc
    .replace(/^function\s+(_0x[0-9a-fA-F]{3,})\s*\(/, "var mapref = function(")       // 函数声明
    .replace(/^([ \t]*)([_$a-zA-Z0-9]+)\s*=\s*function\s*\(/, "$1var mapref = function("); // 变量赋值式

  const src = [
    "return ",
    prelude,
    "\n", factorySrc, "\n",
    mapperRewritten, "\n",
    tail
  ].join("");

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

function replaceCalls(fullCode, mapperName, mapfn){
  const callRe = new RegExp(
    mapperName.replace(/\$/g,"\\$")
    + String.raw`\(\s*(0x[0-9a-fA-F]+)\s*,\s*['"]([^'"]+)['"]\s*\)`,
    "g"
  );
  const seen = new Map(); let m;
  while ((m = callRe.exec(fullCode))) {
    const idxHex = m[1], key = m[2], tk = idxHex+"::"+key;
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
  const { i:inPath, o:outPath } = args();
  const raw = await fs.readFile(inPath, "utf8");
  const code = strip(raw);

  if (!looksLikeV7(code)) {
    await fs.writeFile(outPath, raw, "utf8");
    console.log("[v7-prepass] passthrough (not v7)");
    return;
  }

  // 1) 确定 mapper 名（例如 _0x1e61）
  const mapperName = detectMapperName(code) || "_0x1e61";

  // 2) 抽出 _0x1715 工厂函数源码
  const fac = extractFactory(code);
  if (!fac) {
    await fs.writeFile(outPath, raw, "utf8");
    console.log("[v7-prepass] factory not found (passthrough)");
    return;
  }

  // 3) 抽出 mapper 源码（支持两种写法）
  const mapperSrc = extractFunctionSourceByName(code, mapperName);
  if (!mapperSrc) {
    await fs.writeFile(outPath, raw, "utf8");
    console.log("[v7-prepass] mapper source not found (passthrough)");
    return;
  }

  // 4) 搭沙箱并执行这两个函数
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